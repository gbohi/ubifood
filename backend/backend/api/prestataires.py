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


def filtre_menus_prestataire(prestataire_id, prefixe=''):
    """
    Condition (Exists) : le menu est servi par le prestataire, c.-à-d. son
    agence lui est rattachée à la date du menu (même règle que la facturation).
    `prefixe` : chemin vers le menu depuis le modèle filtré (ex. 'menu__').
    """
    rattachements = AgencePrestataire.objects.filter(
        prestataire_id=prestataire_id,
        agence_id=OuterRef(f'{prefixe}agence_id'),
        date_debut__date__lte=OuterRef(f'{prefixe}date_menu'),
    ).filter(Q(date_fin__isnull=True) | Q(date_fin__date__gte=OuterRef(f'{prefixe}date_menu')))
    return Exists(rattachements)


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
