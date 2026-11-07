"""
Parcours de commande des employés : agence → prestataire → équipe → jour.

Référence complète pour le web et le mobile : parcours-commande/API.md.

Règles :
  - plusieurs prestataires peuvent desservir une agence (AgencePrestataire) ;
    chaque menu porte son prestataire (Menu.prestataire). Les menus
    historiques sans prestataire sont regroupés sous un pseudo-prestataire
    « Cantine UbiPharm » (identifiant 0) ;
  - accès d'un employé : son agence (agence_actuelle) et les agences qui
    acceptent les autres agences (Agence.accepter_autres_agences). Les
    agences fermées lui sont masquées et la commande y est refusée. Un
    gestionnaire accède en plus à ses agences, un administrateur à toutes ;
  - un seul repas par jour, toutes agences et tous prestataires confondus
    (règle vérifiée sous verrou par POST /commandes/) ;
  - note d'un prestataire : moyenne des avis sur ses plats, affichée à
    partir de ParametresSociete.seuil_avis_note avis (sinon « nouveau ») ;
  - facturation inchangée : l'employé paie son repas (compte repas ou
    retenue) ; le prestataire qui a servi est payé dans son relevé.

Commandes « externes » (employé d'une autre agence que celle du menu) :
outils agences_origine / origine_json / lire_origine, utilisés par l'espace
prestataire (à préparer, liste du jour, comptoir), le contrôle des retraits,
le planning et le service du jour des gestionnaires.
"""

from collections import defaultdict
from datetime import date, timedelta

from django.db.models import Avg, Count, Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from . import facturation as fact
from .models import (
    Agence, AgencePrestataire, AvisPlat, Commande, Menu, ParametresSociete, Plat, PlatImage,
    Prestataire, TypeEquipe, UserAgence,
)
from .permissions import IsAuthenticated, agences_gerees, is_admin, is_gestionnaire

ACTIVES = ('en_attente', 'retiree')
JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
# Pseudo-prestataire des menus sans prestataire (menus historiques d'UbiPharm)
CANTINE_UBIPHARM_ID = 0
CANTINE_UBIPHARM_NOM = 'Cantine UbiPharm'
# Jours à venir examinés (équipes proposées, prochain jour à réserver)
HORIZON_JOURS = 21
PHOTOS_PLATS_MAX = 3
ORIGINES = ('toutes', 'mon_agence', 'autres')


# ══════════════════════════════════════════════════════════════
# OUTILS
# ══════════════════════════════════════════════════════════════

def _date(valeur, defaut):
    if not valeur:
        return defaut
    try:
        return date.fromisoformat(str(valeur))
    except ValueError:
        raise ValidationError(f"Date invalide : {valeur} (format AAAA-MM-JJ)")


def _entier(valeur, nom, requis=False):
    if valeur in (None, ''):
        if requis:
            raise ValidationError({nom: f"Paramètre {nom} requis."})
        return None
    if not str(valeur).isdigit():
        raise ValidationError({nom: f"Paramètre {nom} invalide."})
    return int(valeur)


def _jour_libelle(d):
    return f"{JOURS[d.weekday()]} {d:%d/%m}"


def _url(fichier):
    return fichier.url if fichier else None


def code_agence(nom):
    """Initiales de l'agence (« Siège » → « S », « Abidjan Plateau » → « AP »), 3 lettres au plus."""
    mots = [m for m in (nom or '').replace('-', ' ').split() if m[:1].isalnum()]
    if len(mots) == 1:
        return mots[0][:3].upper()
    return ''.join(m[0] for m in mots)[:3].upper() or '?'


def images_plats(plat_ids):
    """{plat_id: [URL des photos, principale d'abord]}"""
    images = defaultdict(list)
    for img in PlatImage.objects.filter(plat_id__in=plat_ids).order_by('-is_principale', 'id'):
        if img.image:
            images[img.plat_id].append(img.image.url)
    return images


def cle_prestataire(menu):
    """Prestataire d'un menu pour le parcours : son id, 0 pour « Cantine UbiPharm »."""
    return menu.prestataire_id or CANTINE_UBIPHARM_ID


def filtre_prestataire(cle, prefixe=''):
    if cle == CANTINE_UBIPHARM_ID:
        return Q(**{f'{prefixe}prestataire__isnull': True})
    return Q(**{f'{prefixe}prestataire_id': cle})


def note_json(moyenne, nb, seuil):
    """Note affichée : null et « nouveau » tant qu'il y a moins de `seuil` avis."""
    if moyenne is None or nb < seuil:
        return {'note': None, 'nb_avis': nb, 'nouveau': True}
    return {'note': round(float(moyenne), 1), 'nb_avis': nb, 'nouveau': False}


def notes_prestataires():
    """{clé prestataire: (moyenne, nombre d'avis)} — avis sur les plats du prestataire."""
    return {(r['plat__prestataire_id'] or CANTINE_UBIPHARM_ID): (r['m'], r['n'])
            for r in AvisPlat.objects.values('plat__prestataire_id').annotate(m=Avg('note'), n=Count('id'))}


def menus_visibles():
    """Menus visibles des employés : publiés et non masqués."""
    return Menu.objects.filter(publie=True, masque=False)


# ══════════════════════════════════════════════════════════════
# ACCÈS AUX AGENCES
# ══════════════════════════════════════════════════════════════

def acces_agences(user):
    """
    (id de l'agence de l'utilisateur ou None, agences accessibles ou None = toutes).
    Employé : son agence + les agences ouvertes aux autres agences.
    Gestionnaire : en plus ses agences. Administrateur : toutes.
    """
    from .serializers import agence_actuelle
    agence = agence_actuelle(user)
    mon = agence.id if agence else None
    if is_admin(user):
        return mon, None
    acces = set(Agence.objects.filter(accepter_autres_agences=True).values_list('id', flat=True))
    if mon is not None:
        acces.add(mon)
    if is_gestionnaire(user):
        acces |= agences_gerees(user) or set()
    return mon, acces


def agence_accessible(user, agence_id):
    acces = acces_agences(user)[1]
    return acces is None or agence_id in acces


def verifier_commande_autorisee(user, menu):
    """Commande d'un employé : refusée dans une agence qui n'accepte pas les autres agences."""
    if not agence_accessible(user, menu.agence_id):
        if acces_agences(user)[0] is None:
            raise PermissionDenied(
                f"Vous n'êtes rattaché à aucune agence : l'agence {menu.agence.nom_agence} n'accepte "
                "pas les commandes des employés des autres agences.")
        raise PermissionDenied(
            f"L'agence {menu.agence.nom_agence} n'accepte pas les commandes des employés "
            "des autres agences.")


def filtrer_menus_accessibles(user, qs, champ_agence='agence_id'):
    acces = acces_agences(user)[1]
    return qs if acces is None else qs.filter(**{f'{champ_agence}__in': acces})


def _agence_demandee(request):
    agence_id = _entier(request.query_params.get('agence'), 'agence', requis=True)
    agence = Agence.objects.filter(pk=agence_id).first()
    if agence is None:
        raise NotFound("Agence introuvable.")
    if not agence_accessible(request.user, agence.id):
        raise PermissionDenied(
            f"L'agence {agence.nom_agence} n'accepte pas les commandes des employés des autres agences.")
    return agence


# ══════════════════════════════════════════════════════════════
# COMMANDES EXTERNES (employé d'une autre agence)
# ══════════════════════════════════════════════════════════════

def agences_origine(user_ids):
    """
    {user_id: Agence} : agence actuelle de chaque employé (ligne UserAgence
    active aujourd'hui, sinon la plus récente — même règle qu'agence_actuelle()).
    """
    maintenant = timezone.now()
    meilleures = {}
    for ua in UserAgence.objects.filter(user_id__in=set(user_ids)).select_related('agence'):
        actif = ua.date_debut <= maintenant and (ua.date_fin is None or ua.date_fin >= maintenant)
        cle = (actif, ua.date_debut, ua.id)
        if ua.user_id not in meilleures or cle > meilleures[ua.user_id][0]:
            meilleures[ua.user_id] = (cle, ua.agence)
    return {uid: v[1] for uid, v in meilleures.items()}


def est_externe(origine, agence_id):
    return origine is not None and origine.id != agence_id


def origine_json(origine, agence_id):
    """Champs ajoutés aux lignes de commande : externe, agence_origine_id, agence_origine."""
    return {'externe': est_externe(origine, agence_id),
            'agence_origine_id': origine.id if origine else None,
            'agence_origine': origine.nom_agence if origine else None}


def lire_origine(request):
    """Paramètre ?origine=toutes|mon_agence|autres (défaut : toutes)."""
    origine = request.query_params.get('origine') or 'toutes'
    if origine not in ORIGINES:
        raise ValidationError({'origine': "Paramètre origine invalide (toutes, mon_agence, autres)."})
    return origine


def garder_origine(origine, externe):
    return origine == 'toutes' or (origine == 'autres') == bool(externe)


def filtrer_commandes_origine(commandes, origine, origines=None):
    """
    Filtre une liste de commandes (avec menu) selon l'origine de l'employé.
    Renvoie (commandes gardées, {commande_id: externe}).
    """
    origines = origines if origines is not None else agences_origine({c.user_id for c in commandes})
    externes = {c.id: est_externe(origines.get(c.user_id), c.menu.agence_id) for c in commandes}
    return [c for c in commandes if garder_origine(origine, externes[c.id])], externes


# ══════════════════════════════════════════════════════════════
# PRESTATAIRES : description
# ══════════════════════════════════════════════════════════════

def prestataire_json(cle, prestataire, notes, seuil):
    """Profil public d'un prestataire (ou de « Cantine UbiPharm »)."""
    moyenne, nb = notes.get(cle, (None, 0))
    if prestataire is None:
        donnees = {'id': CANTINE_UBIPHARM_ID, 'libelle': CANTINE_UBIPHARM_NOM,
                   'nom_affiche': CANTINE_UBIPHARM_NOM, 'cantine_ubipharm': True,
                   'logo_url': None, 'photo_couverture_url': None,
                   'description_courte': '', 'cuisine': '', 'tags': []}
    else:
        donnees = {'id': prestataire.id, 'libelle': prestataire.libelle,
                   'nom_affiche': prestataire.nom_public, 'cantine_ubipharm': False,
                   'logo_url': _url(prestataire.logo),
                   'photo_couverture_url': _url(prestataire.photo_couverture),
                   'description_courte': prestataire.description_courte,
                   'cuisine': prestataire.cuisine, 'tags': prestataire.tags or []}
    return {**donnees, **note_json(moyenne, nb, seuil)}


def _prestataires_de_l_agence(agence, d, menus):
    """
    {clé: Prestataire ou None} : prestataires rattachés à l'agence à la date d,
    plus ceux qui y ont des menus visibles dans la fenêtre (dont « Cantine UbiPharm »).
    """
    par_prest = defaultdict(list)
    for ap in AgencePrestataire.objects.filter(agence=agence).select_related('prestataire'):
        par_prest[ap.prestataire_id].append(ap)
    resultat = {pid: lignes[0].prestataire for pid, lignes in par_prest.items()
                if fact.ligne_active(lignes, d)}
    manquants = {m.prestataire_id for m in menus if m.prestataire_id and m.prestataire_id not in resultat}
    for p in Prestataire.objects.filter(id__in=manquants):
        resultat[p.id] = p
    if any(m.prestataire_id is None for m in menus):
        resultat[CANTINE_UBIPHARM_ID] = None
    return resultat


def _prestataire_demande(cle, agence):
    """Prestataire du parcours (0 : « Cantine UbiPharm ») ; 404 s'il ne dessert pas l'agence."""
    menus = menus_visibles().filter(agence=agence)
    if cle == CANTINE_UBIPHARM_ID:
        if not menus.filter(prestataire__isnull=True).exists():
            raise NotFound("Ce prestataire ne dessert pas cette agence.")
        return None
    prestataire = Prestataire.objects.filter(pk=cle).first()
    if prestataire is None or not (
            AgencePrestataire.objects.filter(agence=agence, prestataire=prestataire).exists()
            or menus.filter(prestataire=prestataire).exists()):
        raise NotFound("Ce prestataire ne dessert pas cette agence.")
    return prestataire


def _horaires(agence, parametres, typeequipe=None):
    """Horaires de retrait effectifs : ceux de l'équipe, sinon de l'agence, sinon par défaut."""
    from .prestataires import horaires_json
    return horaires_json(agence, typeequipe, parametres)


def mon_equipe(user, equipe_id):
    """L'équipe est-elle celle de l'utilisateur ? None si aucune équipe ne lui est attribuée."""
    if not user.typeequipe_id:
        return None
    return equipe_id == user.typeequipe_id


def equipe_utilisateur_json(user):
    """Équipe de l'utilisateur (User.typeequipe) : {id, libelle} ou None."""
    e = user.typeequipe if user.typeequipe_id else None
    return {'id': e.id, 'libelle': e.libelle} if e else None


def tri_equipes(user, equipes, cle='libelle'):
    """Équipe de l'utilisateur d'abord, puis ordre alphabétique."""
    return sorted(equipes, key=lambda e: (user.typeequipe_id is None or e['id'] != user.typeequipe_id,
                                          (e[cle] or '').upper()))


def _commandes_actives(user, debut, fin):
    """Commandes non annulées de l'utilisateur sur la période (toutes agences)."""
    return list(Commande.objects.filter(user=user, statut__in=ACTIVES, menu__date_menu__gte=debut,
                                        menu__date_menu__lte=fin)
                .select_related('plat', 'menu__agence', 'menu__prestataire', 'menu__typeequipe'))


def _commande_json(c, ici=None):
    return {'id': c.id, 'statut': c.statut, 'plat_id': c.plat_id, 'plat': c.plat.nom, 'menu_id': c.menu_id,
            'date_menu': c.menu.date_menu.isoformat(),
            'agence_id': c.menu.agence_id, 'agence': c.menu.agence.nom_agence,
            'prestataire_id': cle_prestataire(c.menu),
            'prestataire': c.menu.prestataire.nom_public if c.menu.prestataire_id else CANTINE_UBIPHARM_NOM,
            'typeequipe_id': c.menu.typeequipe_id,
            'mode_paiement': c.mode_paiement,
            **({'ici': ici} if ici is not None else {})}


# ══════════════════════════════════════════════════════════════
# a. AGENCES
# ══════════════════════════════════════════════════════════════

class CommanderAgencesView(APIView):
    """GET /commander/agences/ : agences où l'utilisateur peut commander (la sienne d'abord)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        mon, acces = acces_agences(user)
        aujourdhui = timezone.localdate()
        lundi = aujourdhui - timedelta(days=aujourdhui.weekday())
        dimanche = lundi + timedelta(days=6)
        agences = Agence.objects.all() if acces is None else Agence.objects.filter(id__in=acces)
        parametres = ParametresSociete.charger()
        aujourd = defaultdict(set)
        semaine = defaultdict(set)
        for agence_id, prest_id, d in (menus_visibles().filter(date_menu__gte=lundi, date_menu__lte=dimanche)
                                       .values_list('agence_id', 'prestataire_id', 'date_menu')):
            cle = prest_id or CANTINE_UBIPHARM_ID
            semaine[agence_id].add(cle)
            if d == aujourdhui:
                aujourd[agence_id].add(cle)
        resultat = []
        for a in agences:
            resultat.append({
                'id': a.id, 'nom': a.nom_agence, 'code': code_agence(a.nom_agence),
                'mon_agence': a.id == mon,
                'accepter_autres_agences': a.accepter_autres_agences,
                'nb_prestataires_aujourdhui': len(aujourd.get(a.id, ())),
                'nb_prestataires_semaine': len(semaine.get(a.id, ())),
                **_horaires(a, parametres),
            })
        resultat.sort(key=lambda x: (not x['mon_agence'], x['nom'].upper()))
        return Response({'date': aujourdhui.isoformat(), 'mon_agence_id': mon,
                         # Employé sans agence : il ne commande que dans les agences ouvertes ;
                         # aucune ouverte → message « Votre agence n'est pas renseignée… »
                         'sans_agence': mon is None,
                         'equipe_utilisateur': equipe_utilisateur_json(user),
                         'agences': resultat})


# ══════════════════════════════════════════════════════════════
# b. PRESTATAIRES DE L'AGENCE
# ══════════════════════════════════════════════════════════════

class CommanderPrestatairesView(APIView):
    """GET /commander/prestataires/?agence=ID&date=AAAA-MM-JJ : prestataires qui desservent l'agence."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        agence = _agence_demandee(request)
        aujourdhui = timezone.localdate()
        maintenant = timezone.now()
        d = _date(request.query_params.get('date'), aujourdhui)
        parametres = ParametresSociete.charger()
        from .serializers import date_limite_commande, libelle_date_limite

        debut, fin = min(d, aujourdhui), max(d, aujourdhui) + timedelta(days=HORIZON_JOURS)
        menus = list(menus_visibles().filter(agence=agence, date_menu__gte=debut, date_menu__lte=fin)
                     .select_related('typeequipe').prefetch_related('menu_plats'))
        prestataires = _prestataires_de_l_agence(agence, d, menus)
        par_cle = defaultdict(list)
        for m in menus:
            par_cle[cle_prestataire(m)].append(m)

        mes = _commandes_actives(user, aujourdhui, aujourdhui + timedelta(days=HORIZON_JOURS))
        jours_pris = {c.menu.date_menu for c in mes}
        notes = notes_prestataires()
        seuil = parametres.seuil_avis_note

        # Photos de plats (couverture de secours) : plats des menus, ceux du jour d'abord
        plat_ids_menus = {cle: [mp.plat_id for m in sorted(ms, key=lambda m: (m.date_menu != d, m.date_menu))
                                for mp in m.menu_plats.all()] for cle, ms in par_cle.items()}
        autres_plats = defaultdict(list)
        for pid, prest_id in (Plat.objects.filter(prestataire_id__in=[k for k in prestataires if k])
                              .filter(Q(agences=agence) | Q(agence=agence), masque=False).distinct()
                              .order_by('nom').values_list('id', 'prestataire_id')):
            autres_plats[prest_id].append(pid)
        tous = {p for ids in plat_ids_menus.values() for p in ids} | {p for ids in autres_plats.values() for p in ids}
        images = images_plats(tous)

        resultat = []
        for cle, prestataire in prestataires.items():
            ms = par_cle.get(cle, [])
            photos = []
            for pid in plat_ids_menus.get(cle, []) + autres_plats.get(cle, []):
                url = (images.get(pid) or [None])[0]
                if url and url not in photos:
                    photos.append(url)
                if len(photos) >= PHOTOS_PLATS_MAX:
                    break
            equipes = {}
            prochain = None
            for m in sorted(ms, key=lambda m: m.date_menu):
                if m.date_menu < aujourdhui:
                    continue
                equipes.setdefault(m.typeequipe_id, m.typeequipe)
                limite = date_limite_commande(m.date_menu, parametres)
                if prochain is None and maintenant < limite and m.date_menu not in jours_pris:
                    prochain = {'date': m.date_menu.isoformat(), 'libelle': _jour_libelle(m.date_menu),
                                'date_limite_commande': limite.isoformat(),
                                'libelle_limite': libelle_date_limite(limite)}
            resultat.append({
                **prestataire_json(cle, prestataire, notes, seuil),
                'photos_plats': photos,
                'nb_plats_jour': len({mp.plat_id for m in ms if m.date_menu == d for mp in m.menu_plats.all()}),
                'equipes': tri_equipes(user, [{'id': e.id, 'libelle': e.libelle,
                                               'mon_equipe': mon_equipe(user, e.id),
                                               **_horaires(agence, parametres, e)}
                                              for e in equipes.values()]),
                'commande_aujourdhui': any(c.menu.date_menu == aujourdhui and cle_prestataire(c.menu) == cle
                                           for c in mes),
                'prochain_jour_a_reserver': prochain,
            })
        # Prestataires qui servent ce jour-là d'abord, « Cantine UbiPharm » en dernier
        resultat.sort(key=lambda p: (p['nb_plats_jour'] == 0, p['cantine_ubipharm'], p['nom_affiche'].upper()))
        return Response({'agence': {'id': agence.id, 'nom': agence.nom_agence, 'code': code_agence(agence.nom_agence)},
                         'date': d.isoformat(), 'seuil_avis_note': seuil,
                         'equipe_utilisateur': equipe_utilisateur_json(user),
                         'prestataires': resultat})


# ══════════════════════════════════════════════════════════════
# c. ÉQUIPES D'UN PRESTATAIRE
# ══════════════════════════════════════════════════════════════

class CommanderEquipesView(APIView):
    """GET /commander/prestataires/<id>/equipes/?agence=ID : équipes avec des menus à venir."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        user = request.user
        agence = _agence_demandee(request)
        prestataire = _prestataire_demande(pk, agence)
        aujourdhui = timezone.localdate()
        parametres = ParametresSociete.charger()
        menus = (menus_visibles().filter(filtre_prestataire(pk), agence=agence, date_menu__gte=aujourdhui,
                                         date_menu__lte=aujourdhui + timedelta(days=HORIZON_JOURS))
                 .select_related('typeequipe').order_by('date_menu'))
        equipes = {}
        for m in menus:
            e = equipes.setdefault(m.typeequipe_id, {
                'id': m.typeequipe_id, 'libelle': m.typeequipe.libelle,
                # Équipe de l'utilisateur (User.typeequipe) ; null s'il n'en a pas
                'mon_equipe': mon_equipe(user, m.typeequipe_id),
                **_horaires(agence, parametres, m.typeequipe), 'jours': []})
            if m.date_menu.isoformat() not in e['jours']:
                e['jours'].append(m.date_menu.isoformat())
        # Équipe de l'utilisateur d'abord (présélectionnée par les écrans)
        resultat = tri_equipes(user, equipes.values())
        for e in resultat:
            e['nb_jours'] = len(e['jours'])
            e['prochain_menu'] = e['jours'][0] if e['jours'] else None
        return Response({
            'agence': {'id': agence.id, 'nom': agence.nom_agence},
            'prestataire': prestataire_json(pk, prestataire, notes_prestataires(), parametres.seuil_avis_note),
            'equipe_utilisateur': equipe_utilisateur_json(user),
            'equipes': resultat,
        })


# ══════════════════════════════════════════════════════════════
# d. JOURS DE LA SEMAINE ET PLATS
# ══════════════════════════════════════════════════════════════

class CommanderJoursView(APIView):
    """
    GET /commander/jours/?agence=ID&prestataire=ID&equipe=ID&semaine=AAAA-MM-JJ
    Semaine (lundi → dimanche) : état de chaque jour pour l'utilisateur et plats proposés.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .serializers import date_limite_annulation, date_limite_commande, libelle_date_limite
        user = request.user
        p = request.query_params
        agence = _agence_demandee(request)
        cle = _entier(p.get('prestataire'), 'prestataire', requis=True)
        prestataire = _prestataire_demande(cle, agence)
        equipe_id = _entier(p.get('equipe'), 'equipe')
        equipe = None
        if equipe_id is not None:
            equipe = TypeEquipe.objects.filter(pk=equipe_id).first()
            if equipe is None:
                raise NotFound("Équipe introuvable.")
        aujourdhui = timezone.localdate()
        maintenant = timezone.now()
        parametres = ParametresSociete.charger()

        selection = menus_visibles().filter(filtre_prestataire(cle), agence=agence)
        if equipe is not None:
            selection = selection.filter(typeequipe=equipe)

        reference = _date(p.get('semaine'), None)
        if reference is None:
            # Semaine en cours ; si plus rien n'y est à réserver, celle du prochain jour à réserver
            reference = aujourdhui
            lundi = aujourdhui - timedelta(days=aujourdhui.weekday())
            pris = {c.menu.date_menu for c in _commandes_actives(
                user, aujourdhui, aujourdhui + timedelta(days=HORIZON_JOURS))}
            for d in sorted(set(selection.filter(date_menu__gte=aujourdhui,
                                                 date_menu__lte=aujourdhui + timedelta(days=HORIZON_JOURS))
                                .values_list('date_menu', flat=True))):
                if d not in pris and maintenant < date_limite_commande(d, parametres):
                    if d > lundi + timedelta(days=6):
                        reference = d
                    break
        lundi = reference - timedelta(days=reference.weekday())
        jours = [lundi + timedelta(days=i) for i in range(7)]

        menus = list(selection.filter(date_menu__gte=jours[0], date_menu__lte=jours[-1])
                     .select_related('typeequipe')
                     .prefetch_related('menu_plats__plat__type_plat')
                     .order_by('date_menu', 'typeequipe__libelle'))
        mes = _commandes_actives(user, jours[0], jours[-1])
        par_jour_cmd = {c.menu.date_menu: c for c in mes}
        ids_menus = {m.id for m in menus}
        plat_ids = {mp.plat_id for m in menus for mp in m.menu_plats.all()}
        images = images_plats(plat_ids)
        seuil = parametres.seuil_avis_note
        notes = {r['plat_id']: (r['m'], r['n']) for r in AvisPlat.objects.filter(plat_id__in=plat_ids)
                 .values('plat_id').annotate(m=Avg('note'), n=Count('id'))}
        tarif = fact.Tarificateur({user.id})

        resultat = []
        for d in jours:
            menus_jour = [m for m in menus if m.date_menu == d]
            limite = date_limite_commande(d, parametres)
            # Annulation possible jusqu'à cette date (affichée avant de commander)
            limite_annul = date_limite_annulation(d, parametres)
            ouvert = d >= aujourdhui and maintenant < limite
            commande = par_jour_cmd.get(d)
            if not menus_jour:
                etat = 'pas_de_menu'
            elif commande is not None:
                etat = 'reserve'
            elif ouvert:
                etat = 'a_reserver'
            else:
                etat = 'ferme'
            prix = tarif.prix(user.id, d)[1]
            plats = []
            for m in menus_jour:
                for mp in sorted(m.menu_plats.all(), key=lambda mp: mp.plat.nom.upper()):
                    pl = mp.plat
                    if commande is not None and commande.menu_id == m.id and commande.plat_id == pl.id:
                        statut = 'commande'
                    elif commande is not None:
                        statut = 'autre_plat_commande'
                    elif not ouvert:
                        statut = 'ferme'
                    else:
                        statut = 'disponible'
                    photos = images.get(pl.id, [])
                    plats.append({
                        'id': pl.id, 'nom': pl.nom, 'description': pl.description,
                        'type_plat_id': pl.type_plat_id,
                        'type_plat': pl.type_plat.libelle if pl.type_plat_id else None,
                        'mentions': pl.mentions or [],
                        'photo_url': photos[0] if photos else None, 'photos': photos,
                        **note_json(*notes.get(pl.id, (None, 0)), seuil),
                        'prix': float(prix) if prix is not None else None,
                        'menu_id': m.id, 'typeequipe_id': m.typeequipe_id,
                        'typeequipe': m.typeequipe.libelle,
                        'mon_equipe': mon_equipe(user, m.typeequipe_id),
                        'date_limite_annulation': limite_annul.isoformat(),
                        'libelle_annulation': libelle_date_limite(limite_annul),
                        'statut': statut,
                        'commande_id': commande.id if statut == 'commande' else None,
                    })
            resultat.append({
                'date': d.isoformat(), 'libelle': _jour_libelle(d), 'etat': etat,
                'date_limite_commande': limite.isoformat(), 'libelle_limite': libelle_date_limite(limite),
                'date_limite_annulation': limite_annul.isoformat(),
                'libelle_annulation': libelle_date_limite(limite_annul),
                'annulable': maintenant < limite_annul,
                'menus': [{'id': m.id, 'typeequipe_id': m.typeequipe_id, 'typeequipe': m.typeequipe.libelle,
                           'mon_equipe': mon_equipe(user, m.typeequipe_id)}
                          for m in menus_jour],
                'commande': _commande_json(commande, ici=commande.menu_id in ids_menus) if commande else None,
                'plats': plats,
            })

        defaut = next((j['date'] for j in resultat if j['etat'] == 'a_reserver'), None)
        if defaut is None:
            if jours[0] <= aujourdhui <= jours[-1]:
                defaut = aujourdhui.isoformat()
            else:
                defaut = next((j['date'] for j in resultat if j['etat'] != 'pas_de_menu'), jours[0].isoformat())
        return Response({
            'agence': {'id': agence.id, 'nom': agence.nom_agence},
            'prestataire': prestataire_json(cle, prestataire, notes_prestataires(), seuil),
            'equipe': ({'id': equipe.id, 'libelle': equipe.libelle, 'mon_equipe': mon_equipe(user, equipe.id)}
                       if equipe else None),
            'equipe_utilisateur': equipe_utilisateur_json(user),
            'semaine': {'debut': jours[0].isoformat(), 'fin': jours[-1].isoformat(),
                        'precedente': (jours[0] - timedelta(days=7)).isoformat(),
                        'suivante': (jours[0] + timedelta(days=7)).isoformat()},
            'aujourdhui': aujourdhui.isoformat(),
            'jour_par_defaut': defaut,
            'mode_paiement_prefere': user.mode_paiement_prefere,
            'jours': resultat,
        })
