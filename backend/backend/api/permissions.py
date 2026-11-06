"""
Permissions par rôle.

Les rôles sont des groupes Django :
    super_admin  → tout, y compris gérer les autres administrateurs
    admin        → administration de l'application
    gestionnaire → gestion de la cantine (menus, plats, retraits, tableaux de bord)
    employe      → commande ses repas, gère ses allergies, consulte ses données

Espace prestataire (compte rattaché à un Prestataire par User.prestataire) :
    prestataire    → responsable : tout l'espace prestataire (plats, menus,
                     à préparer, comptoir, relevés, statistiques, équipe)
    agent_comptoir → comptoir et liste du jour seulement

Caisse (compte repas prépayé, api/caisse.py) — rôles cumulables avec
« employe » (un caissier mange aussi à la cantine), jamais avec un rôle
prestataire :
    caissier     → écrans de caisse seulement : recherche d'un employé
                   (champs minimaux), recharge, régularisation, ses reçus,
                   sa clôture de caisse ; aucune autre donnée de gestion
    comptabilite → validation des clôtures de caisse, annulation des reçus,
                   remboursement du solde, journaux de caisse
Les administrateurs ont tous ces droits. Personne n'annule ses propres
opérations ni ne valide sa propre clôture de caisse.

Les comptes prestataires sont cloisonnés : ils n'accèdent qu'aux routes de
l'espace prestataire (/prestataire/…) et à quelques routes personnelles
(profil, mot de passe, notifications). Toutes les autres vues utilisent
IsAuthenticated de ce module (et non celui de DRF), qui les refuse.

Un superuser Django est considéré comme super_admin.
"""

from rest_framework import permissions

ROLE_SUPER_ADMIN  = 'super_admin'
ROLE_ADMIN        = 'admin'
ROLE_GESTIONNAIRE = 'gestionnaire'
ROLE_EMPLOYE      = 'employe'
ROLE_PRESTATAIRE    = 'prestataire'
ROLE_AGENT_COMPTOIR = 'agent_comptoir'
ROLE_CAISSIER       = 'caissier'
ROLE_COMPTABILITE   = 'comptabilite'

ADMIN_ROLES        = {ROLE_SUPER_ADMIN, ROLE_ADMIN}
GESTIONNAIRE_ROLES = ADMIN_ROLES | {ROLE_GESTIONNAIRE}
PRESTATAIRE_ROLES  = {ROLE_PRESTATAIRE, ROLE_AGENT_COMPTOIR}
CAISSE_ROLES       = {ROLE_CAISSIER, ROLE_COMPTABILITE}

# Libellés des rôles (écrans d'administration, messages)
LIBELLES_ROLES = {
    ROLE_SUPER_ADMIN: 'Super administrateur', ROLE_ADMIN: 'Administrateur',
    ROLE_GESTIONNAIRE: 'Gestionnaire', ROLE_EMPLOYE: 'Employé',
    ROLE_PRESTATAIRE: 'Prestataire (responsable)', ROLE_AGENT_COMPTOIR: 'Agent de comptoir',
    ROLE_CAISSIER: 'Caissier', ROLE_COMPTABILITE: 'Comptabilité',
}


def get_roles(user):
    """Noms des groupes de l'utilisateur (mis en cache sur l'objet pour la requête)."""
    if not user or not user.is_authenticated:
        return set()
    if not hasattr(user, '_roles_cache'):
        user._roles_cache = set(user.groups.values_list('name', flat=True))
    return user._roles_cache


def is_super_admin(user):
    return bool(user and user.is_authenticated and
                (user.is_superuser or ROLE_SUPER_ADMIN in get_roles(user)))


def is_admin(user):
    return bool(user and user.is_authenticated and
                (user.is_superuser or get_roles(user) & ADMIN_ROLES))


def is_gestionnaire(user):
    """Vrai pour les gestionnaires ET les administrateurs."""
    return bool(user and user.is_authenticated and
                (user.is_superuser or get_roles(user) & GESTIONNAIRE_ROLES))


def is_compte_prestataire(user):
    """
    Compte de l'espace prestataire (responsable ou agent de comptoir).
    Un compte UbiPharm (gestionnaire, admin, superuser) n'en est jamais un.
    """
    return bool(user and user.is_authenticated and not user.is_superuser
                and get_roles(user) & PRESTATAIRE_ROLES
                and not get_roles(user) & GESTIONNAIRE_ROLES)


def is_prestataire_responsable(user):
    """Responsable du prestataire (tout l'espace prestataire), rattaché à un prestataire."""
    return bool(is_compte_prestataire(user) and ROLE_PRESTATAIRE in get_roles(user)
                and user.prestataire_id)


def is_agent_comptoir(user):
    """Agent de comptoir OU responsable : le comptoir leur est ouvert à tous deux."""
    return bool(is_compte_prestataire(user) and user.prestataire_id)


def is_caissier(user):
    """Caissier (encaissements) ou administrateur."""
    return bool(user and user.is_authenticated and not is_compte_prestataire(user)
                and (is_admin(user) or ROLE_CAISSIER in get_roles(user)))


def is_comptabilite(user):
    """Comptabilité (contrôle de la caisse) ou administrateur."""
    return bool(user and user.is_authenticated and not is_compte_prestataire(user)
                and (is_admin(user) or ROLE_COMPTABILITE in get_roles(user)))


def is_acces_caisse(user):
    """Écrans de caisse en lecture : caissier, comptabilité ou administrateur."""
    return is_caissier(user) or is_comptabilite(user)


def agences_prestataire(user, a_date=None):
    """
    Agences que le prestataire du compte dessert à la date donnée (aujourd'hui
    par défaut) : rattachements AgencePrestataire en cours. Ensemble vide pour
    un compte sans prestataire ; None pour un compte UbiPharm (non concerné).
    """
    if not is_compte_prestataire(user):
        return None
    if not user.prestataire_id:
        return set()
    cle = f'_agences_prestataire_{a_date}'
    if not hasattr(user, cle):
        from django.utils import timezone
        from .facturation import ligne_active
        from .models import AgencePrestataire
        d = a_date or timezone.localdate()
        par_agence = {}
        for ap in AgencePrestataire.objects.filter(prestataire_id=user.prestataire_id):
            par_agence.setdefault(ap.agence_id, []).append(ap)
        setattr(user, cle, {a for a, lignes in par_agence.items() if ligne_active(lignes, d)})
    return getattr(user, cle)


def agences_gerees(user):
    """
    Agences dont un gestionnaire s'occupe (commandes, retraits, menus, plats,
    facturation) : None pour un administrateur (toutes), sinon les agences
    auxquelles il est rattaché aujourd'hui (ensemble vide s'il n'en a aucune).
    """
    if is_admin(user):
        return None
    if not hasattr(user, '_agences_cache'):
        from django.db.models import Q
        from django.utils import timezone
        from .models import UserAgence
        maintenant = timezone.now()
        user._agences_cache = set(
            UserAgence.objects.filter(user=user, date_debut__lte=maintenant)
            .filter(Q(date_fin__isnull=True) | Q(date_fin__gte=maintenant))
            .values_list('agence_id', flat=True)
        )
    return user._agences_cache


class IsAuthenticated(permissions.BasePermission):
    """
    Utilisateur connecté de l'application UbiPharm : les comptes prestataires
    sont refusés (à utiliser à la place du IsAuthenticated de DRF).
    """
    message = "Cet écran n'est pas accessible depuis l'espace prestataire."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and not is_compte_prestataire(request.user))


class IsConnecte(permissions.BasePermission):
    """Tout utilisateur connecté, comptes prestataires compris (profil, notifications…)."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)


class IsPrestataireResponsable(permissions.BasePermission):
    """Responsable d'un prestataire (espace prestataire complet)."""
    message = "Action réservée au responsable du prestataire."

    def has_permission(self, request, view):
        return is_prestataire_responsable(request.user)


class IsAgentComptoir(permissions.BasePermission):
    """Comptoir : agents de comptoir et responsables d'un prestataire."""
    message = "Accès réservé aux comptes du prestataire."

    def has_permission(self, request, view):
        return is_agent_comptoir(request.user)


class IsGestionnaireOuPrestataire(permissions.BasePermission):
    """Gestionnaires / administrateurs, ou responsable d'un prestataire (relevés)."""
    message = "Accès réservé aux gestionnaires."

    def has_permission(self, request, view):
        return is_gestionnaire(request.user) or is_prestataire_responsable(request.user)


class IsCaissier(permissions.BasePermission):
    """Opérations de caisse : caissiers et administrateurs."""
    message = "Action réservée aux caissiers."

    def has_permission(self, request, view):
        return is_caissier(request.user)


class IsComptabilite(permissions.BasePermission):
    """Contrôle de la caisse : comptabilité et administrateurs."""
    message = "Action réservée à la comptabilité."

    def has_permission(self, request, view):
        return is_comptabilite(request.user)


class IsAccesCaisse(permissions.BasePermission):
    """Écrans de caisse : caissiers, comptabilité et administrateurs."""
    message = "Accès réservé à la caisse et à la comptabilité."

    def has_permission(self, request, view):
        return is_acces_caisse(request.user)


class IsAdminRole(permissions.BasePermission):
    """Réservé aux rôles super_admin / admin."""
    message = "Action réservée aux administrateurs."

    def has_permission(self, request, view):
        return is_admin(request.user)


class IsGestionnaireRole(permissions.BasePermission):
    """Réservé aux gestionnaires et administrateurs."""
    message = "Action réservée aux gestionnaires."

    def has_permission(self, request, view):
        return is_gestionnaire(request.user)


class ReadAuthenticatedWriteAdmin(permissions.BasePermission):
    """Lecture : tout utilisateur connecté. Écriture : administrateurs."""
    message = "Modification réservée aux administrateurs."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated) or is_compte_prestataire(request.user):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return is_admin(request.user)


class ReadAuthenticatedWriteGestionnaire(permissions.BasePermission):
    """Lecture : tout utilisateur connecté. Écriture : gestionnaires et administrateurs."""
    message = "Modification réservée aux gestionnaires."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated) or is_compte_prestataire(request.user):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return is_gestionnaire(request.user)


class ReadGestionnaireWriteAdmin(permissions.BasePermission):
    """Lecture : gestionnaires et administrateurs. Écriture : administrateurs."""
    message = "Accès réservé aux gestionnaires."

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return is_gestionnaire(request.user)
        return is_admin(request.user)


class IsOwnerOrGestionnaire(permissions.BasePermission):
    """
    Niveau objet : le propriétaire de l'objet (champ `user`, sinon
    `user_created`) ou un gestionnaire / administrateur.
    """
    message = "Vous n'avez pas accès à cet élément."

    def has_permission(self, request, view):
        return not is_compte_prestataire(request.user)

    def has_object_permission(self, request, view, obj):
        if is_gestionnaire(request.user):
            return True
        owner_id = getattr(obj, 'user_id', None)
        if owner_id is None:
            owner_id = getattr(obj, 'user_created_id', None)
        return owner_id is not None and owner_id == request.user.id
