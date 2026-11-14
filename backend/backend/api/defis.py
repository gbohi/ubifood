"""
Défis et badges : un programme a une date et heure de début et de fin
(un autre programme : le dupliquer ou en créer un nouveau ; deux programmes
programmés ne peuvent pas se chevaucher).

Défis (objectif et points réglables ; un défi à 0 est désactivé) :
  serie     « Fidèle »            commander N jours de service DE SUITE. Jours de
                                  service = jours où un menu est publié dans les
                                  agences de l'employé (week-ends et jours fériés
                                  sans menu ne cassent pas la série) ;
  plats     « Gourmet curieux »   goûter N plats différents (jamais commandés
                                  avant le début si plats_nouveaux) ;
  avis      « Critique culinaire » donner son avis sur N repas de la période ;
  retraits  « Zéro oubli »        retirer TOUS ses repas de la période (au moins
                                  retraits_minimum commandés) — constaté à la clôture.
Comptent les commandes non annulées dont la date de repas tombe dans la
période (du jour de début au jour de fin) ; les heures fixent l'ouverture et
la fermeture du jeu. Commandes passées et avis donnés pendant une suspension
du jeu : ne comptent pas. Chaque défi rapporte ses points une fois ; badge à la clé.
Défi réussi pendant le jeu : notification tout de suite (tâche planifiée ou
ouverture de l'écran). À la clôture (à partir de CLOTURE_DELAI_JOURS jours
après le jour de fin : retraits de la nuit), tout est recalculé (une commande annulée entre-temps peut faire
perdre un défi), puis chaque employé reçoit la récompense du plus haut
palier atteint (stock éventuel attribué par classement : points, puis
défis réussis le plus tôt).

API employé : GET defis/ (programme en cours, ma progression, paliers, badges, historique)
API administration (lecture : gestionnaires ; écriture : administrateurs)
  GET/POST admin/defis/ · GET/PUT/DELETE admin/defis/<id>/ · POST admin/defis/<id>/programmer|annuler|cloturer/
  GET admin/defis/<id>/suivi/   progression de chaque employé (ou bilan après clôture)
"""
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from . import gains
from . import suspensions as _susp
from .models import (
    Agence, AvisPlat, CampagneDefis, Commande, DefiReussi, Menu, PalierDefis, ResultatDefis, User,
)
from .permissions import IsAuthenticated, ReadGestionnaireWriteAdmin

CLOTURE_DELAI_JOURS = 2   # clôture possible à partir du surlendemain du jour de fin (retraits de la nuit)
MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre',
        'novembre', 'décembre']
DEFIS = {
    'serie':    {'nom': 'Fidèle', 'icone': 'ri-fire-line'},
    'plats':    {'nom': 'Gourmet curieux', 'icone': 'ri-restaurant-2-line'},
    'avis':     {'nom': 'Critique culinaire', 'icone': 'ri-star-smile-line'},
    'retraits': {'nom': 'Zéro oubli', 'icone': 'ri-checkbox-circle-line'},
}


def _iso(dt):
    return timezone.localtime(dt).isoformat() if dt else None


def bornes(c):
    """Jours de repas comptés : du jour de début au jour de fin."""
    return timezone.localdate(c.debut), timezone.localdate(c.fin)


def _q(dt):
    return timezone.localtime(dt).strftime('%d/%m/%Y à %H:%M')


def libelle_periode(c):
    return f"du {_q(c.debut)} au {_q(c.fin)}"


def cloture_possible_le(c):
    return bornes(c)[1] + timedelta(days=CLOTURE_DELAI_JOURS)


def etat(c, maintenant=None):
    maintenant = maintenant or timezone.now()
    if c.annule_le:
        return 'annule'
    if not c.publie_le:
        return 'brouillon'
    if c.cloture_le:
        return 'cloture'
    if maintenant < c.debut:
        return 'a_venir'
    if maintenant < c.fin:
        return 'en_cours'
    return 'a_cloturer'


LIBELLES_ETAT = {'annule': 'Annulé', 'brouillon': 'Brouillon', 'cloture': 'Clôturé', 'a_venir': 'Programmé',
                 'en_cours': 'En cours', 'a_cloturer': 'À clôturer'}


def defis_actifs(c):
    """[(code, objectif, points, description)] des défis activés."""
    res = []
    if c.serie_jours and c.serie_points:
        res.append(('serie', c.serie_jours, c.serie_points, f"Commander {c.serie_jours} jours de service de suite"))
    if c.plats_nombre and c.plats_points:
        res.append(('plats', c.plats_nombre, c.plats_points,
                    f"Goûter {c.plats_nombre} plats différents" + (" jamais commandés avant" if c.plats_nouveaux else "")))
    if c.avis_nombre and c.avis_points:
        res.append(('avis', c.avis_nombre, c.avis_points, f"Donner votre avis sur {c.avis_nombre} repas"))
    if c.retraits_points:
        res.append(('retraits', c.retraits_minimum, c.retraits_points,
                    f"Retirer tous vos repas de la période (au moins {c.retraits_minimum} commandés, aucun oublié)"))
    return res


def destinataires(c, maintenant=None):
    from .jeux import destinataires_agences
    return destinataires_agences(list(c.agences.values_list('id', flat=True)), maintenant)


# ══════════════════════════════════════════════════════════════
# PROGRESSION
# ══════════════════════════════════════════════════════════════

def progression(c, user_ids, aujourdhui=None):
    """{user_id: {serie, plats, avis, retraits}} calculé sur les commandes de la période."""
    from .jeux import agences_actuelles
    from .suspensions import exclure_suspensions
    aujourdhui = aujourdhui or timezone.localdate()
    debut, fin = bornes(c)
    ids = list(user_ids)
    jours_cmd, plats, statuts = defaultdict(set), defaultdict(set), defaultdict(list)
    commandes = exclure_suspensions(
        Commande.objects.filter(user_id__in=ids, menu__date_menu__range=(debut, fin)).exclude(statut='annulee'),
        'date_commande', 'defis', c.id)
    for uid, d, plat, statut in commandes.values_list('user_id', 'menu__date_menu', 'plat_id', 'statut'):
        jours_cmd[uid].add(d)
        plats[uid].add(plat)
        statuts[uid].append((d, statut))
    if c.plats_nouveaux:
        deja = defaultdict(set)
        for uid, plat in (Commande.objects.filter(user_id__in=ids, menu__date_menu__lt=debut).exclude(statut='annulee')
                          .values_list('user_id', 'plat_id').distinct()):
            deja[uid].add(plat)
        plats = {u: p - deja.get(u, set()) for u, p in plats.items()}
    avis = defaultdict(int)
    for uid in (exclure_suspensions(AvisPlat.objects.filter(user_id__in=ids, commande__menu__date_menu__range=(debut, fin)),
                                    'created_at', 'defis', c.id).values_list('user_id', flat=True)):
        avis[uid] += 1
    # Jours de service par agence
    service_agence, tous = defaultdict(set), set()
    for ag, d in (Menu.objects.filter(date_menu__range=(debut, fin), publie=True, masque=False)
                  .values_list('agence_id', 'date_menu').distinct()):
        service_agence[ag].add(d)
        tous.add(d)
    agences = agences_actuelles(ids)
    res = {}
    for uid in ids:
        ags = agences.get(uid, set())
        jours = set().union(*(service_agence.get(a, set()) for a in ags)) if ags else set(tous)
        jours |= jours_cmd.get(uid, set())
        meilleure = courante = 0
        for d in sorted(jours):
            if d in jours_cmd.get(uid, set()):
                courante += 1
                meilleure = max(meilleure, courante)
            else:
                courante = 0
        st = statuts.get(uid, [])
        res[uid] = {
            'serie': meilleure, 'serie_courante': courante if sorted(jours) else 0,
            'plats': len(plats.get(uid, set())), 'avis': avis.get(uid, 0),
            'commandes': len(st), 'retires': sum(1 for _, s in st if s == 'retiree'),
            'oublies': sum(1 for d, s in st if s == 'en_attente' and d < aujourdhui),
        }
    return res


def reussis(c, p, final=False):
    """Codes des défis réussis d'après la progression p (« retraits » seulement à la clôture)."""
    r = set()
    if c.serie_jours and c.serie_points and p['serie'] >= c.serie_jours:
        r.add('serie')
    if c.plats_nombre and c.plats_points and p['plats'] >= c.plats_nombre:
        r.add('plats')
    if c.avis_nombre and c.avis_points and p['avis'] >= c.avis_nombre:
        r.add('avis')
    if final and c.retraits_points and p['commandes'] >= max(1, c.retraits_minimum) and p['retires'] == p['commandes']:
        r.add('retraits')
    return r


def points_du(c, code):
    return {'serie': c.serie_points, 'plats': c.plats_points, 'avis': c.avis_points,
            'retraits': c.retraits_points}[code]


def verifier(c, user_ids, maintenant=None):
    """Enregistre et notifie les défis nouvellement réussis (mois en cours ou à clôturer)."""
    maintenant = maintenant or timezone.now()
    from .suspensions import suspendu
    if etat(c, maintenant) not in ('en_cours', 'a_cloturer') or suspendu('defis', c.id):
        return 0
    prog = progression(c, user_ids, timezone.localdate(maintenant))
    deja = defaultdict(set)
    for uid, code in DefiReussi.objects.filter(campagne=c, user_id__in=list(prog)).values_list('user_id', 'defi'):
        deja[uid].add(code)
    nouveaux, messages = [], []
    for uid, p in prog.items():
        for code in sorted(reussis(c, p) - deja[uid]):
            nouveaux.append(DefiReussi(campagne=c, user_id=uid, defi=code, points=points_du(c, code), reussi_le=maintenant))
            messages.append((uid, f"🏅 Défi réussi : {DEFIS[code]['nom']}",
                             f"+{points_du(c, code)} points ({c.titre}). Continuez pour atteindre le palier suivant !",
                             {'ecran': 'defis', 'campagne_id': c.id}))
    if nouveaux:
        DefiReussi.objects.bulk_create(nouveaux, ignore_conflicts=True)
        gains.notifier_par_user(messages)
    return len(nouveaux)


def cloturer(c, par, maintenant=None):
    maintenant = maintenant or timezone.now()
    aujourdhui = timezone.localdate(maintenant)
    with transaction.atomic():
        c = CampagneDefis.objects.select_for_update().get(pk=c.pk)
        e = etat(c, maintenant)
        if e == 'cloture':
            raise ValidationError("Ce programme est déjà clôturé.")
        if e != 'a_cloturer':
            raise ValidationError("Le programme n'est pas terminé.")
        if aujourdhui < cloture_possible_le(c):
            raise ValidationError(f"Clôture possible à partir du {cloture_possible_le(c):%d/%m/%Y} "
                                  "(retraits du dernier jour).")
        ids = set(destinataires(c, maintenant).values_list('id', flat=True))
        ids |= set(c.reussites.values_list('user_id', flat=True))
        prog = progression(c, ids, cloture_possible_le(c))
        existants = {(d.user_id, d.defi): d for d in c.reussites.all()}
        totaux, derniers = defaultdict(int), {}
        for uid, p in prog.items():
            valides = reussis(c, p, final=True)
            for (u, code), d in list(existants.items()):
                if u == uid and code not in valides:
                    d.delete()          # défi perdu (commande annulée entre-temps)
            for code in valides:
                d = existants.get((uid, code))
                if d is None:
                    d = DefiReussi.objects.create(campagne=c, user_id=uid, defi=code, points=points_du(c, code),
                                                  reussi_le=maintenant)
                totaux[uid] += d.points
                derniers[uid] = max(derniers.get(uid, d.reussi_le), d.reussi_le)
        classes = sorted((u for u in totaux if totaux[u] > 0), key=lambda u: (-totaux[u], derniers[u], u))
        paliers = list(c.paliers.order_by('-points_min'))
        restant = {pa.id: pa.quantite for pa in paliers}
        messages = []
        for rang, uid in enumerate(classes, start=1):
            palier = None
            for pa in paliers:
                if pa.points_min <= totaux[uid] and (restant[pa.id] is None or restant[pa.id] > 0):
                    palier = pa
                    break
            gain = None
            if palier is not None:
                if restant[palier.id] is not None:
                    restant[palier.id] -= 1
                gain = gains.attribuer(uid, 'defis', c.id, c.titre, palier.libelle, palier.type, palier.montant,
                                       par, maintenant, palier.valeur)
            ResultatDefis.objects.create(campagne=c, user_id=uid, points=totaux[uid], rang=rang, palier=palier, gain=gain)
            if gain:
                suite = ("crédité sur votre compte repas" if gain.statut_lot == 'credite'
                         else "à retirer auprès de votre gestionnaire")
                messages.append((uid, f"🏆 Palier {palier.nom} atteint !",
                                 f"{c.titre} : {totaux[uid]} points. Récompense : "
                                 f"{gains.libelle_gain(gain.type, gain.libelle, gain.montant)}, {suite}.",
                                 {'ecran': 'defis', 'campagne_id': c.id}))
            else:
                messages.append((uid, f"Bilan : {c.titre}", f"Vous avez obtenu {totaux[uid]} points. "
                                 "Bravo, rendez-vous au prochain défi !", {'ecran': 'defis', 'campagne_id': c.id}))
        c.cloture_le = maintenant
        c.save(update_fields=['cloture_le', 'updated_at'])
        transaction.on_commit(lambda: gains.notifier_par_user(messages))
    return c


def taches_defis(maintenant=None):
    """Toutes les 5 min : défis réussis des programmes en cours (notification immédiate)."""
    maintenant = maintenant or timezone.now()
    n = 0
    for c in CampagneDefis.objects.filter(publie_le__isnull=False, annule_le__isnull=True, cloture_le__isnull=True):
        if etat(c, maintenant) in ('en_cours', 'a_cloturer'):
            n += verifier(c, list(destinataires(c, maintenant).values_list('id', flat=True)), maintenant)
    return {'defis_reussis': n}


# ══════════════════════════════════════════════════════════════
# SÉRIALISATION ET VUES EMPLOYÉ
# ══════════════════════════════════════════════════════════════

def paliers_json(c, points=None):
    return [{'id': pa.id, 'nom': pa.nom, 'points_min': pa.points_min, 'libelle': pa.libelle, 'type': pa.type,
             'montant': float(pa.montant) if pa.montant is not None else None, 'quantite': pa.quantite,
             'valeur': float(pa.valeur) if pa.valeur is not None else None,
             'recompense': gains.libelle_gain(pa.type, pa.libelle, pa.montant),
             'atteint': points is not None and points >= pa.points_min}
            for pa in c.paliers.order_by('points_min')]


def campagne_json(c, maintenant=None):
    from .suspensions import suspension_json
    maintenant = maintenant or timezone.now()
    return {'id': c.id, 'titre': c.titre, 'periode_libelle': libelle_periode(c),
            # compatibilité des écrans : « mois_libelle » porte désormais la période
            'mois_libelle': libelle_periode(c), 'suspension': suspension_json('defis', c.id),
            'debut': _iso(c.debut), 'fin': _iso(c.fin), 'etat': etat(c, maintenant),
            'cloture_le': _iso(c.cloture_le), 'points_max': sum(d[2] for d in defis_actifs(c))}


def ma_campagne_json(c, user, maintenant):
    p = progression(c, [user.id], timezone.localdate(maintenant))[user.id]
    faits = {d.defi: d for d in c.reussites.filter(user=user)}
    defis = []
    for code, objectif, pts, description in defis_actifs(c):
        valeur = {'serie': p['serie'], 'plats': p['plats'], 'avis': p['avis'], 'retraits': p['retires']}[code]
        cible = p['commandes'] if code == 'retraits' else objectif
        d = {'code': code, 'nom': DEFIS[code]['nom'], 'icone': DEFIS[code]['icone'], 'description': description,
             'objectif': objectif, 'points': pts, 'valeur': valeur, 'cible': cible,
             'reussi': code in faits, 'reussi_le': _iso(faits[code].reussi_le) if code in faits else None}
        if code == 'serie':
            d['serie_courante'] = p['serie_courante']
        if code == 'retraits':
            d.update({'commandes': p['commandes'], 'retires': p['retires'], 'oublies': p['oublies'],
                      'minimum': c.retraits_minimum, 'perdu': p['oublies'] > 0,
                      'constate_a_la_cloture': not c.cloture_le})
        defis.append(d)
    points = sum(d.points for d in faits.values())
    res = {**campagne_json(c, maintenant), 'defis': defis, 'points': points, 'paliers': paliers_json(c, points)}
    r = c.resultats.filter(user=user).select_related('palier', 'gain').first() if c.cloture_le else None
    res['resultat'] = None if r is None else {
        'points': r.points, 'rang': r.rang, 'palier': r.palier.nom if r.palier_id else None,
        'gain': gains.gain_json(r.gain) if r.gain_id else None}
    return res


def badges(user):
    """Badges gagnés : un par défi réussi (avec le nombre de fois) et par palier atteint."""
    res = []
    compte = defaultdict(int)
    for code in (DefiReussi.objects.filter(user=user, campagne__annule_le__isnull=True)
                 .values_list('defi', flat=True)):
        compte[code] += 1
    for code, info in DEFIS.items():
        res.append({'code': code, 'nom': info['nom'], 'icone': info['icone'], 'nombre': compte.get(code, 0)})
    paliers = defaultdict(int)
    for nom in ResultatDefis.objects.filter(user=user, palier__isnull=False).values_list('palier__nom', flat=True):
        paliers[nom] += 1
    for nom, n in paliers.items():
        res.append({'code': f'palier:{nom}', 'nom': nom, 'icone': 'ri-medal-line', 'nombre': n})
    return res


def _visibles(user):
    from .jeux import agences_actuelles
    ags = agences_actuelles([user.id]).get(user.id, set())
    return (CampagneDefis.objects.filter(publie_le__isnull=False, annule_le__isnull=True)
            .filter(Q(agences__isnull=True) | Q(agences__in=ags) | Q(reussites__user=user)).distinct())


class MesDefisView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        maintenant = timezone.now()
        campagnes = list(_visibles(request.user).prefetch_related('paliers'))
        courante = next((c for c in sorted(campagnes, key=lambda c: c.debut)
                         if etat(c, maintenant) in ('en_cours', 'a_cloturer')), None)
        from .permissions import is_employe
        if courante and is_employe(request.user):
            verifier(courante, [request.user.id], maintenant)
        prochaine = next((c for c in sorted(campagnes, key=lambda c: c.debut)
                          if etat(c, maintenant) == 'a_venir'), None)
        historique = []
        for c in sorted(campagnes, key=lambda c: c.debut, reverse=True):
            if c is courante or etat(c, maintenant) != 'cloture':
                continue
            r = c.resultats.filter(user=request.user).select_related('palier', 'gain').first()
            historique.append({**campagne_json(c, maintenant), 'points': r.points if r else 0,
                               'palier': r.palier.nom if r and r.palier_id else None,
                               'gain': gains.gain_json(r.gain) if r and r.gain_id else None})
        return Response({
            'courante': ma_campagne_json(courante, request.user, maintenant) if courante else None,
            'prochaine': {**campagne_json(prochaine, maintenant), 'defis': [
                {'code': d[0], 'nom': DEFIS[d[0]]['nom'], 'icone': DEFIS[d[0]]['icone'], 'description': d[3],
                 'points': d[2]} for d in defis_actifs(prochaine)], 'paliers': paliers_json(prochaine)}
            if prochaine else None,
            'badges': badges(request.user), 'historique': historique[:12],
        })


# ══════════════════════════════════════════════════════════════
# ADMINISTRATION
# ══════════════════════════════════════════════════════════════

def _entier(v, champ, mini, maxi, defaut):
    if v in (None, ''):
        return defaut
    try:
        n = int(v)
    except (TypeError, ValueError):
        raise ValidationError({champ: "Nombre entier attendu."})
    if not mini <= n <= maxi:
        raise ValidationError({champ: f"Entre {mini} et {maxi}."})
    return n


def _lire_paliers(donnees):
    if not isinstance(donnees, list):
        raise ValidationError({'paliers': "Liste attendue."})
    res, seuils = [], set()
    for n, p in enumerate(donnees, start=1):
        if not isinstance(p, dict):
            raise ValidationError({'paliers': f"Palier {n} : format invalide."})
        nom = str(p.get('nom') or '').strip()
        if not nom:
            raise ValidationError({'paliers': f"Palier {n} : nom obligatoire (Bronze, Argent…)."})
        seuil = _entier(p.get('points_min'), 'paliers', 1, 100000, None)
        if seuil is None:
            raise ValidationError({'paliers': f"Palier {n} : points requis."})
        if seuil in seuils:
            raise ValidationError({'paliers': f"Palier {n} : deux paliers ont le même seuil."})
        seuils.add(seuil)
        type_lot = p.get('type') or 'argent'
        if type_lot not in ('objet', 'argent'):
            raise ValidationError({'paliers': f"Palier {n} : type invalide."})
        montant = None
        if type_lot == 'argent':
            try:
                montant = Decimal(str(p.get('montant')).replace(' ', '').replace(',', '.'))
            except (InvalidOperation, TypeError):
                raise ValidationError({'paliers': f"Palier {n} : montant invalide."})
            if not Decimal('0') < montant <= Decimal('1000000'):
                raise ValidationError({'paliers': f"Palier {n} : montant entre 1 et 1 000 000 F."})
        libelle = str(p.get('libelle') or '').strip()
        if type_lot == 'objet' and not libelle:
            raise ValidationError({'paliers': f"Palier {n} : récompense obligatoire."})
        quantite = p.get('quantite')
        quantite = None if quantite in (None, '') else _entier(quantite, 'paliers', 1, 100000, None)
        from .jeux import lire_valeur
        res.append({'nom': nom[:50], 'points_min': seuil, 'libelle': libelle[:150], 'type': type_lot,
                    'montant': montant, 'quantite': quantite,
                    'valeur': lire_valeur(p.get('valeur'), 'paliers', n) if type_lot == 'objet' else None})
    return res


def _date_heure(v, champ):
    from django.utils.dateparse import parse_datetime
    dt = parse_datetime(str(v or ''))
    if dt is None:
        raise ValidationError({champ: "Date et heure invalides."})
    return timezone.make_aware(dt, timezone.get_current_timezone()) if timezone.is_naive(dt) else dt


def chevauchement(c, debut, fin):
    """Autre programme programmé (non annulé) qui chevauche la période, sinon None."""
    return (CampagneDefis.objects.filter(publie_le__isnull=False, annule_le__isnull=True, debut__lt=fin, fin__gt=debut)
            .exclude(pk=c.pk).first())


def enregistrer(c, d, par):
    maintenant = timezone.now()
    if c.pk and (c.cloture_le or c.annule_le):
        raise ValidationError("Ce programme n'est plus modifiable.")
    titre = str(d.get('titre') or '').strip()
    debut = _date_heure(d.get('debut'), 'debut')
    fin = _date_heure(d.get('fin'), 'fin')
    if fin <= debut:
        raise ValidationError({'fin': "La fin doit être après le début."})
    commence = bool(c.pk and c.publie_le and c.debut <= maintenant)
    if commence and debut != c.debut:
        raise ValidationError({'debut': "Le programme a commencé : son début ne peut plus changer."})
    if fin <= maintenant:
        raise ValidationError({'fin': "La fin est passée."})
    if c.pk and c.publie_le:
        autre = chevauchement(c, debut, fin)
        if autre:
            raise ValidationError({'debut': f"Chevauche « {autre.titre} » ({libelle_periode(autre)})."})
    paliers = _lire_paliers(d.get('paliers') or [])
    valeurs = {
        'serie_jours': _entier(d.get('serie_jours'), 'serie_jours', 0, 31, 5),
        'serie_points': _entier(d.get('serie_points'), 'serie_points', 0, 10000, 20),
        'plats_nombre': _entier(d.get('plats_nombre'), 'plats_nombre', 0, 100, 3),
        'plats_points': _entier(d.get('plats_points'), 'plats_points', 0, 10000, 15),
        'avis_nombre': _entier(d.get('avis_nombre'), 'avis_nombre', 0, 100, 5),
        'avis_points': _entier(d.get('avis_points'), 'avis_points', 0, 10000, 10),
        'retraits_minimum': _entier(d.get('retraits_minimum'), 'retraits_minimum', 1, 31, 5),
        'retraits_points': _entier(d.get('retraits_points'), 'retraits_points', 0, 10000, 25),
    }
    c.plats_nouveaux = d.get('plats_nouveaux', True) not in (False, 'false', 0, '0')
    agences = [a for a in (d.get('agences') or []) if str(a).isdigit()]
    with transaction.atomic():
        c.titre = (titre or f"Défis du {timezone.localtime(debut):%d/%m}")[:150]
        c.debut, c.fin = debut, fin
        for k, v in valeurs.items():
            setattr(c, k, v)
        if not c.pk:
            c.user_created = par
        if not defis_actifs(c):
            raise ValidationError("Activez au moins un défi (objectif et points supérieurs à 0).")
        c.save()
        c.agences.set(Agence.objects.filter(id__in=agences))
        c.paliers.all().delete()
        PalierDefis.objects.bulk_create([PalierDefis(campagne=c, **p) for p in paliers])
    return c


def admin_json(c, complet=False):
    aujourdhui = timezone.localdate()
    maintenant = timezone.now()
    d = {**campagne_json(c, maintenant), 'etat_libelle': LIBELLES_ETAT[etat(c, maintenant)],
         'publie_le': _iso(c.publie_le), 'annule_le': _iso(c.annule_le),
         'agences': [{'id': a.id, 'nom': a.nom_agence} for a in c.agences.all()],
         'defis': [{'code': x[0], 'nom': DEFIS[x[0]]['nom'], 'objectif': x[1], 'points': x[2], 'description': x[3]}
                   for x in defis_actifs(c)],
         'paliers': paliers_json(c), 'nb_reussites': c.reussites.count(),
         'cloture_possible_le': cloture_possible_le(c).isoformat(),
         'peut_cloturer': etat(c, maintenant) == 'a_cloturer' and aujourdhui >= cloture_possible_le(c),
         'historique_suspensions': _susp.historique('defis', c.id)}
    if complet:
        d.update({k: getattr(c, k) for k in ('serie_jours', 'serie_points', 'plats_nombre', 'plats_points',
                                             'plats_nouveaux', 'avis_nombre', 'avis_points', 'retraits_minimum',
                                             'retraits_points')})
    return d


def _campagne(pk):
    c = CampagneDefis.objects.filter(pk=pk).prefetch_related('paliers', 'agences').first()
    if c is None:
        raise NotFound("Programme introuvable.")
    return c


class AdminDefisView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]

    def get(self, request):
        return Response([admin_json(c) for c in CampagneDefis.objects.prefetch_related('paliers', 'agences')])

    def post(self, request):
        c = enregistrer(CampagneDefis(), request.data, request.user)
        return Response(admin_json(_campagne(c.pk), True), status=201)


class AdminDefiDetailView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]

    def get(self, request, pk):
        return Response(admin_json(_campagne(pk), True))

    def put(self, request, pk):
        c = enregistrer(_campagne(pk), request.data, request.user)
        return Response(admin_json(_campagne(c.pk), True))

    def delete(self, request, pk):
        c = _campagne(pk)
        if c.publie_le and not c.annule_le:
            raise ValidationError("Ce programme est programmé : annulez-le d'abord.")
        c.delete()
        return Response(status=204)


class AdminDefiActionView(APIView):
    permission_classes = [ReadGestionnaireWriteAdmin]
    action = ''

    def post(self, request, pk):
        c = _campagne(pk)
        maintenant = timezone.now()
        if self.action == 'programmer':
            if c.publie_le:
                raise ValidationError("Déjà programmé.")
            if c.annule_le:
                raise ValidationError("Ce programme est annulé.")
            if c.fin <= maintenant:
                raise ValidationError("La fin du programme est passée.")
            autre = chevauchement(c, c.debut, c.fin)
            if autre:
                raise ValidationError(f"Chevauche « {autre.titre} » ({libelle_periode(autre)}) : changez les dates.")
            c.publie_le = maintenant
            c.save(update_fields=['publie_le', 'updated_at'])
            ids = list(destinataires(c, maintenant).values_list('id', flat=True))
            resume = ' ; '.join(f"{x[3].lower()} (+{x[2]} pts)" for x in defis_actifs(c))
            gains.notifier(ids, f"🏅 {c.titre}", f"{libelle_periode(c).capitalize()} : {resume}. Des récompenses à chaque palier !",
                           {'ecran': 'defis', 'campagne_id': c.id})
        elif self.action == 'annuler':
            if c.cloture_le:
                raise ValidationError("Ce programme est clôturé.")
            c.annule_le = maintenant
            c.save(update_fields=['annule_le', 'updated_at'])
        elif self.action == 'cloturer':
            cloturer(c, request.user, maintenant)
        return Response(admin_json(_campagne(pk), True))


class AdminDefiSuiviView(APIView):
    """Progression de chaque employé concerné (en direct), ou bilan après clôture."""
    permission_classes = [ReadGestionnaireWriteAdmin]

    def get(self, request, pk):
        from .jeux import agences_actuelles, nom_complet
        c = _campagne(pk)
        maintenant = timezone.now()
        users = list(destinataires(c, maintenant))
        ids = [u.id for u in users]
        noms = dict(Agence.objects.values_list('id', 'nom_agence'))
        agences = agences_actuelles(ids, maintenant)
        prog = progression(c, ids, timezone.localdate(maintenant))
        faits = defaultdict(dict)
        for d in c.reussites.all():
            faits[d.user_id][d.defi] = d
        resultats = {r.user_id: r for r in c.resultats.select_related('palier', 'gain', 'gain__lot_remis_par')}
        lignes = []
        for u in users:
            p, f = prog[u.id], faits.get(u.id, {})
            r = resultats.get(u.id)
            lignes.append({
                'employe': nom_complet(u), 'matricule': u.username,
                'agence': ', '.join(sorted(noms.get(a, '') for a in agences.get(u.id, set()))),
                'serie': p['serie'], 'plats': p['plats'], 'avis': p['avis'], 'commandes': p['commandes'],
                'retires': p['retires'], 'oublies': p['oublies'], 'reussis': sorted(f),
                'points': r.points if r else sum(x.points for x in f.values()),
                'rang': r.rang if r else None, 'palier': r.palier.nom if r and r.palier_id else None,
                'gain': gains.gain_json(r.gain) if r and r.gain_id else None,
            })
        lignes.sort(key=lambda l: (-l['points'], l['employe']))
        par_defi = {code: sum(1 for l in lignes if code in l['reussis']) for code in DEFIS}
        return Response({'campagne': admin_json(c), 'lignes': lignes,
                         'kpi': {'concernes': len(lignes), 'actifs': sum(1 for l in lignes if l['commandes']),
                                 'avec_points': sum(1 for l in lignes if l['points']), 'par_defi': par_defi}})
