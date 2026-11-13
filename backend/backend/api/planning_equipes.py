"""
Planning des équipes (équipes « sur planning », ex. Nuit).

Règles
  - Une équipe cochée « Réservée aux employés programmés » (TypeEquipe.sur_planning)
    n'est visible, avec ses menus, que des employés programmés ce jour-là
    (ProgrammationEquipe : période du … au … — fin vide : jusqu'à nouvel ordre —
    et jours de la semaine). Le serveur refuse toute autre commande.
  - Équipe « exclusive » (TypeEquipe.exclusive_planning) : pendant ses jours
    programmés, l'employé ne voit et ne commande que cette équipe.
  - Un seul repas par jour (règle générale, POST /commandes/).
  - Retrait du planning (écran, modification, import « remplacer ») : les
    commandes en attente des jours retirés sont annulées et remboursées si le
    délai d'annulation est ouvert (réglable), sinon maintenues. Notifications :
    employé, administrateurs, gestionnaires de l'agence, comptabilité,
    prestataire (chacun réglable dans Paramètres → Société).
  - Programmation : l'employé est prévenu ; les jours dont les commandes sont
    déjà closes sont signalés ; un repas déjà commandé dans une autre équipe
    un jour programmé (équipe exclusive) est signalé (annulable ou maintenu).
  - Commande tardive (réglage, désactivée par défaut) : un jour programmé après
    la clôture normale des commandes reste commandable jusqu'à N heures avant
    le début du retrait de l'équipe.
  - Saisie : administrateurs ; gestionnaires (employés de leurs agences) si
    ParametresSociete.planning_saisie_gestionnaire.

API (préfixe /api/api/)
  GET  planning-equipes/?typeequipe=&agence=&semaine=AAAA-MM-JJ   grille de la semaine
  GET  planning-equipes/employes/?agence=&q=                      employés programmables
  GET  planning-equipes/historique/?user=&typeequipe=             journal
  POST planning-equipes/programmer/   {typeequipe, user_ids, date_debut, date_fin, jours, motif, apercu}
  PATCH planning-equipes/<id>/        {date_debut, date_fin, jours, motif, apercu}
  DELETE planning-equipes/<id>/       ?apercu=1&motif=
  POST planning-equipes/retirer/      {user, typeequipe, a_partir_de, motif, apercu}
  POST planning-equipes/importer/     {lignes, mode: ajouter|remplacer, apercu}
  POST planning-equipes/copier-semaine/ {typeequipe, agence, semaine}
"""
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Agence, Commande, HistoriqueProgrammation, ParametresSociete, ProgrammationEquipe, TypeEquipe, User,
    UserAgence,
)
from .permissions import IsAuthenticated, agences_gerees, is_admin, is_compte_prestataire, is_gestionnaire

TOUS_JOURS = [0, 1, 2, 3, 4, 5, 6]
JOURS_COURTS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']
JOURS_SIGLES = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']
# Fenêtre examinée pour mesurer l'effet d'un changement de planning
HORIZON_IMPACT = 120


# ══════════════════════════════════════════════════════════════
# OUTILS
# ══════════════════════════════════════════════════════════════

def jours_de(prog):
    j = getattr(prog, 'jours', None)
    return set(j) if j else set(TOUS_JOURS)


def couvre(prog, d):
    return (prog.date_debut <= d and (prog.date_fin is None or d <= prog.date_fin)
            and d.weekday() in jours_de(prog))


def jour_txt(d):
    return f"{JOURS_COURTS[d.weekday()]} {d:%d/%m}"


def periode_txt(debut, fin):
    if fin is None:
        return f"à partir du {debut:%d/%m/%Y}"
    if debut == fin:
        return f"le {jour_txt(debut)}"
    return f"du {debut:%d/%m} au {fin:%d/%m/%Y}"


def jours_txt(jours):
    j = sorted(set(jours or TOUS_JOURS))
    if j == TOUS_JOURS:
        return 'tous les jours'
    if j == [0, 1, 2, 3, 4]:
        return 'du lundi au vendredi'
    return ', '.join(JOURS_SIGLES[i] for i in j)


def lire_date(valeur, nom, requis=True):
    if valeur in (None, ''):
        if requis:
            raise ValidationError({nom: "Date requise."})
        return None
    if isinstance(valeur, date):
        return valeur
    try:
        return date.fromisoformat(str(valeur)[:10])
    except ValueError:
        raise ValidationError({nom: f"Date invalide : {valeur} (format AAAA-MM-JJ)."})


def lire_jours(valeur):
    """[0..6] ; accepte aussi « Lu-Ve », « Lu,Me,Ve », « tous »."""
    if valeur in (None, '', []):
        return list(TOUS_JOURS)
    if isinstance(valeur, (list, tuple)):
        try:
            jours = sorted({int(v) for v in valeur})
        except (TypeError, ValueError):
            raise ValidationError({'jours': "Jours invalides."})
        if not jours or any(j < 0 or j > 6 for j in jours):
            raise ValidationError({'jours': "Jours invalides (0 = lundi … 6 = dimanche)."})
        return jours
    texte = str(valeur).strip().lower()
    if texte in ('tous', 'tous les jours', '*'):
        return list(TOUS_JOURS)
    sigles = [s.lower() for s in JOURS_SIGLES]
    noms = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

    def idx(t):
        t = t.strip().rstrip('.')
        for liste in (sigles, noms, [n[:3] for n in noms]):
            if t in liste:
                return liste.index(t)
        raise ValidationError({'jours': f"Jour inconnu : {t}"})

    jours = set()
    for morceau in texte.replace(';', ',').replace(' ', ',').split(','):
        if not morceau:
            continue
        if '-' in morceau:
            a, b = morceau.split('-', 1)
            i, j = idx(a), idx(b)
            jours |= set(range(i, j + 1)) if i <= j else set(range(i, 7)) | set(range(0, j + 1))
        else:
            jours.add(idx(morceau))
    if not jours:
        raise ValidationError({'jours': "Jours invalides."})
    return sorted(jours)


def nom(user):
    from .serializers import nom_complet
    return nom_complet(user)


def _fcfa(m):
    from .pdf_factures import fcfa
    return fcfa(m)


# ══════════════════════════════════════════════════════════════
# ACCÈS D'UN EMPLOYÉ AUX ÉQUIPES
# ══════════════════════════════════════════════════════════════

class AccesEquipes:
    """
    Équipes visibles d'un utilisateur, jour par jour. Une instance par requête :
    les équipes sur planning et les programmations de l'utilisateur sont lues une fois.
    """

    def __init__(self, user, debut=None, fin=None, parametres=None):
        self.user = user
        self.parametres = parametres
        self.restreintes = {e.id: e for e in TypeEquipe.objects.filter(sur_planning=True)}
        self.exclusives = {i for i, e in self.restreintes.items() if e.exclusive_planning}
        self.progs = []
        if self.restreintes and user is not None and user.is_authenticated:
            qs = ProgrammationEquipe.objects.filter(user=user, typeequipe_id__in=list(self.restreintes))
            if fin is not None:
                qs = qs.filter(date_debut__lte=fin)
            if debut is not None:
                qs = qs.filter(Q(date_fin__isnull=True) | Q(date_fin__gte=debut))
            self.progs = list(qs.order_by('date_debut', 'id'))

    @property
    def actif(self):
        return bool(self.restreintes)

    def programmation(self, equipe_id, d):
        return next((p for p in self.progs if p.typeequipe_id == equipe_id and couvre(p, d)), None)

    def est_programme(self, equipe_id, d):
        return self.programmation(equipe_id, d) is not None

    def exclusive_du_jour(self, d):
        """Équipe exclusive dans laquelle l'utilisateur est programmé ce jour-là (ou None)."""
        for p in self.progs:
            if p.typeequipe_id in self.exclusives and couvre(p, d):
                return self.restreintes[p.typeequipe_id]
        return None

    def visible(self, equipe_id, d):
        if not self.restreintes:
            return True
        if equipe_id in self.restreintes:
            return self.est_programme(equipe_id, d)
        return self.exclusive_du_jour(d) is None

    def motif(self, equipe_id, d):
        """Pourquoi l'équipe n'est pas accessible ce jour-là (None si elle l'est)."""
        if self.visible(equipe_id, d):
            return None
        if equipe_id in self.restreintes:
            return (f"Vous n'êtes pas programmé(e) dans l'équipe {self.restreintes[equipe_id].libelle} "
                    f"le {jour_txt(d)}.")
        ex = self.exclusive_du_jour(d)
        return f"Vous êtes programmé(e) dans l'équipe {ex.libelle} le {jour_txt(d)}."

    def periode(self, equipe_id, a_partir=None):
        """Programmation en cours ou prochaine pour l'équipe : {du, au, jours, libelle} ou None."""
        a_partir = a_partir or timezone.localdate()
        progs = sorted((p for p in self.progs if p.typeequipe_id == equipe_id
                        and (p.date_fin is None or p.date_fin >= a_partir)), key=lambda p: p.date_debut)
        if not progs:
            return None
        p = progs[0]
        return {'du': p.date_debut.isoformat(), 'au': p.date_fin.isoformat() if p.date_fin else None,
                'jours': sorted(jours_de(p)),
                'libelle': f"Programmé(e) {periode_txt(p.date_debut, p.date_fin)}"}

    def equipe_json(self, equipe_id):
        """Champs ajoutés à une équipe dans le parcours de commande."""
        e = self.restreintes.get(equipe_id)
        if e is None:
            return {'sur_planning': False, 'programmation': None}
        return {'sur_planning': True, 'programmation': self.periode(equipe_id)}

    # ── Date limite de commande (commande tardive) ─────────────
    def limite_commande(self, d, typeequipe, agence, parametres=None):
        from .serializers import date_limite_commande
        p = parametres or self.parametres or ParametresSociete.charger()
        normale = date_limite_commande(d, p)
        if not p.planning_commande_tardive or typeequipe is None or typeequipe.id not in self.restreintes:
            return normale
        prog = self.programmation(typeequipe.id, d)
        if prog is None or max(prog.created_at, prog.updated_at) <= normale:
            return normale
        from .prestataires import horaires_retrait
        debut_retrait = horaires_retrait(agence, typeequipe, p)[0]
        tardive = (timezone.make_aware(datetime.combine(d, debut_retrait))
                   - timedelta(hours=p.planning_commande_tardive_heures))
        return max(normale, tardive)


def filtrer_menus(acces, menus):
    """Menus (objets avec typeequipe_id et date_menu) visibles de l'utilisateur."""
    if not acces.actif:
        return list(menus)
    return [m for m in menus if acces.visible(m.typeequipe_id, m.date_menu)]


def verifier_commande_equipe(user, menu):
    """POST /commandes/ : refuse une commande dans une équipe non accessible ce jour-là."""
    acces = AccesEquipes(user, menu.date_menu, menu.date_menu)
    motif = acces.motif(menu.typeequipe_id, menu.date_menu)
    if motif:
        raise PermissionDenied(f"Commande impossible : {motif}")
    return acces


def exclure_menus_invisibles(user, qs):
    """Liste des menus (API /menus/) : retire ceux que l'utilisateur ne doit pas voir."""
    acces = AccesEquipes(user)
    if not acces.actif:
        return qs
    candidats = qs.filter(Q(typeequipe_id__in=list(acces.restreintes)) | Q(
        date_menu__in=_dates_exclusives(acces))).values_list('id', 'typeequipe_id', 'date_menu')
    interdits = [mid for mid, eq, d in candidats if not acces.visible(eq, d)]
    return qs.exclude(id__in=interdits) if interdits else qs


def _dates_exclusives(acces):
    """Dates couvertes par une programmation exclusive (bornées à l'horizon d'impact)."""
    aujourdhui = timezone.localdate()
    dates = set()
    for p in acces.progs:
        if p.typeequipe_id not in acces.exclusives:
            continue
        fin = p.date_fin or (aujourdhui + timedelta(days=HORIZON_IMPACT))
        d = max(p.date_debut, aujourdhui - timedelta(days=HORIZON_IMPACT))
        while d <= fin:
            if couvre(p, d):
                dates.add(d)
            d += timedelta(days=1)
    return dates


# ══════════════════════════════════════════════════════════════
# DROITS DE SAISIE
# ══════════════════════════════════════════════════════════════

def peut_saisir(user, parametres=None):
    if is_admin(user):
        return True
    p = parametres or ParametresSociete.charger()
    return is_gestionnaire(user) and p.planning_saisie_gestionnaire


def verifier_saisie(user):
    if not peut_saisir(user):
        raise PermissionDenied("Vous n'êtes pas autorisé(e) à gérer le planning des équipes.")


def agence_de(user_ids):
    from .parcours_commande import agences_origine
    return agences_origine(user_ids)


def verifier_employe_gere(acteur, employe, agences=None):
    if is_admin(acteur):
        return
    geres = agences_gerees(acteur) or set()
    agence = (agences or agence_de({employe.id})).get(employe.id)
    if agence is None or agence.id not in geres:
        raise PermissionDenied(f"{nom(employe)} n'est pas un employé de vos agences.")


def equipe_planning(valeur):
    try:
        e = TypeEquipe.objects.get(pk=int(valeur))
    except (TypeError, ValueError, TypeEquipe.DoesNotExist):
        raise ValidationError({'typeequipe': "Équipe introuvable."})
    if not e.sur_planning:
        raise ValidationError({'typeequipe': f"L'équipe {e.libelle} n'est pas réservée aux employés "
                                             "programmés (Paramètres → Types d'équipe)."})
    return e


# ══════════════════════════════════════════════════════════════
# EFFET D'UN CHANGEMENT DE PLANNING SUR LES COMMANDES
# ══════════════════════════════════════════════════════════════

@dataclass
class Rapport:
    """Effets d'un changement (aperçu ou exécution), cumulés sur plusieurs employés."""
    annulees: list = field(default_factory=list)
    maintenues: list = field(default_factory=list)
    conflits: list = field(default_factory=list)
    closes: list = field(default_factory=list)
    programmes: int = 0
    retires: int = 0

    def json(self):
        return {'annulees': self.annulees, 'maintenues': self.maintenues, 'conflits': self.conflits,
                'closes': self.closes, 'nb_annulees': len(self.annulees),
                'nb_maintenues': len(self.maintenues), 'nb_conflits': len(self.conflits),
                'programmes': self.programmes, 'retires': self.retires}


def _couverture(progs, debut, fin):
    jours = set()
    for p in progs:
        d = max(p.date_debut, debut)
        f = min(p.date_fin or fin, fin)
        while d <= f:
            if d.weekday() in jours_de(p):
                jours.add(d)
            d += timedelta(days=1)
    return jours


def _ligne_commande(c, prix=None):
    return {'commande_id': c.id, 'employe_id': c.user_id, 'employe': nom(c.user), 'matricule': c.user.username,
            'date': c.menu.date_menu.isoformat(), 'jour': jour_txt(c.menu.date_menu), 'plat': c.plat.nom,
            'equipe': c.menu.typeequipe.libelle if c.menu.typeequipe_id else '',
            'agence': c.menu.agence.nom_agence, 'prestataire_id': c.menu.prestataire_id,
            'mode_paiement': c.mode_paiement, 'prix': float(prix) if prix is not None else None}


def mesurer_impact(employe, equipe, avant, apres, rapport, executer=False, par=None, motif='',
                   parametres=None, notifier_programmation=True, texte_periode=''):
    """
    Compare la couverture de l'employé dans l'équipe avant / après un changement
    (listes de programmations, en mémoire) et applique les règles. `executer` :
    annule les commandes, rembourse et prépare les notifications (après commit).
    """
    from .serializers import date_limite_annulation, date_limite_commande, libelle_date_limite
    p = parametres or ParametresSociete.charger()
    aujourdhui = timezone.localdate()
    maintenant = timezone.now()
    fin = aujourdhui + timedelta(days=HORIZON_IMPACT)
    cov_avant = _couverture(avant, aujourdhui, fin)
    cov_apres = _couverture(apres, aujourdhui, fin)
    retires = sorted(cov_avant - cov_apres)
    ajoutes = sorted(cov_apres - cov_avant)

    a_notifier_employe = []
    annulees_ici = []
    if retires:
        commandes = list(Commande.objects.filter(user=employe, statut='en_attente', menu__typeequipe=equipe,
                                                 menu__date_menu__in=retires)
                         .select_related('user', 'plat', 'menu__agence', 'menu__typeequipe', 'menu__prestataire')
                         .order_by('menu__date_menu'))
        from . import comptes_repas as cr
        from .models import ClotureMensuelle
        for c in commandes:
            d = c.menu.date_menu
            ouvert = (maintenant < date_limite_annulation(d, p)
                      and not ClotureMensuelle.objects.filter(annee=d.year, mois=d.month).exists())
            if p.planning_annulation_auto and ouvert:
                prix = cr.prix_repas(c) if c.mode_paiement == 'compte' else None
                ligne = _ligne_commande(c, prix)
                ligne['rembourse'] = bool(p.planning_remboursement_auto and c.mode_paiement == 'compte')
                rapport.annulees.append(ligne)
                if executer:
                    _annuler(c, par, motif, rembourser=p.planning_remboursement_auto)
                    annulees_ici.append(ligne)
            else:
                ligne = _ligne_commande(c)
                ligne['raison'] = ("Délai d'annulation dépassé" if not ouvert
                                   else "Annulation automatique désactivée")
                rapport.maintenues.append(ligne)
                a_notifier_employe.append(('maintenue', ligne))

    if ajoutes:
        # Repas déjà commandé dans une autre équipe un jour désormais programmé (équipe exclusive)
        if equipe.exclusive_planning:
            for c in (Commande.objects.filter(user=employe, statut='en_attente', menu__date_menu__in=ajoutes)
                      .exclude(menu__typeequipe=equipe)
                      .select_related('user', 'plat', 'menu__agence', 'menu__typeequipe', 'menu__prestataire')
                      .order_by('menu__date_menu')):
                limite = date_limite_annulation(c.menu.date_menu, p)
                ligne = _ligne_commande(c)
                ligne['annulable'] = maintenant < limite
                ligne['libelle_annulation'] = libelle_date_limite(limite)
                rapport.conflits.append(ligne)
                a_notifier_employe.append(('conflit', ligne))
        # Jours programmés dont les commandes sont déjà closes
        for d in ajoutes:
            if d > aujourdhui + timedelta(days=14):
                break
            if maintenant >= date_limite_commande(d, p):
                tardive = None
                if p.planning_commande_tardive:
                    from .prestataires import horaires_retrait
                    debut_retrait = horaires_retrait(_agence_employe(employe), equipe, p)[0]
                    t = (timezone.make_aware(datetime.combine(d, debut_retrait))
                         - timedelta(hours=p.planning_commande_tardive_heures))
                    if maintenant < t:
                        tardive = libelle_date_limite(t)
                rapport.closes.append({'employe_id': employe.id, 'employe': nom(employe), 'date': d.isoformat(),
                                       'jour': jour_txt(d), 'commande_tardive_jusqua': tardive})

    if executer:
        _preparer_notifications(employe, equipe, p, par, motif, annulees_ici, a_notifier_employe,
                                ajoutes if notifier_programmation else [], retires, texte_periode,
                                [c for c in rapport.closes if c['employe_id'] == employe.id])
    return retires, ajoutes


def _agence_employe(employe):
    return agence_de({employe.id}).get(employe.id)


def _annuler(commande, par, motif, rembourser=True):
    from .comptes_repas import liberer_reglement
    c = Commande.objects.select_for_update().get(pk=commande.pk)
    if c.statut != 'en_attente':
        return
    c.statut = 'annulee'
    c.date_annulation = timezone.now()
    c.annulee_par = par
    c.motif_annulation = 'planning'
    if par is not None:
        c.user_updated = par
    c._sans_notification = True  # notification dédiée (planning_equipe)
    c.save()
    if rembourser:
        liberer_reglement(c, par, raison="Retrait du planning des équipes")


# ══════════════════════════════════════════════════════════════
# NOTIFICATIONS
# ══════════════════════════════════════════════════════════════

def _preparer_notifications(employe, equipe, p, par, motif, annulees, autres, ajoutes, retires,
                            texte_periode, closes):
    from .signals import _en_arriere_plan
    motif_txt = f" ({motif})" if motif else ''
    messages_employe = []

    if ajoutes and p.planning_notifier_programmation:
        corps = (f"Vous êtes programmé(e) dans l'équipe {equipe.libelle} {texte_periode or periode_txt(ajoutes[0], ajoutes[-1])}."
                 " Pensez à réserver vos repas.")
        if closes:
            jours_clos = ', '.join(c['jour'] for c in closes[:5])
            tardifs = [c for c in closes if c['commande_tardive_jusqua']]
            if tardifs:
                corps += (f" Commandes closes pour le {jours_clos} : vous pouvez encore commander "
                          f"jusqu'au {tardifs[0]['commande_tardive_jusqua']}.")
            else:
                corps += f" Les commandes sont closes pour le {jours_clos}."
        messages_employe.append((f"Vous êtes programmé(e) : équipe {equipe.libelle}", corps))

    if annulees:
        lignes = []
        for a in annulees:
            t = f"{a['plat']} du {a['jour']}"
            if a.get('rembourse') and a.get('prix') is not None:
                t += f" ({_fcfa(a['prix'])} recrédités sur votre compte repas)"
            lignes.append(t)
        messages_employe.append(("Commande annulée et remboursée" if any(a.get('rembourse') for a in annulees)
                                 else "Commande annulée",
                                 f"Vous n'êtes plus programmé(e) dans l'équipe {equipe.libelle} "
                                 f"le {', '.join(a['jour'] for a in annulees)}{motif_txt}. "
                                 f"Annulé : {' ; '.join(lignes)}."))
    for genre, ligne in autres:
        if genre == 'maintenue':
            messages_employe.append(("Commande maintenue",
                                     f"Votre {ligne['plat']} du {ligne['jour']} est maintenu : "
                                     "le délai d'annulation est dépassé."))
        elif genre == 'conflit':
            if ligne['annulable']:
                corps = (f"Vous avez un repas {ligne['equipe']} le {ligne['jour']} ({ligne['plat']}) alors que vous "
                         f"êtes programmé(e) dans l'équipe {equipe.libelle} : annulez-le avant le "
                         f"{ligne['libelle_annulation']} pour commander dans l'équipe {equipe.libelle}.")
            else:
                corps = (f"Votre repas {ligne['equipe']} du {ligne['jour']} ({ligne['plat']}) est maintenu : "
                         f"vous ne pourrez pas commander dans l'équipe {equipe.libelle} ce jour-là.")
            messages_employe.append((f"Repas à vérifier : équipe {equipe.libelle}", corps))
    if retires and not annulees and not any(g == 'maintenue' for g, _ in autres) and p.planning_notifier_programmation:
        messages_employe.append((f"Planning modifié : équipe {equipe.libelle}",
                                 f"Vous n'êtes plus programmé(e) dans l'équipe {equipe.libelle} "
                                 f"{periode_txt(retires[0], retires[-1])}{motif_txt}."))

    if p.planning_notif_employe:
        for titre, corps in messages_employe:
            _en_arriere_plan(_envoyer, [employe.id], titre, corps)

    if annulees:
        resume = '; '.join(f"{a['plat']} du {a['jour']} à {a['agence']}" for a in annulees)
        titre = "Commande annulée : retrait du planning"
        corps = (f"{nom(employe)} (mat. {employe.username}) n'est plus programmé(e) dans l'équipe "
                 f"{equipe.libelle}{motif_txt}. Commande annulée : {resume}.")
        destinataires = set()
        if p.planning_notif_admin:
            destinataires |= set(User.objects.filter(is_active=True).filter(
                Q(is_superuser=True) | Q(groups__name__in=['admin', 'super_admin'])).values_list('id', flat=True))
        if p.planning_notif_gestionnaire:
            from .signals import _gestionnaires_agence
            for agence_id in {a_['agence_id'] for a_ in _agences_annulees(annulees)}:
                destinataires |= {u.id for u in _gestionnaires_agence(agence_id)}
        if p.planning_notif_comptable:
            destinataires |= set(User.objects.filter(is_active=True, groups__name='comptabilite')
                                 .values_list('id', flat=True))
        destinataires.discard(employe.id)
        if par is not None:
            destinataires.discard(par.id)
        if destinataires:
            _en_arriere_plan(_envoyer, sorted(destinataires), titre, corps)
        if p.planning_notif_prestataire:
            from .signals import notifier_prestataire
            par_prest = defaultdict(list)
            for a in annulees:
                if a['prestataire_id']:
                    par_prest[a['prestataire_id']].append(a)
            for pid, lignes in par_prest.items():
                notifier_prestataire(pid, "Commande annulée",
                                     f"Commande de {nom(employe)} annulée (retrait du planning de l'équipe "
                                     f"{equipe.libelle}) : " + '; '.join(f"{a['plat']} du {a['jour']} à {a['agence']}"
                                                                         for a in lignes) + '.',
                                     'commande_annulee')


def _agences_annulees(annulees):
    ids = {a['commande_id'] for a in annulees}
    return [{'agence_id': aid} for aid in
            set(Commande.objects.filter(id__in=ids).values_list('menu__agence_id', flat=True))]


def _envoyer(user_ids, titre, message):
    from .fcm_service import envoyer_notification_user
    for u in User.objects.filter(id__in=user_ids, is_active=True):
        envoyer_notification_user(user=u, titre=titre, message=message, type_notif='planning_equipe')


# ══════════════════════════════════════════════════════════════
# OPÉRATIONS
# ══════════════════════════════════════════════════════════════

def _progs(employe, equipe):
    return list(ProgrammationEquipe.objects.filter(user=employe, typeequipe=equipe).order_by('date_debut', 'id'))


def _copie(p, **champs):
    c = ProgrammationEquipe(id=p.id, user_id=p.user_id, typeequipe_id=p.typeequipe_id, date_debut=p.date_debut,
                            date_fin=p.date_fin, jours=list(p.jours or []), motif=p.motif)
    c.created_at, c.updated_at = p.created_at, p.updated_at
    for k, v in champs.items():
        setattr(c, k, v)
    return c


def _decouper(progs, debut, fin):
    """
    Programmations après retrait de la plage [debut, fin] (fin None : jusqu'au bout).
    Renvoie (nouvelles programmations en mémoire, {id: 'supprimer'|'modifier'}, morceaux à créer).
    """
    resultat = []
    for p in progs:
        p_fin = p.date_fin
        chevauche = p.date_debut <= (fin or date.max) and (p_fin is None or p_fin >= debut)
        if not chevauche:
            resultat.append(_copie(p))
            continue
        if p.date_debut < debut:
            resultat.append(_copie(p, date_fin=debut - timedelta(days=1)))
            if fin is not None and (p_fin is None or p_fin > fin):
                resultat.append(_copie(p, id=None, date_debut=fin + timedelta(days=1), date_fin=p_fin))
        elif fin is not None and (p_fin is None or p_fin > fin):
            resultat.append(_copie(p, date_debut=fin + timedelta(days=1)))
    return resultat


def _enregistrer(employe, equipe, nouvelles, par):
    """Remplace en base les programmations de l'employé dans l'équipe par `nouvelles` (en mémoire)."""
    existantes = {p.id: p for p in _progs(employe, equipe)}
    gardees = set()
    for n in nouvelles:
        if n.id and n.id in existantes and n.id not in gardees:
            e = existantes[n.id]
            gardees.add(n.id)
            if (e.date_debut, e.date_fin, sorted(jours_de(e))) != (n.date_debut, n.date_fin, sorted(jours_de(n))):
                e.date_debut, e.date_fin, e.jours = n.date_debut, n.date_fin, list(n.jours or TOUS_JOURS)
                e.user_updated = par
                e.save()
        else:
            ProgrammationEquipe.objects.create(user=employe, typeequipe=equipe, date_debut=n.date_debut,
                                               date_fin=n.date_fin, jours=list(n.jours or TOUS_JOURS),
                                               motif=n.motif or '', importee=getattr(n, 'importee', False),
                                               user_created=par, user_updated=par)
    ProgrammationEquipe.objects.filter(id__in=set(existantes) - gardees).delete()


def _tracer(employe, equipe, action, description, par, motif=''):
    HistoriqueProgrammation.objects.create(user=employe, typeequipe=equipe, action=action,
                                           description=description[:2000], motif=(motif or '')[:255], par=par)


def changer(employe, equipe, nouvelles, rapport, par, motif, action, description, apercu,
            parametres, texte_periode=''):
    """Applique (ou simule) un nouvel état du planning d'un employé dans une équipe."""
    avant = _progs(employe, equipe)
    if apercu:
        mesurer_impact(employe, equipe, avant, nouvelles, rapport, executer=False, parametres=parametres)
        return
    with transaction.atomic():
        # Verrou sur l'employé : deux changements simultanés de son planning s'enchaînent
        User.objects.select_for_update().filter(pk=employe.pk).first()
        avant = _progs(employe, equipe)
        _enregistrer(employe, equipe, nouvelles, par)
        apres = _progs(employe, equipe)
        mesurer_impact(employe, equipe, avant, apres, rapport, executer=True, par=par, motif=motif,
                       parametres=parametres, texte_periode=texte_periode)
        _tracer(employe, equipe, action, description, par, motif)


def programmer(employe, equipe, debut, fin, jours, rapport, par, motif='', apercu=False, parametres=None,
               action='programmation', importee=False):
    if fin is not None and fin < debut:
        raise ValidationError({'date_fin': "La date de fin doit être après la date de début."})
    nouvelles = [_copie(p) for p in _progs(employe, equipe)]
    n = ProgrammationEquipe(user=employe, typeequipe=equipe, date_debut=debut, date_fin=fin,
                            jours=lire_jours(jours), motif=motif or '', importee=importee)
    n.created_at = n.updated_at = timezone.now()
    nouvelles.append(n)
    texte = periode_txt(debut, fin) + (f" ({jours_txt(n.jours)})" if sorted(n.jours) != TOUS_JOURS else '')
    changer(employe, equipe, nouvelles, rapport, par, motif, action,
            f"Programmé(e) {texte}", apercu, parametres, texte_periode=texte)
    rapport.programmes += 1


def retirer(employe, equipe, a_partir, fin, rapport, par, motif='', apercu=False, parametres=None,
            action='retrait'):
    progs = _progs(employe, equipe)
    if not progs:
        return False
    debut = a_partir or min(p.date_debut for p in progs)
    nouvelles = _decouper(progs, debut, fin)
    changer(employe, equipe, nouvelles, rapport, par, motif, action,
            f"Retiré(e) {periode_txt(debut, fin)}", apercu, parametres)
    rapport.retires += 1
    return True


# ══════════════════════════════════════════════════════════════
# VUES
# ══════════════════════════════════════════════════════════════

def _vrai(valeur):
    return str(valeur).lower() in ('1', 'true', 'oui', 'yes')


def _employes_geres(acteur, agence_id=None):
    """Employés UbiPharm actifs (hors comptes prestataires) de l'agence / des agences gérées."""
    geres = None if is_admin(acteur) else (agences_gerees(acteur) or set())
    if agence_id is not None:
        if geres is not None and agence_id not in geres:
            raise PermissionDenied("Agence non gérée.")
        geres = {agence_id}
    users = User.objects.filter(is_active=True, prestataire__isnull=True)
    if geres is not None:
        maintenant = timezone.now()
        ids = (UserAgence.objects.filter(agence_id__in=geres, date_debut__lte=maintenant)
               .filter(Q(date_fin__isnull=True) | Q(date_fin__gte=maintenant)).values_list('user_id', flat=True))
        users = users.filter(id__in=ids)
    return users


def _employe(acteur, valeur):
    try:
        employe = User.objects.get(pk=int(valeur))
    except (TypeError, ValueError, User.DoesNotExist):
        raise NotFound("Employé introuvable.")
    if is_compte_prestataire(employe):
        raise ValidationError("Les comptes prestataires ne se programment pas.")
    verifier_employe_gere(acteur, employe)
    return employe


class PlanningEquipesView(APIView):
    """GET planning-equipes/ : grille de la semaine (lundi → dimanche)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        verifier_saisie(request.user)
        q = request.query_params
        equipes = list(TypeEquipe.objects.filter(sur_planning=True).order_by('libelle'))
        equipe = None
        if q.get('typeequipe'):
            equipe = equipe_planning(q.get('typeequipe'))
        elif equipes:
            equipe = equipes[0]
        geres = None if is_admin(request.user) else (agences_gerees(request.user) or set())
        agences = Agence.objects.all() if geres is None else Agence.objects.filter(id__in=geres)
        agence_id = int(q['agence']) if str(q.get('agence') or '').isdigit() else None
        ref = lire_date(q.get('semaine'), 'semaine', requis=False) or timezone.localdate()
        lundi = ref - timedelta(days=ref.weekday())
        jours = [lundi + timedelta(days=i) for i in range(7)]
        p = ParametresSociete.charger()
        base = {
            'equipes': [{'id': e.id, 'libelle': e.libelle, 'exclusive_planning': e.exclusive_planning}
                        for e in equipes],
            'agences': [{'id': a.id, 'nom': a.nom_agence} for a in agences.order_by('nom_agence')],
            'typeequipe': equipe.id if equipe else None, 'agence': agence_id,
            'semaine': {'debut': jours[0].isoformat(), 'fin': jours[-1].isoformat(),
                        'precedente': (lundi - timedelta(days=7)).isoformat(),
                        'suivante': (lundi + timedelta(days=7)).isoformat()},
            'jours': [{'date': d.isoformat(), 'libelle': jour_txt(d)} for d in jours],
            'aujourdhui': timezone.localdate().isoformat(),
            'parametres': {'annulation_auto': p.planning_annulation_auto,
                           'remboursement_auto': p.planning_remboursement_auto},
            'lignes': [],
            'kpi': {'employes': 0, 'repas_commandes': 0, 'employes_jours': 0, 'changements': 0},
        }
        if equipe is None:
            return Response(base)
        employes = _employes_geres(request.user, agence_id)
        progs = list(ProgrammationEquipe.objects.filter(typeequipe=equipe, user__in=employes,
                                                        date_debut__lte=jours[-1])
                     .filter(Q(date_fin__isnull=True) | Q(date_fin__gte=jours[0]))
                     .select_related('user', 'user_created').order_by('date_debut'))
        par_user = defaultdict(list)
        for pr in progs:
            par_user[pr.user_id].append(pr)
        users = {pr.user_id: pr.user for pr in progs}
        origines = agence_de(set(users))
        commandes = defaultdict(dict)
        for c in (Commande.objects.filter(user_id__in=list(users), statut__in=('en_attente', 'retiree'),
                                          menu__typeequipe=equipe, menu__date_menu__gte=jours[0],
                                          menu__date_menu__lte=jours[-1]).select_related('plat', 'menu')):
            commandes[c.user_id][c.menu.date_menu] = c
        changements = (Commande.objects.filter(user_id__in=list(users), motif_annulation='planning',
                                               menu__date_menu__gte=jours[0], menu__date_menu__lte=jours[-1])
                       .count())
        lignes = []
        nb_jours = nb_cmd = 0
        for uid, ps in par_user.items():
            u = users[uid]
            cases = []
            for d in jours:
                prog = next((x for x in ps if couvre(x, d)), None)
                c = commandes[uid].get(d)
                if prog:
                    nb_jours += 1
                if c:
                    nb_cmd += 1
                cases.append({'date': d.isoformat(), 'programme': prog is not None,
                              'programmation_id': prog.id if prog else None,
                              'commande': ({'id': c.id, 'plat': c.plat.nom, 'statut': c.statut} if c else None)})
            ag = origines.get(uid)
            tous = _progs(u, equipe)
            lignes.append({
                'employe': {'id': u.id, 'nom': nom(u), 'matricule': u.username,
                            'agence': ag.nom_agence if ag else None, 'agence_id': ag.id if ag else None},
                'jours': cases,
                'programmations': [{'id': x.id, 'date_debut': x.date_debut.isoformat(),
                                    'date_fin': x.date_fin.isoformat() if x.date_fin else None,
                                    'jours': sorted(jours_de(x)), 'jours_libelle': jours_txt(x.jours),
                                    'libelle': periode_txt(x.date_debut, x.date_fin),
                                    'importee': x.importee, 'motif': x.motif,
                                    'saisi_par': ('Import Excel' if x.importee else
                                                  (nom(x.user_created) if x.user_created_id else ''))}
                                   for x in tous if x.date_fin is None or x.date_fin >= timezone.localdate()
                                   or x in ps],
            })
        lignes.sort(key=lambda l: l['employe']['nom'].upper())
        base['lignes'] = lignes
        base['kpi'] = {'employes': len(lignes), 'repas_commandes': nb_cmd, 'employes_jours': nb_jours,
                       'changements': changements}
        return Response(base)


class PlanningEmployesView(APIView):
    """GET planning-equipes/employes/?agence=&q= : employés programmables (40 au plus)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        verifier_saisie(request.user)
        q = request.query_params
        agence_id = int(q['agence']) if str(q.get('agence') or '').isdigit() else None
        users = _employes_geres(request.user, agence_id)
        texte = (q.get('q') or '').strip()
        if texte:
            users = users.filter(Q(nom__icontains=texte) | Q(prenom__icontains=texte) | Q(username__icontains=texte))
        users = list(users.order_by('nom', 'prenom')[:40])
        origines = agence_de({u.id for u in users})
        return Response([{'id': u.id, 'nom': nom(u), 'matricule': u.username,
                          'agence': origines[u.id].nom_agence if u.id in origines else None}
                         for u in users])


class PlanningHistoriqueView(APIView):
    """GET planning-equipes/historique/?user=&typeequipe= : journal (100 dernières lignes)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        verifier_saisie(request.user)
        q = request.query_params
        qs = HistoriqueProgrammation.objects.filter(user__in=_employes_geres(request.user))
        if str(q.get('user') or '').isdigit():
            qs = qs.filter(user_id=int(q['user']))
        if str(q.get('typeequipe') or '').isdigit():
            qs = qs.filter(typeequipe_id=int(q['typeequipe']))
        return Response([{'id': h.id, 'employe': nom(h.user), 'matricule': h.user.username,
                          'equipe': h.typeequipe.libelle, 'action': h.action,
                          'action_libelle': h.get_action_display(), 'description': h.description,
                          'motif': h.motif, 'par': nom(h.par) if h.par_id else None,
                          'date': h.created_at.isoformat()}
                         for h in qs.select_related('user', 'typeequipe', 'par')[:100]])


class ProgrammerView(APIView):
    """POST planning-equipes/programmer/ {typeequipe, user_ids, date_debut, date_fin, jours, motif, apercu}"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        verifier_saisie(request.user)
        d = request.data
        equipe = equipe_planning(d.get('typeequipe'))
        ids = d.get('user_ids') or []
        if not isinstance(ids, list) or not ids:
            raise ValidationError({'user_ids': "Sélectionnez au moins un employé."})
        debut = lire_date(d.get('date_debut'), 'date_debut')
        fin = lire_date(d.get('date_fin'), 'date_fin', requis=False)
        if fin is not None and fin < debut:
            raise ValidationError({'date_fin': "La date de fin doit être après la date de début."})
        jours = lire_jours(d.get('jours'))
        apercu = _vrai(d.get('apercu'))
        p = ParametresSociete.charger()
        rapport = Rapport()
        employes = [_employe(request.user, i) for i in dict.fromkeys(ids)]
        for e in employes:
            programmer(e, equipe, debut, fin, jours, rapport, request.user, d.get('motif') or '', apercu, p)
        return Response({'apercu': apercu, **rapport.json()})


class ProgrammationDetailView(APIView):
    """PATCH / DELETE planning-equipes/<id>/ (apercu=1 : simulation)."""
    permission_classes = [IsAuthenticated]

    def _prog(self, request, pk):
        verifier_saisie(request.user)
        prog = ProgrammationEquipe.objects.select_related('user', 'typeequipe').filter(pk=pk).first()
        if prog is None:
            raise NotFound("Programmation introuvable.")
        verifier_employe_gere(request.user, prog.user)
        return prog

    def patch(self, request, pk):
        prog = self._prog(request, pk)
        d = request.data
        debut = lire_date(d.get('date_debut'), 'date_debut') if 'date_debut' in d else prog.date_debut
        fin = (lire_date(d.get('date_fin'), 'date_fin', requis=False) if 'date_fin' in d else prog.date_fin)
        if fin is not None and fin < debut:
            raise ValidationError({'date_fin': "La date de fin doit être après la date de début."})
        jours = lire_jours(d.get('jours')) if 'jours' in d else sorted(jours_de(prog))
        apercu = _vrai(d.get('apercu'))
        rapport = Rapport()
        nouvelles = [_copie(x, date_debut=debut, date_fin=fin, jours=jours) if x.id == prog.id else _copie(x)
                     for x in _progs(prog.user, prog.typeequipe)]
        texte = periode_txt(debut, fin) + (f" ({jours_txt(jours)})" if sorted(jours) != TOUS_JOURS else '')
        changer(prog.user, prog.typeequipe, nouvelles, rapport, request.user, d.get('motif') or '',
                'modification', f"Période modifiée : {texte}", apercu, ParametresSociete.charger(),
                texte_periode=texte)
        return Response({'apercu': apercu, **rapport.json()})

    def delete(self, request, pk):
        prog = self._prog(request, pk)
        apercu = _vrai(request.query_params.get('apercu'))
        motif = request.query_params.get('motif') or ''
        rapport = Rapport()
        nouvelles = [_copie(x) for x in _progs(prog.user, prog.typeequipe) if x.id != prog.id]
        changer(prog.user, prog.typeequipe, nouvelles, rapport, request.user, motif, 'retrait',
                f"Période supprimée : {periode_txt(prog.date_debut, prog.date_fin)}", apercu,
                ParametresSociete.charger())
        rapport.retires += 1
        return Response({'apercu': apercu, **rapport.json()})


class RetirerView(APIView):
    """POST planning-equipes/retirer/ {user, typeequipe, a_partir_de, motif, apercu}"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        verifier_saisie(request.user)
        d = request.data
        equipe = equipe_planning(d.get('typeequipe'))
        employe = _employe(request.user, d.get('user'))
        a_partir = lire_date(d.get('a_partir_de'), 'a_partir_de', requis=False)
        apercu = _vrai(d.get('apercu'))
        rapport = Rapport()
        if not retirer(employe, equipe, a_partir, None, rapport, request.user, d.get('motif') or '', apercu,
                       ParametresSociete.charger()):
            raise ValidationError(f"{nom(employe)} n'est pas programmé(e) dans l'équipe {equipe.libelle}.")
        return Response({'apercu': apercu, **rapport.json()})


class ImporterView(APIView):
    """
    POST planning-equipes/importer/
      {lignes: [{ligne, matricule, equipe, date_debut, date_fin, jours}], mode: ajouter|remplacer, apercu}
    Le fichier Excel est lu par le navigateur. Chaque ligne est contrôlée ;
    les lignes en erreur sont ignorées. « remplacer » : pour chaque équipe du
    fichier, le planning des employés gérés est remplacé sur la période
    couverte par le fichier (mêmes règles d'annulation que le retrait).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        verifier_saisie(request.user)
        d = request.data
        lignes = d.get('lignes') or []
        if not isinstance(lignes, list) or not lignes:
            raise ValidationError({'lignes': "Le fichier ne contient aucune ligne."})
        if len(lignes) > 2000:
            raise ValidationError({'lignes': "2 000 lignes au plus par import."})
        mode = d.get('mode') or 'ajouter'
        if mode not in ('ajouter', 'remplacer'):
            raise ValidationError({'mode': "Mode invalide (ajouter, remplacer)."})
        apercu = _vrai(d.get('apercu'))
        p = ParametresSociete.charger()
        equipes = {e.libelle.strip().lower(): e for e in TypeEquipe.objects.filter(sur_planning=True)}
        gerables = set(_employes_geres(request.user).values_list('id', flat=True))
        matricules = {str(l.get('matricule') or '').strip() for l in lignes if isinstance(l, dict)}
        users = {u.username: u for u in User.objects.filter(username__in=matricules)}
        # Excel enregistre souvent « 01427 » comme le nombre 1427 : matricules
        # numériques comparés sans les zéros de tête (si un seul compte correspond)
        sans_zeros = defaultdict(list)
        if any(m.isdigit() and m not in users for m in matricules):
            for u in User.objects.filter(username__regex=r'^0+[0-9]+$'):
                sans_zeros[u.username.lstrip('0')].append(u)
        for m in matricules:
            if m not in users and m.isdigit() and len(sans_zeros.get(m.lstrip('0'), [])) == 1:
                users[m] = sans_zeros[m.lstrip('0')][0]
        controles, valides = [], []
        for i, l in enumerate(lignes):
            if not isinstance(l, dict):
                continue
            num = l.get('ligne') or i + 2
            mat = str(l.get('matricule') or '').strip()
            res = {'ligne': num, 'matricule': mat, 'employe': None, 'equipe': str(l.get('equipe') or '').strip(),
                   'date_debut': l.get('date_debut'), 'date_fin': l.get('date_fin'), 'jours': l.get('jours'),
                   'statut': 'ok', 'message': ''}
            try:
                u = users.get(mat)
                if u is None:
                    raise ValidationError("Matricule inconnu")
                res['employe'] = nom(u)
                res['matricule'] = u.username
                if u.id not in gerables:
                    raise ValidationError("Employé hors de vos agences")
                e = equipes.get(res['equipe'].lower())
                if e is None:
                    raise ValidationError("Équipe inconnue ou non réservée au planning")
                debut = lire_date(l.get('date_debut'), 'date_debut')
                fin = lire_date(l.get('date_fin'), 'date_fin', requis=False)
                if fin is not None and fin < debut:
                    raise ValidationError("Date de fin avant la date de début")
                jours = lire_jours(l.get('jours'))
                res.update({'date_debut': debut.isoformat(), 'date_fin': fin.isoformat() if fin else None,
                            'jours': jours, 'periode': periode_txt(debut, fin)
                            + (f" · {jours_txt(jours)}" if jours != TOUS_JOURS else '')})
                existantes = [x for x in ProgrammationEquipe.objects.filter(user=u, typeequipe=e)
                              if x.date_debut <= (fin or date.max) and (x.date_fin is None or x.date_fin >= debut)]
                if existantes and mode == 'ajouter':
                    res['statut'], res['message'] = 'avertissement', "Chevauche une période existante (fusionnée)"
                valides.append((u, e, debut, fin, jours))
            except ValidationError as exc:
                detail = exc.detail
                if isinstance(detail, dict):
                    detail = next(iter(detail.values()))
                if isinstance(detail, list):
                    detail = detail[0]
                res['statut'], res['message'] = 'erreur', str(detail)
            controles.append(res)

        rapport = Rapport()
        if valides:
            par_cle = defaultdict(list)
            for u, e, debut, fin, jours in valides:
                par_cle[(u.id, e.id)].append((u, e, debut, fin, jours))
            if mode == 'ajouter':
                for groupe in par_cle.values():
                    u, e = groupe[0][0], groupe[0][1]
                    nouvelles = [_copie(x) for x in _progs(u, e)]
                    for _, _, debut, fin, jours in groupe:
                        n = ProgrammationEquipe(user=u, typeequipe=e, date_debut=debut, date_fin=fin, jours=jours,
                                                importee=True)
                        n.created_at = n.updated_at = timezone.now()
                        nouvelles.append(n)
                    texte = ', '.join(periode_txt(g[2], g[3]) for g in groupe)
                    changer(u, e, nouvelles, rapport, request.user, 'Import Excel', 'import',
                            f"Programmé(e) par import : {texte}", apercu, p, texte_periode=texte)
                    rapport.programmes += len(groupe)
            else:
                # Période remplacée, par équipe : du plus tôt au plus tard du fichier
                for eid in {e.id for _, e, *_ in valides}:
                    lignes_e = [v for v in valides if v[1].id == eid]
                    e = lignes_e[0][1]
                    debut = min(v[2] for v in lignes_e)
                    fin = None if any(v[3] is None for v in lignes_e) else max(v[3] for v in lignes_e)
                    dans_fichier = {v[0].id for v in lignes_e}
                    concernes = set(ProgrammationEquipe.objects.filter(typeequipe=e, user_id__in=gerables)
                                    .filter(Q(date_fin__isnull=True) | Q(date_fin__gte=debut))
                                    .filter(**({'date_debut__lte': fin} if fin else {}))
                                    .values_list('user_id', flat=True)) | dans_fichier
                    for uid in concernes:
                        u = next((v[0] for v in lignes_e if v[0].id == uid), None) or User.objects.get(pk=uid)
                        nouvelles = _decouper(_progs(u, e), debut, fin)
                        mes = [v for v in lignes_e if v[0].id == uid]
                        for _, _, d1, d2, jours in mes:
                            n = ProgrammationEquipe(user=u, typeequipe=e, date_debut=d1, date_fin=d2, jours=jours,
                                                    importee=True)
                            n.created_at = n.updated_at = timezone.now()
                            nouvelles.append(n)
                        texte = ', '.join(periode_txt(v[2], v[3]) for v in mes)
                        description = (f"Import (remplacement {periode_txt(debut, fin)}) : "
                                       + (f"programmé(e) {texte}" if mes else "retiré(e)"))
                        changer(u, e, nouvelles, rapport, request.user, 'Import Excel', 'import', description,
                                apercu, p, texte_periode=texte)
                        if mes:
                            rapport.programmes += len(mes)
                        else:
                            rapport.retires += 1
        nb_err = sum(1 for c in controles if c['statut'] == 'erreur')
        return Response({'apercu': apercu, 'mode': mode, 'lignes': controles,
                         'nb_valides': len(controles) - nb_err, 'nb_erreurs': nb_err, **rapport.json()})


class CopierSemaineView(APIView):
    """POST planning-equipes/copier-semaine/ {typeequipe, agence, semaine} : reprend la semaine précédente."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        verifier_saisie(request.user)
        d = request.data
        equipe = equipe_planning(d.get('typeequipe'))
        agence_id = int(d['agence']) if str(d.get('agence') or '').isdigit() else None
        ref = lire_date(d.get('semaine'), 'semaine')
        lundi = ref - timedelta(days=ref.weekday())
        precedent = lundi - timedelta(days=7)
        employes = _employes_geres(request.user, agence_id)
        progs = defaultdict(list)
        for x in (ProgrammationEquipe.objects.filter(typeequipe=equipe, user__in=employes, date_debut__lte=lundi - timedelta(days=1))
                  .filter(Q(date_fin__isnull=True) | Q(date_fin__gte=precedent)).select_related('user')):
            progs[x.user_id].append(x)
        p = ParametresSociete.charger()
        rapport = Rapport()
        for uid, ps in progs.items():
            u = ps[0].user
            jours = sorted({(precedent + timedelta(days=i)).weekday() for i in range(7)
                            if any(couvre(x, precedent + timedelta(days=i)) for x in ps)})
            if not jours:
                continue
            deja = _couverture(_progs(u, equipe), lundi, lundi + timedelta(days=6))
            if deja:
                continue  # déjà programmé(e) cette semaine : inchangé
            programmer(u, equipe, lundi, lundi + timedelta(days=6), jours, rapport, request.user,
                       'Copie de la semaine précédente', False, p, action='copie')
        return Response({'apercu': False, **rapport.json()})


# ══════════════════════════════════════════════════════════════
# RAPPELS (commande planifiée : python manage.py taches_planifiees)
# ══════════════════════════════════════════════════════════════

def envoyer_rappels(maintenant=None):
    """
    Employés programmés n'ayant pas commandé : rappel N jours avant la date
    limite de commande (un seul par employé, équipe et jour). Renvoie le nombre envoyé.
    """
    from .models import Menu, RappelPlanning
    from .serializers import date_limite_commande, libelle_date_limite
    p = ParametresSociete.charger()
    if not p.planning_rappel_actif:
        return 0
    maintenant = maintenant or timezone.now()
    aujourdhui = timezone.localdate(maintenant)
    envoyes = 0
    equipes = {e.id: e for e in TypeEquipe.objects.filter(sur_planning=True)}
    if not equipes:
        return 0
    horizon = aujourdhui + timedelta(days=p.planning_rappel_jours + 1 + p.delai_commande_heures // 24 + 1)
    menus = defaultdict(set)
    for eq, d in (Menu.objects.filter(typeequipe_id__in=list(equipes), publie=True, masque=False,
                                      date_menu__gt=aujourdhui, date_menu__lte=horizon)
                  .values_list('typeequipe_id', 'date_menu')):
        menus[eq].add(d)
    for eq, dates in menus.items():
        for d in sorted(dates):
            limite = date_limite_commande(d, p)
            if not (limite - timedelta(days=p.planning_rappel_jours) <= maintenant < limite):
                continue
            progs = (ProgrammationEquipe.objects.filter(typeequipe_id=eq, date_debut__lte=d)
                     .filter(Q(date_fin__isnull=True) | Q(date_fin__gte=d)).select_related('user'))
            for prog in progs:
                if not couvre(prog, d) or not prog.user.is_active:
                    continue
                if Commande.objects.filter(user=prog.user, menu__date_menu=d,
                                           statut__in=('en_attente', 'retiree')).exists():
                    continue
                _, cree = RappelPlanning.objects.get_or_create(user=prog.user, typeequipe_id=eq, date_menu=d)
                if not cree:
                    continue
                _envoyer([prog.user_id], f"Pensez à réserver : équipe {equipes[eq].libelle}",
                         f"Vous êtes programmé(e) dans l'équipe {equipes[eq].libelle} le {jour_txt(d)}. "
                         f"Commandez votre repas avant le {libelle_date_limite(limite)}.")
                envoyes += 1
    return envoyes
