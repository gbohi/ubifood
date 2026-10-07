"""
Permissions par rôle.

Les rôles sont des groupes Django :
    super_admin  → tout, y compris gérer les autres administrateurs
    admin        → administration de l'application
    gestionnaire → gestion de la cantine (menus, plats, retraits, tableaux de bord)
    employe      → commande ses repas, gère ses allergies, consulte ses données

Un superuser Django est considéré comme super_admin.
"""

from rest_framework import permissions

ROLE_SUPER_ADMIN  = 'super_admin'
ROLE_ADMIN        = 'admin'
ROLE_GESTIONNAIRE = 'gestionnaire'
ROLE_EMPLOYE      = 'employe'

ADMIN_ROLES        = {ROLE_SUPER_ADMIN, ROLE_ADMIN}
GESTIONNAIRE_ROLES = ADMIN_ROLES | {ROLE_GESTIONNAIRE}


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
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return is_admin(request.user)


class ReadAuthenticatedWriteGestionnaire(permissions.BasePermission):
    """Lecture : tout utilisateur connecté. Écriture : gestionnaires et administrateurs."""
    message = "Modification réservée aux gestionnaires."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
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

    def has_object_permission(self, request, view, obj):
        if is_gestionnaire(request.user):
            return True
        owner_id = getattr(obj, 'user_id', None)
        if owner_id is None:
            owner_id = getattr(obj, 'user_created_id', None)
        return owner_id is not None and owner_id == request.user.id
