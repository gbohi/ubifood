"""
Règles communes de l'espace prestataire (sans vues) : périmètre d'un
prestataire, historique des menus, horaires du service.

Utilisé par espace_prestataire.py (vues du prestataire), controle.py
(contrôle des retraits et contestations, côté UbiPharm) et views.py
(menus et plats côté gestionnaire).
"""

from django.db.models import Exists, OuterRef, Q

from .facturation import ligne_active
from .models import AgencePrestataire, Menu, MenuHistorique, ParametresSociete


def prestataire_de_l_agence(agence_id, d):
    """Prestataire rattaché à l'agence à la date d (celui qui est facturé), ou None."""
    ap = ligne_active(AgencePrestataire.objects.filter(agence_id=agence_id).select_related('prestataire'), d)
    return ap.prestataire if ap else None


def prestataire_du_menu(menu):
    """
    Prestataire qui sert le menu : Menu.prestataire, sinon (menu historique
    d'UbiPharm) le prestataire rattaché à l'agence à la date du menu.
    """
    if menu.prestataire_id:
        return menu.prestataire
    return prestataire_de_l_agence(menu.agence_id, menu.date_menu)


def filtre_menus_prestataire(prestataire_id, prefixe='', champ_prestataire=None):
    """
    Condition : le menu est servi par le prestataire, c.-à-d.
      - son prestataire (Menu.prestataire) est celui-ci ;
      - ou, menu sans prestataire (historique UbiPharm), son agence lui est
        rattachée à la date du menu (même règle que la facturation).
    `prefixe` : chemin vers le menu depuis le modèle filtré (ex. 'menu__').
    `champ_prestataire` : chemin du prestataire du menu (défaut : prefixe + 'prestataire_id' ;
    ex. 'menu__prestataire_id' pour l'historique, qui porte agence et date).
    """
    champ = champ_prestataire or f'{prefixe}prestataire_id'
    rattachements = AgencePrestataire.objects.filter(
        prestataire_id=prestataire_id,
        agence_id=OuterRef(f'{prefixe}agence_id'),
        date_debut__date__lte=OuterRef(f'{prefixe}date_menu'),
    ).filter(Q(date_fin__isnull=True) | Q(date_fin__date__gte=OuterRef(f'{prefixe}date_menu')))
    return Q(**{champ: prestataire_id}) | (Q(**{f'{champ[:-3]}__isnull': True}) & Exists(rattachements))


def menus_du_prestataire(prestataire_id):
    return Menu.objects.filter(filtre_menus_prestataire(prestataire_id))


def tracer_menu(menu, action, user, description='', motif=''):
    """Ajoute une ligne à l'historique du menu (prestataire ou UbiPharm)."""
    from .permissions import is_compte_prestataire
    return MenuHistorique.objects.create(
        menu=menu if action != 'suppression' else None,
        date_menu=menu.date_menu, agence_id=menu.agence_id, action=action,
        description=description[:500], motif=(motif or '')[:255], user=user,
        par_prestataire=is_compte_prestataire(user),
    )


def horaires_service(agence, parametres=None):
    """(début, fin) du service de l'agence : ses horaires, sinon ceux par défaut."""
    p = parametres or ParametresSociete.charger()
    debut = getattr(agence, 'heure_debut_service', None) or p.heure_debut_service
    fin = getattr(agence, 'heure_fin_service', None) or p.heure_fin_service
    return debut, fin


def horaires_retrait(agence, typeequipe=None, parametres=None):
    """
    (début, fin) du retrait pour une équipe dans une agence : horaires de
    l'équipe (TypeEquipe.heure_debut_retrait / heure_fin_retrait) s'ils sont
    renseignés, sinon ceux de l'agence, sinon ceux par défaut (Paramètres → Société).
    """
    if typeequipe is not None and typeequipe.heure_debut_retrait and typeequipe.heure_fin_retrait:
        return typeequipe.heure_debut_retrait, typeequipe.heure_fin_retrait
    return horaires_service(agence, parametres)


def horaires_menus(agence, menus, parametres=None):
    """
    (début, fin) du service pour des menus d'une agence : du plus tôt au plus
    tard des horaires de retrait de leurs équipes (horaires de l'agence sans menu).
    """
    plages = {horaires_retrait(agence, m.typeequipe, parametres) for m in menus}
    if not plages:
        return horaires_service(agence, parametres)
    return min(d for d, _ in plages), max(f for _, f in plages)


def equipes_horaires_json(agence, menus, parametres=None):
    """Équipes des menus, avec leurs horaires de retrait effectifs (ordre alphabétique)."""
    equipes = {m.typeequipe_id: m.typeequipe for m in menus if m.typeequipe_id}
    return [{'id': e.id, 'libelle': e.libelle, **horaires_json(agence, e, parametres)}
            for e in sorted(equipes.values(), key=lambda e: e.libelle.upper())]


def horaires_json(agence, typeequipe=None, parametres=None):
    """{'heure_debut_service': 'HH:MM', 'heure_fin_service': 'HH:MM'} (horaires effectifs)."""
    debut, fin = horaires_retrait(agence, typeequipe, parametres)
    return {'heure_debut_service': debut.strftime('%H:%M'), 'heure_fin_service': fin.strftime('%H:%M')}


def historique_json(h):
    from .serializers import nom_complet
    return {
        'id': h.id,
        'menu_id': h.menu_id,
        'date_menu': h.date_menu.isoformat(),
        'agence_id': h.agence_id,
        'action': h.action,
        'action_libelle': h.get_action_display(),
        'description': h.description,
        'motif': h.motif,
        'par': nom_complet(h.user) if h.user_id else None,
        'par_prestataire': h.par_prestataire,
        'date': h.created_at.isoformat(),
    }
