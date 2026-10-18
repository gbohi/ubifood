import hmac
import logging
import secrets

from rest_framework import viewsets, filters, status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from django_filters.rest_framework import DjangoFilterBackend
from .models import *
from .serializers import *
from .permissions import (
    IsAdminRole, IsGestionnaireRole, IsOwnerOrGestionnaire,
    ReadAuthenticatedWriteAdmin, ReadAuthenticatedWriteGestionnaire,
    ReadGestionnaireWriteAdmin, is_admin, is_gestionnaire, is_super_admin, agences_gerees,
    ADMIN_ROLES, ROLE_SUPER_ADMIN,
)
from django.conf import settings
from django.contrib.auth.models import Group
from django.db import transaction
from rest_framework.generics import ListAPIView
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.db.models import Avg, Count, Q
from django.shortcuts import get_object_or_404
from decimal import Decimal
from django.utils import timezone
from django.core.exceptions import ValidationError as DjangoValidationError
import requests
from django.core.cache import cache

logger = logging.getLogger(__name__)

from io import BytesIO
from django.http import FileResponse

from .serializers import nom_complet, validate_password_custom
from . import facturation as fact


# ============================================================
# BASE VIEWSET — hérité par tous les autres ViewSets
# ============================================================

_NOMS_LIES = {
    'User': 'des utilisateurs', 'UserAgence': 'des affectations d\'agents',
    'UserService': 'des affectations d\'agents', 'UserPoste': 'des postes d\'agents',
    'UserCategoriesalarie': 'des catégories d\'agents', 'Menu': 'des menus', 'MenuPlat': 'des menus',
    'Plat': 'des plats', 'Commande': 'des commandes', 'Retrait': 'des retraits',
    'Besoin': 'des besoins', 'Vehicule': 'des véhicules', 'Poste': 'des postes',
    'AgencePrestataire': 'des rattachements agence / prestataire',
    'PlatPrestataire': 'des tarifs', 'PlatCategoriesalarie': 'des tarifs',
    'FactureMensuelle': 'des factures', 'FacturePrestataire': 'des factures',
    'AvisPlat': 'des avis', 'Notification': 'des notifications', 'Prestataire': 'des prestataires',
    'Banniere': 'des bannières', 'DeviceToken': 'des appareils', 'ClotureMensuelle': 'des clôtures',
    'PlatImage': 'des photos de plats', 'UserAllergie': 'des allergies', 'BesoinService': 'des besoins',
    'LigneFacture': 'des factures', 'LigneFacturePrestataire': 'des factures', 'EntretienVehicule': 'des entretiens',
}


def refuser_si_utilise(instance, champ_libelle=None):
    """
    Refuse la suppression d'une ligne de référentiel encore utilisée : la
    base supprimerait en cascade tout ce qui y est rattaché.
    """
    from django.db.models.deletion import Collector, ProtectedError, RestrictedError
    nom = getattr(instance, champ_libelle, None) if champ_libelle else None
    nom = f"« {nom} »" if nom else "Cet élément"
    collecteur = Collector(using=instance._state.db or 'default')
    try:
        collecteur.collect([instance])
    except (ProtectedError, RestrictedError):
        raise ValidationError(f"{nom} est utilisé : il ne peut pas être supprimé.")
    lies = {m for m, objets in collecteur.data.items() if m is not type(instance) and objets}
    lies |= {qs.model for qs in collecteur.fast_deletes if qs.exists()}
    lies = {m for m in lies if not m._meta.auto_created}
    if lies:
        libelles = sorted({_NOMS_LIES.get(m.__name__, str(m._meta.verbose_name_plural)) for m in lies})
        raise ValidationError(
            f"{nom} est utilisé par {', '.join(libelles)} : il ne peut pas être supprimé.")


class BaseViewSet(viewsets.ModelViewSet):
    """
    Par défaut : lecture pour tout utilisateur connecté, écriture réservée
    aux administrateurs. Les ViewSets surchargent permission_classes si
    une autre règle s'applique (cantine, données personnelles…).
    """
    permission_classes = [ReadAuthenticatedWriteAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    # Droits de la suppression multiple (administrateurs par défaut)
    bulk_delete_permission_classes = [IsAdminRole]
    # Référentiels : une ligne encore utilisée ne peut pas être supprimée
    # (la suppression effacerait en cascade utilisateurs, menus, commandes…)
    proteger_references = False
    # Champ libellé : deux lignes ne peuvent pas porter le même (casse ignorée)
    champ_libelle = None

    def get_permissions(self):
        if self.action == 'bulk_delete':
            return [p() for p in self.bulk_delete_permission_classes]
        return super().get_permissions()

    def verifier_suppression(self, instance):
        """Lève une ValidationError si `instance` ne doit pas être supprimée."""
        if self.proteger_references:
            refuser_si_utilise(instance, self.champ_libelle)

    def perform_destroy(self, instance):
        self.verifier_suppression(instance)
        instance.delete()

    def _verifier_libelle(self, serializer):
        champ = self.champ_libelle
        if not champ or champ not in serializer.validated_data:
            return
        valeur = (serializer.validated_data[champ] or '').strip()
        if not valeur:
            raise ValidationError("Le libellé est obligatoire.")
        serializer.validated_data[champ] = valeur
        doublons = serializer.Meta.model.objects.filter(**{f'{champ}__iexact': valeur})
        if serializer.instance is not None:
            doublons = doublons.exclude(pk=serializer.instance.pk)
        if doublons.exists():
            raise ValidationError(f"« {valeur} » existe déjà.")

    def perform_create(self, serializer):
        self._verifier_libelle(serializer)
        # Les champs d'audit viennent toujours de l'utilisateur connecté
        serializer.validated_data.pop('user_created', None)
        serializer.save(
            user_created=self.request.user,
            user_updated=self.request.user
        )

    def perform_update(self, serializer):
        self._verifier_libelle(serializer)
        serializer.validated_data.pop('user_created', None)
        serializer.save(user_updated=self.request.user)

    @action(detail=False, methods=['delete'])
    def bulk_delete(self, request):
        ids = request.data.get('ids', [])

        if not isinstance(ids, list) or not ids:
            return Response(
                {"error": "Veuillez fournir une liste d'IDs valide et non vide"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not all(isinstance(i, int) for i in ids):
            return Response(
                {"error": "Tous les IDs doivent être des entiers"},
                status=status.HTTP_400_BAD_REQUEST
            )

        queryset = self.get_queryset().filter(id__in=ids)
        found_count = queryset.count()

        if found_count == 0:
            return Response(
                {"error": "Aucun élément trouvé avec les IDs fournis"},
                status=status.HTTP_404_NOT_FOUND
            )

        with transaction.atomic():
            for instance in queryset:
                self.verifier_suppression(instance)
            deleted_count, _ = queryset.delete()

        return Response({
            "message": f"{deleted_count} élément(s) supprimé(s) avec succès",
            "deleted_count": deleted_count
        }, status=status.HTTP_200_OK)


# ============================================================
# USERS & GROUPES
# ============================================================

class _UserLinkViewSet(BaseViewSet):
    """
    Lignes d'historique rattachées à un user (poste, catégorie, service, agence).
    Lecture : gestionnaires et administrateurs. Écriture : administrateurs.
    Le user d'une ligne existante ne peut pas être changé.
    """
    permission_classes = [ReadGestionnaireWriteAdmin]

    def perform_update(self, serializer):
        instance = serializer.instance
        new_user = serializer.validated_data.get('user', instance.user)
        if instance.user_id != new_user.id:
            raise PermissionDenied(
                f"Impossible de changer le user d'un {instance.__class__.__name__} existant."
            )
        super().perform_update(serializer)


class UserPosteViewSet(_UserLinkViewSet):
    queryset = UserPoste.objects.select_related(
        'user', 'poste', 'statut'
    ).order_by('id')
    serializer_class = UserPosteSerializer
    filterset_fields = ['user', 'poste', 'statut']


class UserCategoriesalarieViewSet(_UserLinkViewSet):
    queryset = UserCategoriesalarie.objects.select_related(
        'user', 'categoriesalarie', 'statut'
    ).order_by('id')
    serializer_class = UserCategoriesalarieSerializer
    filterset_fields = ['user', 'categoriesalarie', 'statut']


class UserAllergieViewSet(BaseViewSet):
    """
    Chaque employé gère ses propres allergies.
    Les gestionnaires et administrateurs voient celles de tout le monde.
    """
    serializer_class = UserAllergieSerializer
    permission_classes = [IsAuthenticated, IsOwnerOrGestionnaire]
    filterset_fields = ['user']

    def get_queryset(self):
        qs = UserAllergie.objects.select_related('user').order_by('id')
        if is_gestionnaire(self.request.user):
            return qs
        return qs.filter(user=self.request.user)

    def perform_create(self, serializer):
        # Un employé ne peut créer une allergie que pour lui-même
        if is_admin(self.request.user) and serializer.validated_data.get('user'):
            user = serializer.validated_data['user']
        else:
            user = self.request.user
        serializer.save(user=user, user_created=self.request.user,
                        user_updated=self.request.user)

    def perform_update(self, serializer):
        instance = serializer.instance
        new_user = serializer.validated_data.get('user', instance.user)
        if instance.user_id != new_user.id:
            raise PermissionDenied(
                "Impossible de changer le user d'une allergie existante."
            )
        super().perform_update(serializer)


def _verifier_peut_gerer(request, cible):
    """
    Règles de gestion des comptes :
    - personne ne peut se désactiver / se supprimer lui-même ;
    - seul un super_admin peut modifier un compte super_admin.
    """
    if cible.is_superuser or cible.groups.filter(name=ROLE_SUPER_ADMIN).exists():
        if not is_super_admin(request.user):
            raise PermissionDenied(
                "Seul un super administrateur peut modifier ce compte."
            )


class UserViewSet(BaseViewSet):
    """
    Gestion des comptes : réservée aux administrateurs.
    Exceptions : /me/, /logout/ et /changer-mot-de-passe/ (utilisateur connecté),
    mot de passe oublié (public, avec limitation de débit).
    """
    # queryset factice requis par le router DRF pour déterminer le basename.
    # La vraie logique est dans get_queryset() ci-dessous.
    queryset = User.objects.none()
    serializer_class = UserSerializer
    permission_classes = [IsAdminRole]
    # Défini par action (mot de passe oublié) ; doit exister au niveau classe
    # pour pouvoir être passé en argument de @action.
    throttle_scope = None
    filterset_fields = ['nom', 'prenom', 'email', 'statut', 'is_active']
    search_fields    = ['nom', 'prenom', 'email', 'username']
    ordering_fields  = ['nom', 'created_at']

    @staticmethod
    def _prefetch(qs):
        from django.db.models import Prefetch
        return qs.select_related('statut').prefetch_related(
            Prefetch('userservice_set',
                     queryset=UserService.objects.select_related('service', 'statut')),
            Prefetch('useragence_set',
                     queryset=UserAgence.objects.select_related('agence', 'statut')),
            Prefetch('userposte_set',
                     queryset=UserPoste.objects.select_related('poste', 'statut')),
            Prefetch('usercategoriesalarie_set',
                     queryset=UserCategoriesalarie.objects.select_related('categoriesalarie', 'statut')),
            Prefetch('userallergie_set',
                     queryset=UserAllergie.objects.all()),
            'groups',
        )

    def get_queryset(self):
        return self._prefetch(User.objects.all()).order_by('id')

    def list(self, request, *args, **kwargs):
        """
        Pagine d'abord sur un queryset léger, puis recharge uniquement les
        users de la page courante avec tous les prefetch.
        """
        base_qs = self.filter_queryset(User.objects.select_related('statut').order_by('id'))
        page_qs = self.paginate_queryset(base_qs)

        if page_qs is not None:
            user_ids = [u.id for u in page_qs]
            users_avec_prefetch = list(
                self._prefetch(User.objects.filter(id__in=user_ids)).order_by('id')
            )
            serializer = self.get_serializer(users_avec_prefetch, many=True)
            return self.get_paginated_response(serializer.data)

        qs = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    def perform_update(self, serializer):
        _verifier_peut_gerer(self.request, serializer.instance)
        if serializer.instance.pk == self.request.user.pk:
            # Éviter qu'un administrateur se bloque lui-même
            if serializer.validated_data.get('is_active') is False:
                raise PermissionDenied("Vous ne pouvez pas désactiver votre propre compte.")
            groupes = serializer.validated_data.get('groups')
            if groupes is not None and not self.request.user.is_superuser \
                    and not {g.name for g in groupes} & ADMIN_ROLES:
                raise PermissionDenied("Vous ne pouvez pas retirer vos propres droits d'administrateur.")
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            raise PermissionDenied("Vous ne pouvez pas supprimer votre propre compte.")
        _verifier_peut_gerer(self.request, instance)
        if instance.factures_mensuelles.exists():
            raise PermissionDenied(
                "Cet agent a des factures clôturées : désactivez le compte au lieu de le supprimer.")
        instance.delete()

    @action(detail=False, methods=['delete'], permission_classes=[IsAdminRole])
    def bulk_delete(self, request):
        ids = request.data.get('ids', [])
        if not isinstance(ids, list) or not ids or not all(isinstance(i, int) for i in ids):
            return Response(
                {"error": "Veuillez fournir une liste d'IDs entiers non vide"},
                status=status.HTTP_400_BAD_REQUEST
            )
        if request.user.pk in ids:
            return Response(
                {"error": "Vous ne pouvez pas supprimer votre propre compte."},
                status=status.HTTP_400_BAD_REQUEST
            )
        users = User.objects.filter(id__in=ids)
        for user in users:
            _verifier_peut_gerer(request, user)
        if users.filter(factures_mensuelles__isnull=False).exists():
            return Response(
                {"error": "Certains agents ont des factures clôturées : désactivez-les au lieu de les supprimer."},
                status=status.HTTP_400_BAD_REQUEST)
        deleted_count, _ = users.delete()
        return Response({
            "message": f"{deleted_count} élément(s) supprimé(s) avec succès",
            "deleted_count": deleted_count
        })

    @action(detail=False, methods=['post'])
    def register(self, request):
        """Création d'un compte par un administrateur (plus d'inscription publique)."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user_created=request.user, user_updated=request.user)
        return Response(
            {"message": "Utilisateur créé avec succès"},
            status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def me(self, request):
        user = self._prefetch(User.objects.filter(pk=request.user.pk)).get()
        serializer = self.get_serializer(user)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def logout(self, request):
        """
        POST /api/api/users/logout/   body : { "refresh": "<refresh token>" }
        Révoque le refresh token et enregistre l'heure de déconnexion.
        """
        refresh = request.data.get('refresh')
        if refresh:
            try:
                RefreshToken(refresh).blacklist()
            except TokenError:
                pass  # déjà expiré ou révoqué : la déconnexion reste valide
        request.user.last_logout = timezone.now()
        request.user.save(update_fields=['last_logout'])
        return Response({'message': 'Déconnecté.'})

    @action(detail=True, methods=['get'])
    def connection_history(self, request, pk=None):
        user = self.get_object()
        connecte = bool(
            user.last_login and
            (not user.last_logout or user.last_login > user.last_logout)
        )
        return Response({
            'username':             user.username,
            'derniere_connexion':   user.last_login.strftime("%Y-%m-%d %H:%M:%S") if user.last_login else None,
            'derniere_deconnexion': user.last_logout.strftime("%Y-%m-%d %H:%M:%S") if user.last_logout else None,
            'statut_actuel':        'Connecté' if connecte else 'Déconnecté',
            'compte_actif':         user.is_active,
        })

    def _changer_activation(self, request, users, actif):
        for user in users:
            if not actif and user.pk == request.user.pk:
                raise PermissionDenied("Vous ne pouvez pas désactiver votre propre compte.")
            _verifier_peut_gerer(request, user)
        return User.objects.filter(pk__in=[u.pk for u in users]).update(is_active=actif)

    @action(detail=True, methods=['patch'], url_path='activer')
    def activer(self, request, pk=None):
        user = self.get_object()
        self._changer_activation(request, [user], True)
        return Response({'message': f'Utilisateur {user.username} activé avec succès.'})

    @action(detail=True, methods=['patch'], url_path='desactiver')
    def desactiver(self, request, pk=None):
        user = self.get_object()
        self._changer_activation(request, [user], False)
        return Response({'message': f'Utilisateur {user.username} désactivé avec succès.'})

    @action(detail=False, methods=['patch'], url_path='activer-multiple')
    def activer_multiple(self, request):
        ids = request.data.get('ids', [])
        if not ids:
            return Response({'error': 'Aucun ID fourni.'}, status=400)
        count = self._changer_activation(request, list(User.objects.filter(id__in=ids)), True)
        return Response({'message': f'{count} utilisateur(s) activé(s) avec succès.'})

    @action(detail=False, methods=['patch'], url_path='desactiver-multiple')
    def desactiver_multiple(self, request):
        ids = request.data.get('ids', [])
        if not ids:
            return Response({'error': 'Aucun ID fourni.'}, status=400)
        count = self._changer_activation(request, list(User.objects.filter(id__in=ids)), False)
        return Response({'message': f'{count} utilisateur(s) désactivé(s) avec succès.'})

    # ── Mot de passe oublié (public) ─────────────────────────
    # Le code (6 chiffres) et le jeton de réinitialisation sont générés avec
    # le module secrets, stockés dans le cache partagé, et le nombre
    # d'essais est limité. Les réponses ne révèlent pas si un compte existe.

    OTP_TTL          = 600   # 10 minutes
    OTP_MAX_ESSAIS   = 5
    MESSAGE_ENVOI    = "Si ce compte existe, un code a été envoyé par SMS au numéro enregistré."

    @staticmethod
    def _envoyer_sms(contact, texte):
        if not (settings.ALLMYSMS_LOGIN and settings.ALLMYSMS_API_KEY):
            logger.error("AllMySMS non configuré (ALLMYSMS_LOGIN / ALLMYSMS_API_KEY absents du .env)")
            return False
        try:
            reponse = requests.post(
                'https://api.allmysms.com/sms/send',
                json={
                    'login':  settings.ALLMYSMS_LOGIN,
                    'apiKey': settings.ALLMYSMS_API_KEY,
                    'from':   settings.ALLMYSMS_SENDER,
                    'to':     contact,
                    'text':   texte,
                },
                timeout=10,
            )
        except requests.RequestException as e:
            logger.error("Envoi SMS impossible : %s", e)
            return False
        if reponse.status_code not in (200, 201):
            logger.error("AllMySMS a répondu %s : %s", reponse.status_code, reponse.text[:200])
            return False
        return True

    @action(
        detail=False, methods=['post'],
        url_path='forgot-password',
        permission_classes=[AllowAny],
        throttle_classes=[ScopedRateThrottle],
        throttle_scope='password_reset',
    )
    def forgot_password(self, request):
        """
        POST /api/api/users/forgot-password/
        Génère un code OTP et l'envoie par SMS au contact du compte.
        """
        username = str(request.data.get('username', '')).strip()
        if not username:
            return Response(
                {'error': 'Le nom d\'utilisateur est requis.'},
                status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(username=username, is_active=True).first()
        contact = (getattr(user, 'contact', '') or '').strip() if user else ''

        if not user or not contact:
            # Même réponse que si le SMS était parti : on ne révèle pas
            # quels identifiants existent.
            return Response({'message': self.MESSAGE_ENVOI}, status=status.HTTP_200_OK)

        code = f"{secrets.randbelow(10 ** 6):06d}"
        cache.set(f'reset_code_{username}', {'code': code, 'essais': 0}, timeout=self.OTP_TTL)

        if not self._envoyer_sms(
            contact,
            f'UbiFood - Votre code de réinitialisation : {code}\nValable 10 minutes.',
        ):
            cache.delete(f'reset_code_{username}')
            return Response(
                {'error': 'Service SMS indisponible. Réessayez plus tard.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response({
            'message':        self.MESSAGE_ENVOI,
            'contact_masque': contact[-4:].rjust(len(contact), '*'),
        }, status=status.HTTP_200_OK)

    @action(
        detail=False, methods=['post'],
        url_path='verify-code',
        permission_classes=[AllowAny],
        throttle_classes=[ScopedRateThrottle],
        throttle_scope='password_reset',
    )
    def verify_code(self, request):
        """
        POST /api/api/users/verify-code/
        Vérifie le code OTP (5 essais maximum) et renvoie un jeton de réinitialisation.
        """
        username = str(request.data.get('username', '')).strip()
        code     = str(request.data.get('code', '')).strip()

        if not username or not code:
            return Response(
                {'error': 'Identifiant et code requis.'},
                status=status.HTTP_400_BAD_REQUEST)

        cache_key = f'reset_code_{username}'
        entree    = cache.get(cache_key)

        if not entree:
            return Response(
                {'error': 'Code expiré ou invalide. Recommencez.'},
                status=status.HTTP_400_BAD_REQUEST)

        if not hmac.compare_digest(entree['code'], code):
            entree['essais'] += 1
            if entree['essais'] >= self.OTP_MAX_ESSAIS:
                cache.delete(cache_key)
                return Response(
                    {'error': 'Trop de tentatives. Demandez un nouveau code.'},
                    status=status.HTTP_400_BAD_REQUEST)
            cache.set(cache_key, entree, timeout=self.OTP_TTL)
            return Response(
                {'error': 'Code incorrect.'},
                status=status.HTTP_400_BAD_REQUEST)

        reset_token = secrets.token_urlsafe(32)
        cache.set(f'reset_token_{username}', reset_token, timeout=self.OTP_TTL)
        cache.delete(cache_key)

        return Response({
            'message':     'Code vérifié.',
            'reset_token': reset_token,
        }, status=status.HTTP_200_OK)

    @action(
        detail=False, methods=['post'],
        url_path='reset-password',
        permission_classes=[AllowAny],
        throttle_classes=[ScopedRateThrottle],
        throttle_scope='password_reset',
    )
    def reset_password(self, request):
        """
        POST /api/api/users/reset-password/
        Réinitialise le mot de passe avec le jeton obtenu par verify-code.
        """
        username    = str(request.data.get('username', '')).strip()
        reset_token = str(request.data.get('reset_token', '')).strip()
        nouveau_mdp = str(request.data.get('password', ''))

        if not username or not reset_token or not nouveau_mdp:
            return Response(
                {'error': 'Données incomplètes.'},
                status=status.HTTP_400_BAD_REQUEST)

        token_stocke = cache.get(f'reset_token_{username}')
        if not token_stocke or not hmac.compare_digest(token_stocke, reset_token):
            return Response(
                {'error': 'Session expirée. Recommencez depuis le début.'},
                status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(username=username, is_active=True).first()
        if not user:
            return Response(
                {'error': 'Session expirée. Recommencez depuis le début.'},
                status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_password_custom(nouveau_mdp)
        except DjangoValidationError as e:
            return Response(
                {'error': e.messages},
                status=status.HTTP_400_BAD_REQUEST)

        user.set_password(nouveau_mdp)
        user.save()
        cache.delete(f'reset_token_{username}')

        return Response(
            {'message': 'Mot de passe réinitialisé avec succès.'},
            status=status.HTTP_200_OK)

    @action(detail=True, methods=['patch'], url_path='changer-mot-de-passe',
            permission_classes=[IsAuthenticated])
    def changer_mot_de_passe(self, request, pk=None):
        """
        PATCH /api/api/users/{id}/changer-mot-de-passe/
        - Utilisateur : uniquement SON mot de passe, ancien mot de passe obligatoire
        - super_admin / admin : celui de n'importe qui (sauf super_admin, réservé aux super_admin)
        Règles : 8 caractères min | 1 majuscule | 1 chiffre | 1 caractère spécial
        """
        user         = self.get_object()
        nouveau_mdp  = request.data.get('password')
        old_password = request.data.get('old_password')
        admin        = is_admin(request.user)

        if request.user.id != user.id:
            if not admin:
                return Response(
                    {'error': 'Vous ne pouvez modifier que votre propre mot de passe.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            _verifier_peut_gerer(request, user)

        # Pour son propre compte, l'ancien mot de passe est toujours exigé
        if request.user.id == user.id:
            if not old_password:
                return Response(
                    {'error': 'L\'ancien mot de passe est requis.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if not user.check_password(old_password):
                return Response(
                    {'error': 'Mot de passe actuel incorrect.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        if not nouveau_mdp:
            return Response(
                {'error': 'Le nouveau mot de passe est requis.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            validate_password_custom(nouveau_mdp)
        except DjangoValidationError as e:
            return Response(
                {'error': e.messages},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.set_password(nouveau_mdp)
        user.save()
        return Response({'message': 'Mot de passe modifié avec succès.'})


class AllUserNopginListAPIView(ListAPIView):
    """Tous les agents (facturation, gestion des commandes) : gestionnaires et admins."""
    serializer_class   = UserSerializer
    permission_classes = [IsGestionnaireRole]
    pagination_class   = None

    def get_queryset(self):
        # Prefetch des historiques : évite plusieurs requêtes SQL par agent
        return UserViewSet._prefetch(User.objects.all()).order_by('nom', 'prenom')


class GroupViewSet(viewsets.ModelViewSet):
    """
    Rôles (groupes Django) : réservé aux administrateurs.
    Les quatre rôles de l'application ne peuvent pas être supprimés ni renommés.
    """
    queryset = Group.objects.all().order_by('id')
    serializer_class = GroupSerializer
    permission_classes = [IsAdminRole]

    ROLES_SYSTEME = {'super_admin', 'admin', 'gestionnaire', 'employe'}

    def _proteger(self, group):
        if group.name in self.ROLES_SYSTEME:
            raise PermissionDenied(f"Le rôle « {group.name} » est un rôle système.")

    def perform_update(self, serializer):
        self._proteger(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._proteger(instance)
        instance.delete()

    @action(detail=False, methods=['delete'])
    def bulk_delete(self, request):
        ids = request.data.get('ids', [])

        if not isinstance(ids, list) or not ids:
            return Response(
                {"error": "Veuillez fournir une liste d'IDs valide et non vide"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not all(isinstance(i, int) for i in ids):
            return Response(
                {"error": "Tous les IDs doivent être des entiers"},
                status=status.HTTP_400_BAD_REQUEST
            )

        groups = Group.objects.filter(id__in=ids)
        for group in groups:
            self._proteger(group)
        deleted_count, _ = groups.delete()

        return Response({
            "message": f"{deleted_count} rôle(s) supprimé(s) avec succès",
            "deleted_count": deleted_count
        })


# ============================================================
# RÉFÉRENTIELS
# ============================================================

class AgenceViewSet(BaseViewSet):
    proteger_references = True
    champ_libelle = 'nom_agence'
    queryset = Agence.objects.all().order_by('id')
    serializer_class = AgenceSerializer
    filterset_fields = ['nom_agence']
    search_fields = ['nom_agence']
    ordering_fields = ['nom_agence', 'created_at']


class AllAgenceNopginListAPIView(ListAPIView):
    queryset = Agence.objects.all()
    serializer_class = AgenceSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class EtatViewSet(BaseViewSet):
    proteger_references = True
    champ_libelle = 'libelle_etat'
    search_fields = ['libelle_etat']
    queryset = Etat.objects.all().order_by('id')
    serializer_class = EtatSerializer


class StatutViewSet(BaseViewSet):
    proteger_references = True
    champ_libelle = 'libelle_statut'
    search_fields = ['libelle_statut']
    queryset = Statut.objects.all().order_by('id')
    serializer_class = StatutSerializer


class PublicStatutListAPIView(ListAPIView):
    queryset = Statut.objects.all()
    serializer_class = StatutSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class PublicEtatListAPIView(ListAPIView):
    queryset = Etat.objects.all()
    serializer_class = EtatSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class ServiceViewSet(BaseViewSet):
    proteger_references = True
    champ_libelle = 'libelle_service'
    search_fields = ['libelle_service']
    queryset = Service.objects.all().order_by('id')
    serializer_class = ServiceSerializer


class TypeBesoinViewSet(BaseViewSet):
    proteger_references = True
    champ_libelle = 'libelle'
    search_fields = ['libelle']
    queryset = TypeBesoin.objects.all().order_by('id')
    serializer_class = TypeBesoinSerializer


class PrioriteViewSet(BaseViewSet):
    proteger_references = True
    champ_libelle = 'libelle'
    search_fields = ['libelle']
    queryset = Priorite.objects.all().order_by('id')
    serializer_class = PrioriteSerializer


class UserServiceViewSet(_UserLinkViewSet):
    queryset = (
        UserService.objects
        .select_related('user', 'service', 'statut')
        .order_by('id')
    )
    serializer_class = UserServiceSerializer
    filterset_fields = ['user', 'service', 'statut']


class UserAgenceViewSet(_UserLinkViewSet):
    queryset = (
        UserAgence.objects
        .select_related('user', 'agence', 'statut')
        .order_by('id')
    )
    serializer_class = UserAgenceSerializer
    filterset_fields = ['user', 'agence', 'statut']


class FonctionViewSet(BaseViewSet):
    proteger_references = True
    champ_libelle = 'libelle'
    queryset = Fonction.objects.all().order_by('id')
    serializer_class = FonctionSerializer
    filterset_fields = ['libelle']
    search_fields = ['libelle']
    ordering_fields = ['libelle', 'created_at']


class CategoriesalarieViewSet(BaseViewSet):
    proteger_references = True
    champ_libelle = 'libelle'
    queryset = Categoriesalarie.objects.all().order_by('id')
    serializer_class = CategoriesalarieSerializer
    filterset_fields = ['libelle']
    search_fields = ['libelle']
    ordering_fields = ['libelle', 'created_at']


class PrestataireViewSet(BaseViewSet):
    proteger_references = True
    champ_libelle = 'libelle'
    permission_classes = [ReadGestionnaireWriteAdmin]
    queryset = Prestataire.objects.all().order_by('id')
    serializer_class = PrestataireSerializer
    filterset_fields = ['libelle']
    search_fields = ['libelle']
    ordering_fields = ['libelle', 'created_at']

    # Factures, tarifs et rattachements d'agence : suppression refusée
    # (vérification générique de BaseViewSet)


class PlatPrestataireViewSet(BaseViewSet):
    permission_classes = [ReadGestionnaireWriteAdmin]
    queryset = PlatPrestataire.objects.all().order_by('-date_debut')
    serializer_class = PlatPrestataireSerializer
    filterset_fields = ['prestataire', 'statut']
    ordering_fields  = ['date_debut', 'created_at']


class AgencePrestataireViewSet(BaseViewSet):
    permission_classes = [ReadGestionnaireWriteAdmin]
    queryset = AgencePrestataire.objects.all().order_by('-date_debut')
    serializer_class = AgencePrestataireSerializer
    filterset_fields = ['prestataire', 'agence', 'statut']
    ordering_fields  = ['date_debut', 'created_at']


class PlatCategoriesalarieViewSet(BaseViewSet):
    permission_classes = [ReadGestionnaireWriteAdmin]
    queryset = PlatCategoriesalarie.objects.all().order_by('-date_debut')
    serializer_class = PlatCategoriesalarieSerializer
    filterset_fields = ['categoriesalarie', 'statut']
    ordering_fields  = ['date_debut', 'created_at']


class PosteViewSet(BaseViewSet):
    proteger_references = True
    champ_libelle = 'libelle'
    queryset = Poste.objects.select_related('fonction', 'service').all().order_by('id')
    serializer_class = PosteSerializer
    filterset_fields = ['libelle', 'fonction', 'service']
    search_fields    = ['libelle']
    ordering_fields  = ['libelle', 'created_at']


# ============================================================
# BESOINS
# ============================================================

class BesoinViewSet(BaseViewSet):
    """
    Besoins : module réservé pour l'instant aux administrateurs
    (création, suivi et traitement de tous les besoins).
    """
    queryset = (
        Besoin.objects
        .select_related('typebesoin', 'etat', 'priorite', 'user')
        .prefetch_related('besoinservice_set__service', 'documents')
        .order_by('id')
    )
    serializer_class   = BesoinSerializer
    permission_classes = [IsAdminRole]  # Besoins : réservé aux administrateurs
    filterset_fields   = ['reference', 'titre', 'typebesoin', 'etat', 'priorite', 'user']
    search_fields      = ['reference', 'titre', 'description']
    ordering_fields    = ['date_debut', 'date_fin', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        if is_admin(self.request.user):
            return qs
        return qs.filter(user=self.request.user)

    def perform_create(self, serializer):
        user = serializer.validated_data.get('user')
        if not is_admin(self.request.user) or user is None:
            user = self.request.user
        serializer.save(user=user, user_created=self.request.user,
                        user_updated=self.request.user)

    def perform_update(self, serializer):
        if not is_admin(self.request.user):
            serializer.validated_data.pop('user', None)
        super().perform_update(serializer)

    # ── Mes besoins ───────────────────────────────────────────
    @action(detail=False, methods=['get'])
    def mes_besoins(self, request):
        besoins    = self.get_queryset().filter(user=request.user)
        page       = self.paginate_queryset(besoins)
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    # ── Statistiques par état ─────────────────────────────────
    @action(detail=False, methods=['get'], url_path='statistiques-par-etat')
    def statistiques_par_etat(self, request):
        data = (
            self.get_queryset()
            .values('etat__libelle_etat')
            .annotate(nombre=Count('id'))
            .order_by('etat__libelle_etat')
        )
        result = [{'etat': d['etat__libelle_etat'], 'nombre': d['nombre']} for d in data]
        return Response(result)

    # ── Statistiques par priorité ─────────────────────────────
    @action(detail=False, methods=['get'], url_path='statistiques-par-priorite')
    def statistiques_par_priorite(self, request):
        data = (
            self.get_queryset()
            .values('priorite__libelle')
            .annotate(nombre=Count('id'))
            .order_by('priorite__libelle')
        )
        result = [{'priorite': d['priorite__libelle'], 'nombre': d['nombre']} for d in data]
        return Response(result)

    # ── Statistiques globales ─────────────────────────────────
    @action(detail=False, methods=['get'], url_path='statistiques-globales')
    def statistiques_globales(self, request):
        etats = (
            self.get_queryset()
            .values('etat__libelle_etat')
            .annotate(nombre=Count('id'))
            .order_by('etat__libelle_etat')
        )
        etat_result = [{'etat': d['etat__libelle_etat'], 'nombre': d['nombre']} for d in etats]

        priorites = (
            self.get_queryset()
            .values('priorite__libelle')
            .annotate(nombre=Count('id'))
            .order_by('priorite__libelle')
        )
        priorite_result = [{'priorite': d['priorite__libelle'], 'nombre': d['nombre']} for d in priorites]

        total_besoins     = sum(item['nombre'] for item in etat_result)
        total_cloture     = sum(item['nombre'] for item in etat_result if (item['etat'] or '').lower() in ['clôturé', 'cloturé', 'clôturés'])
        total_annule      = sum(item['nombre'] for item in etat_result if (item['etat'] or '').lower() in ['annulé', 'annulés'])
        total_non_cloture = total_besoins - total_cloture - total_annule

        return Response({
            'par_etat':          etat_result,
            'par_priorite':      priorite_result,
            'total_non_cloture': total_non_cloture,
            'total_besoin':      total_besoins,
        })

    # ── Mise à jour ───────────────────────────────────────────
    def update(self, request, *args, **kwargs):
        partial    = kwargs.pop('partial', False)
        instance   = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        self.perform_update(serializer)
        return Response(serializer.data)

    # ── ✅ Ajouter des documents à un besoin existant ─────────
    # POST /api/api/besoins/{id}/ajouter-documents/
    # Champ attendu : documents[] (un ou plusieurs fichiers)
    @action(
        detail=True,
        methods=['post'],
        url_path='ajouter-documents',
        parser_classes=[MultiPartParser, FormParser],
    )
    def ajouter_documents(self, request, pk=None):
        besoin = self.get_object()
        files  = request.FILES.getlist('documents[]')

        if not files:
            return Response(
                {'error': 'Aucun fichier fourni. Utilisez la clé documents[].'},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            docs = enregistrer_documents_besoin(besoin, files)
        return Response(BesoinDocumentSerializer(docs, many=True).data, status=status.HTTP_201_CREATED)

    # ── ✅ Supprimer un document rattaché à un besoin ─────────
    # DELETE /api/api/besoins/{id}/supprimer-document/?document_id=<id>
    @action(
        detail=True,
        methods=['delete'],
        url_path='supprimer-document',
    )
    def supprimer_document(self, request, pk=None):
        besoin      = self.get_object()
        document_id = request.query_params.get('document_id')

        if not document_id:
            return Response(
                {'error': 'Paramètre document_id requis.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            doc = BesoinDocument.objects.get(id=document_id, besoin=besoin)
        except BesoinDocument.DoesNotExist:
            return Response(
                {'error': 'Document introuvable pour ce besoin.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # ✅ Supprimer aussi le fichier physique du disque
        if doc.document:
            try:
                doc.document.delete(save=False)
            except Exception:
                pass  # Ne pas bloquer si le fichier est déjà absent

        doc.delete()
        return Response(
            {'message': 'Document supprimé avec succès.'},
            status=status.HTTP_200_OK
        )


class _BesoinEnfantViewSet(BaseViewSet):
    """Services et documents d'un besoin (administrateurs)."""
    permission_classes = [IsAdminRole]

    def get_queryset(self):
        qs = super().get_queryset()
        if is_admin(self.request.user):
            return qs
        return qs.filter(besoin__user=self.request.user)

    def _verifier_besoin(self, serializer):
        besoin = serializer.validated_data.get('besoin')
        if besoin and not is_admin(self.request.user) and besoin.user_id != self.request.user.id:
            raise PermissionDenied("Ce besoin ne vous appartient pas.")

    def perform_create(self, serializer):
        self._verifier_besoin(serializer)
        super().perform_create(serializer)

    def perform_update(self, serializer):
        self._verifier_besoin(serializer)
        super().perform_update(serializer)


class BesoinServiceViewSet(_BesoinEnfantViewSet):
    queryset = BesoinService.objects.all().order_by('id')
    serializer_class = BesoinServiceSerializer


class BesoinDocumentViewSet(_BesoinEnfantViewSet):
    queryset = BesoinDocument.objects.all().order_by('id')
    serializer_class = BesoinDocumentSerializer


class PublicTypeBesoinListAPIView(ListAPIView):
    queryset = TypeBesoin.objects.all()
    serializer_class = TypeBesoinSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class PublicPrioriteListAPIView(ListAPIView):
    queryset = Priorite.objects.all()
    serializer_class = PrioriteSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class BesoinCreateView(APIView):
    permission_classes = [IsAdminRole]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, format=None):
        serializer = BesoinWithDocumentsSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            # Un utilisateur ne peut créer un besoin qu'en son nom
            user = serializer.validated_data.get('user')
            if not is_admin(request.user) or user is None:
                user = request.user
            besoin = serializer.save(user=user, user_created=request.user,
                                     user_updated=request.user)
            return Response(
                {"message": "Besoin et documents enregistrés avec succès", "besoin_id": besoin.id},
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ============================================================
# CANTINE
# ============================================================

class TypePlatViewSet(BaseViewSet):
    proteger_references = True
    bulk_delete_permission_classes = [IsGestionnaireRole]
    champ_libelle = 'libelle'
    search_fields = ['libelle']
    permission_classes = [ReadAuthenticatedWriteGestionnaire]
    queryset = TypePlat.objects.all().order_by('id')
    serializer_class = TypePlatSerializer


class TypeEquipeViewSet(BaseViewSet):
    proteger_references = True
    bulk_delete_permission_classes = [IsGestionnaireRole]
    champ_libelle = 'libelle'
    search_fields = ['libelle']
    permission_classes = [ReadAuthenticatedWriteGestionnaire]
    queryset = TypeEquipe.objects.all().order_by('id')
    serializer_class = TypeEquipeSerializer


class PublicTypePlatListAPIView(ListAPIView):
    queryset = TypePlat.objects.all()
    serializer_class = TypePlatSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class PublicTypeEquipeListAPIView(ListAPIView):
    queryset = TypeEquipe.objects.all()
    serializer_class = TypeEquipeSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class PlatViewSet(BaseViewSet):
    permission_classes = [ReadAuthenticatedWriteGestionnaire]
    queryset = (
        Plat.objects
        .select_related('type_plat', 'agence')
        .prefetch_related('images')
        .order_by('id')
    )
    serializer_class = PlatSerializer
    filterset_fields = ['type_plat']
    search_fields = ['nom', 'description']
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    bulk_delete_permission_classes = [IsGestionnaireRole]

    def get_queryset(self):
        return filtrer_agences_gerees(self.request, super().get_queryset(), 'agence_id')

    @action(detail=True, methods=['post'], url_path='image-principale',
            permission_classes=[IsGestionnaireRole])
    def image_principale(self, request, pk=None):
        """POST /plats/{id}/image-principale/ { image_id } : photo affichée en premier."""
        plat = self.get_object()
        geres = agences_gerees(request.user)
        if geres is not None and plat.agence_id not in geres:
            raise PermissionDenied("Ce plat n'est pas celui de votre agence.")
        image = plat.images.filter(pk=request.data.get('image_id')).first()
        if image is None:
            raise ValidationError("Cette photo n'appartient pas au plat.")
        with transaction.atomic():
            plat.images.exclude(pk=image.pk).update(is_principale=False)
            plat.images.filter(pk=image.pk).update(is_principale=True)
        return Response(self.get_serializer(self.get_queryset().get(pk=plat.pk)).data)

    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated])
    def avis(self, request, pk=None):
        """GET /plats/{id}/avis/ : note moyenne, nombre d'avis et derniers commentaires."""
        plat = self.get_object()
        qs = AvisPlat.objects.filter(plat=plat).select_related('user')
        resume = qs.aggregate(moyenne=Avg('note'), nombre=Count('id'))

        def auteur(u):
            initiale = f"{(u.nom or '')[:1]}." if u.nom else ''
            return f"{u.prenom or u.username} {initiale}".strip()

        return Response({
            'note_moyenne': round(resume['moyenne'], 1) if resume['moyenne'] else None,
            'nb_avis': resume['nombre'],
            'derniers': [
                {'note': a.note, 'commentaire': a.commentaire, 'auteur': auteur(a.user),
                 'date': a.created_at.date()}
                for a in qs.exclude(commentaire='')[:5]
            ],
        })

    def verifier_suppression(self, instance):
        geres = agences_gerees(self.request.user)
        if geres is not None and instance.agence_id not in geres:
            raise PermissionDenied("Ce plat n'est pas celui de votre agence.")
        # Supprimer un plat effacerait les menus et commandes qui le contiennent
        if MenuPlat.objects.filter(plat=instance).exists() or Commande.objects.filter(plat=instance).exists():
            raise ValidationError(
                f"Le plat « {instance.nom} » figure dans des menus ou des commandes : il ne peut pas être supprimé.")

    @staticmethod
    def _valider_images(fichiers):
        for f in fichiers:
            PlatImageUploadSerializer(data={'image': f}).is_valid(raise_exception=True)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_images = request.FILES.getlist('new_images')
        self._valider_images(new_images)

        with transaction.atomic():
            plat = serializer.save(
                user_created=request.user,
                user_updated=request.user
            )
            for i, image in enumerate(new_images):
                PlatImage.objects.create(plat=plat, image=image, is_principale=(i == 0))
        output_serializer = self.get_serializer(plat)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        plat = self.get_object()

        # Valider AVANT toute modification : une requête invalide ne doit
        # plus supprimer d'images.
        serializer = self.get_serializer(plat, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        new_images = request.FILES.getlist('new_images')
        self._valider_images(new_images)

        getlist = getattr(request.data, 'getlist', None)
        images_to_delete = getlist('images_to_delete[]') if getlist else request.data.get('images_to_delete', [])
        images_to_delete = [int(i) for i in images_to_delete if str(i).isdigit()]

        with transaction.atomic():
            # delete() par objet : le signal post_delete supprime aussi le fichier
            for img in PlatImage.objects.filter(id__in=images_to_delete, plat=plat):
                img.delete()
            for image in new_images:
                PlatImage.objects.create(plat=plat, image=image)
            # Toujours une image principale s'il reste des images
            images = plat.images.order_by('id')
            if images.exists() and not images.filter(is_principale=True).exists():
                images.filter(pk=images.first().pk).update(is_principale=True)
            self.perform_update(serializer)

        output_serializer = self.get_serializer(plat)
        return Response(output_serializer.data, status=status.HTTP_200_OK)


class PlatImageViewSet(BaseViewSet):
    permission_classes = [ReadAuthenticatedWriteGestionnaire]
    queryset = PlatImage.objects.all().order_by('id')
    serializer_class = PlatImageSerializer

    def _verifier_plat(self, plat):
        geres = agences_gerees(self.request.user)
        if geres is not None and plat.agence_id not in geres:
            raise PermissionDenied("Ce plat n'est pas celui de votre agence.")

    def perform_create(self, serializer):
        self._verifier_plat(serializer.validated_data['plat'])
        super().perform_create(serializer)

    def perform_update(self, serializer):
        self._verifier_plat(serializer.instance.plat)
        self._verifier_plat(serializer.validated_data.get('plat', serializer.instance.plat))
        super().perform_update(serializer)

    def verifier_suppression(self, instance):
        self._verifier_plat(instance.plat)


class MenuViewSet(BaseViewSet):
    permission_classes = [ReadAuthenticatedWriteGestionnaire]
    queryset = (
        Menu.objects
        .select_related('agence', 'typeequipe')
        .prefetch_related(
            'menu_plats__plat__images',
            'menu_plats__plat__type_plat',
            'menu_plats__plat__agence',
        )
        .order_by('-date_menu')
    )
    serializer_class = MenuSerializer
    filterset_fields = {
        'date_menu':  ['exact', 'gte', 'lte'],
        'agence':     ['exact'],
        'typeequipe': ['exact'],
    }
    ordering_fields = ['date_menu', 'created_at']
    bulk_delete_permission_classes = [IsGestionnaireRole]

    def get_queryset(self):
        return filtrer_agences_gerees(self.request, super().get_queryset(), 'agence_id')

    def verifier_suppression(self, instance):
        verifier_menu_gere(self.request.user, instance)
        # La suppression d'un menu effacerait ses commandes et ses retraits
        verifier_mois_ouvert(instance.date_menu)
        if commandes_actives(instance).exists():
            raise ValidationError(
                f"Le menu du {instance.date_menu:%d/%m/%Y} a déjà des commandes : il ne peut pas être supprimé.")


class MenuPlatViewSet(BaseViewSet):
    permission_classes = [ReadAuthenticatedWriteGestionnaire]
    queryset = MenuPlat.objects.select_related('plat').all().order_by('id')
    serializer_class = MenuPlatSerializer
    filterset_fields = ['menu']

    def verifier_suppression(self, instance):
        verifier_menu_gere(self.request.user, instance.menu)
        verifier_mois_ouvert(instance.menu.date_menu)
        if commandes_actives(instance.menu, instance.plat).exists():
            raise ValidationError(
                f"Le plat « {instance.plat.nom} » a déjà été commandé sur ce menu : il ne peut pas en être retiré.")


# ─────────────────────────────────────────────────────────────────────────────
# COMMANDE
# ─────────────────────────────────────────────────────────────────────────────

def verifier_menu_gere(user, menu):
    """Un gestionnaire n'agit que sur les menus de son agence."""
    geres = agences_gerees(user)
    if geres is not None and menu.agence_id not in geres:
        raise PermissionDenied("Ce menu n'est pas celui de votre agence.")


def filtrer_agences_gerees(request, qs, champ_agence):
    """
    Écrans de gestion (paramètre ?gerees=1) : un gestionnaire ne voit que
    ses agences. Sans ce paramètre, la lecture reste ouverte (un agent peut
    commander dans toute agence).
    """
    if request.query_params.get('gerees') not in ('1', 'true'):
        return qs
    geres = agences_gerees(request.user)
    return qs if geres is None else qs.filter(**{f'{champ_agence}__in': geres})


class CommandeViewSet(BaseViewSet):
    """
    Employé    : passe, consulte et annule SES commandes.
    Gestionnaire / admin : voit toutes les commandes, vues de distribution.
    Modification directe / suppression : administrateurs uniquement.
    """
    serializer_class = CommandeSerializer
    permission_classes = [IsAuthenticated, IsOwnerOrGestionnaire]
    filterset_fields = {
        'menu':            ['exact'],
        'user':            ['exact'],
        'statut':          ['exact'],
        'menu__agence':    ['exact'],
        'menu__date_menu': ['exact', 'gte', 'lte'],
    }

    def get_permissions(self):
        if self.action in ('update', 'partial_update', 'destroy', 'bulk_delete'):
            return [IsAdminRole()]
        return super().get_permissions()

    @staticmethod
    def _verifier_non_facturee(commande):
        """Une commande d'un mois clôturé est figée (facture déjà émise)."""
        d = commande.menu.date_menu
        if ClotureMensuelle.objects.filter(annee=d.year, mois=d.month).exists():
            raise PermissionDenied(
                f"Le mois {d.month:02d}/{d.year} est clôturé : cette commande ne peut plus être modifiée.")

    def perform_update(self, serializer):
        self._verifier_non_facturee(serializer.instance)
        super().perform_update(serializer)

    def verifier_suppression(self, instance):
        self._verifier_non_facturee(instance)

    def _base_queryset(self):
        return (
            Commande.objects
            .select_related('user', 'menu__agence', 'menu__typeequipe', 'plat__type_plat',
                            'plat__agence', 'avis')
            .prefetch_related('plat__images', 'user__useragence_set__agence')
            .order_by('-date_commande')
        )

    def _dans_mes_agences(self, qs):
        """Commandes visibles par un gestionnaire : celles de ses agences."""
        geres = agences_gerees(self.request.user)
        return qs if geres is None else qs.filter(menu__agence_id__in=geres)

    def get_queryset(self):
        qs = self._base_queryset()
        user = self.request.user
        if is_admin(user):
            return qs
        if is_gestionnaire(user):
            # Ses agences, plus ses propres commandes (il commande aussi)
            return qs.filter(Q(pk__in=self._dans_mes_agences(qs).values('pk')) | Q(user=user))
        return qs.filter(user=user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        menu = serializer.validated_data['menu']
        plat = serializer.validated_data['plat']

        with transaction.atomic():
            # Verrou sur la ligne user : deux requêtes simultanées du même
            # agent ne peuvent pas créer deux commandes le même jour.
            user = User.objects.select_for_update().get(pk=request.user.pk)

            commande_jour = Commande.objects.filter(
                user=user,
                menu__date_menu=menu.date_menu,
                statut__in=['en_attente', 'retiree'],
            )
            if commande_jour.exists():
                raise ValidationError(
                    f"Vous avez déjà une commande pour le {menu.date_menu:%d/%m/%Y}. "
                    "Une seule commande est autorisée par jour."
                )

            commande_existante = Commande.objects.filter(
                user=user, menu=menu, plat=plat, statut='annulee'
            ).first()

            if commande_existante:
                commande_existante.statut          = 'en_attente'
                commande_existante.date_annulation = None
                commande_existante.date_commande   = timezone.now()
                commande_existante.user_updated    = user
                commande_existante.save()
                output = CommandeSerializer(commande_existante, context={'request': request})
                return Response(output.data, status=status.HTTP_200_OK)

            serializer.save(user=user, user_created=user, user_updated=user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['patch'], url_path='annuler')
    def annuler(self, request, pk=None):
        commande   = self.get_object()
        self._verifier_non_facturee(commande)
        with transaction.atomic():
            # Verrou : un retrait simultané ne peut pas être écrasé par l'annulation
            commande = Commande.objects.select_for_update().get(pk=commande.pk)
            serializer = CommandeAnnulationSerializer(
                commande, data={}, partial=True, context={'request': request}
            )
            serializer.is_valid(raise_exception=True)
            serializer.save(user_updated=request.user)
        return Response(
            CommandeSerializer(commande, context={'request': request}).data,
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['get'], url_path='mes-commandes')
    def mes_commandes(self, request):
        qs = self._base_queryset().filter(user=request.user)
        qs = self.filter_queryset(qs)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='par-menu',
            permission_classes=[IsGestionnaireRole])
    def par_menu(self, request):
        menu_id = request.query_params.get('menu')
        if not menu_id or not str(menu_id).isdigit():
            return Response({'detail': 'Paramètre menu requis.'}, status=400)

        verifier_menu_gere(request.user, get_object_or_404(Menu, pk=menu_id))
        commandes = self._base_queryset().filter(menu_id=menu_id)
        ont_retire = set(
            Retrait.objects.filter(menu_id=menu_id).values_list('user_id', flat=True)
        )
        grouped = {}
        for cmd in commandes:
            uid = cmd.user_id
            if uid not in grouped:
                grouped[uid] = {
                    'user_id':   uid,
                    'user_nom':  nom_complet(cmd.user),
                    'commandes': [],
                    'a_retire':  uid in ont_retire,
                }
            grouped[uid]['commandes'].append(
                CommandeSerializer(cmd, context={'request': request}).data
            )
        return Response(list(grouped.values()))

    @action(detail=False, methods=['get'], url_path='par-agence-periode',
            permission_classes=[IsGestionnaireRole])
    def par_agence_periode(self, request):
        date_debut = request.query_params.get('date_debut')
        date_fin   = request.query_params.get('date_fin')
        agence     = request.query_params.get('agence')
        typeequipe = request.query_params.get('typeequipe')
        statut     = request.query_params.get('statut')

        qs = self._dans_mes_agences(self._base_queryset())
        try:
            if date_debut:  qs = qs.filter(menu__date_menu__gte=date_debut)
            if date_fin:    qs = qs.filter(menu__date_menu__lte=date_fin)
            if agence:      qs = qs.filter(menu__agence__id=int(agence))
            if typeequipe:  qs = qs.filter(menu__typeequipe__id=int(typeequipe))
        except (ValueError, DjangoValidationError):
            return Response({'detail': 'Paramètres de filtre invalides.'}, status=400)
        if statut:      qs = qs.filter(statut=statut)

        serializer = CommandeSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='recherche-par-badge',
            permission_classes=[IsGestionnaireRole])
    def recherche_par_badge(self, request):
        badge   = request.query_params.get('badge', '').strip()
        menu_id = request.query_params.get('menu')

        if not badge:   return Response({'detail': 'Badge requis.'}, status=400)
        if not menu_id or not str(menu_id).isdigit():
            return Response({'detail': 'Menu requis.'}, status=400)

        verifier_menu_gere(request.user, get_object_or_404(Menu, pk=menu_id))
        try:
            user = User.objects.get(username=badge)
        except User.DoesNotExist:
            return Response({'detail': f'Aucun agent trouvé avec le badge "{badge}".'}, status=404)

        a_retire  = Retrait.objects.filter(user=user, menu_id=menu_id).exists()
        commandes = self._base_queryset().filter(user=user, menu_id=menu_id)

        return Response({
            'user_id':   user.id,
            'user_nom':  nom_complet(user),
            'badge':     user.username,
            'a_retire':  a_retire,
            'commandes': CommandeSerializer(commandes, many=True, context={'request': request}).data,
        })

class DashboardCantineView(APIView):
    """
    GET /api/api/dashboard-cantine/
    Params:
      date_debut   : YYYY-MM-DD  (défaut : 1er jour du mois en cours)
      date_fin     : YYYY-MM-DD  (défaut : dernier jour du mois en cours)
      agences      : "1,2,3"
      typeequipes  : "1,2"
      statuts      : "en_attente,retiree,annulee"  (statistiques de commandes
                     uniquement : la facturation suit toujours la règle de
                     api/facturation.py, repas non annulés)
    """
    permission_classes = [IsGestionnaireRole]

    def get(self, request):
        from django.db.models import Count, Q
        from django.db.models.functions import TruncMonth
        from decimal import Decimal
        from datetime import timedelta

        # ── Paramètres ────────────────────────────────────────
        aujourdhui = timezone.localdate()
        debut_defaut, fin_defaut = fact.bornes_mois(aujourdhui.year, aujourdhui.month)
        date_debut = _parse_date(request.query_params.get('date_debut'), debut_defaut)
        date_fin   = _parse_date(request.query_params.get('date_fin'), fin_defaut)
        if date_debut > date_fin:
            raise ValidationError("La date de début doit être antérieure ou égale à la date de fin.")

        agences_str = request.query_params.get('agences',     None)
        equipes_str = request.query_params.get('typeequipes', None)
        statuts_str = request.query_params.get('statuts',     None)

        agences_ids = [
            int(x) for x in agences_str.split(',') if x.strip().isdigit()
        ] if agences_str else []
        # Un gestionnaire ne voit que ses agences
        geres = agences_gerees(request.user)
        if geres is not None:
            agences_ids = [a for a in agences_ids if a in geres] if agences_ids else list(geres)
            agences_ids = agences_ids or [0]   # aucune agence : aucun résultat

        equipes_ids = [
            int(x) for x in equipes_str.split(',') if x.strip().isdigit()
        ] if equipes_str else []

        statuts_list = [
            x.strip() for x in statuts_str.split(',')
            if x.strip() in ['en_attente', 'retiree', 'annulee']
        ] if statuts_str else []

        # ── Querysets de base ─────────────────────────────────
        # base_qs : période / agences / équipes (sans filtre statut) →
        # facturation et évolution par date. commande_qs : + filtre statut.
        base_qs = Commande.objects.filter(
            menu__date_menu__gte=date_debut, menu__date_menu__lte=date_fin)
        menu_qs = Menu.objects.filter(date_menu__gte=date_debut, date_menu__lte=date_fin)

        if agences_ids:
            base_qs = base_qs.filter(menu__agence__id__in=agences_ids)
            menu_qs = menu_qs.filter(agence__id__in=agences_ids)
        if equipes_ids:
            base_qs = base_qs.filter(menu__typeequipe__id__in=equipes_ids)
            menu_qs = menu_qs.filter(typeequipe__id__in=equipes_ids)

        commande_qs = base_qs.filter(statut__in=statuts_list) if statuts_list else base_qs

        # Taux de retrait : retirées / commandes non annulées dont le menu
        # est passé (≤ aujourd'hui) — les repas à venir ne peuvent pas
        # encore être retirés.
        filtre_echues   = Q(menu__date_menu__lte=aujourdhui) & ~Q(statut='annulee')
        filtre_retirees = Q(menu__date_menu__lte=aujourdhui) & Q(statut='retiree')

        def taux(retirees, echues):
            return round((retirees / echues * 100) if echues > 0 else 0, 1)

        # ── KPIs globaux ──────────────────────────────────────
        total_commandes  = commande_qs.count()
        total_en_attente = commande_qs.filter(statut='en_attente').count()
        total_retirees   = commande_qs.filter(statut='retiree').count()
        total_annulees   = commande_qs.filter(statut='annulee').count()
        total_menus      = menu_qs.count()
        taux_retrait     = taux(commande_qs.filter(filtre_retirees).count(),
                                commande_qs.filter(filtre_echues).count())
        taux_annulation  = round((total_annulees / total_commandes * 100) if total_commandes > 0 else 0, 1)

        # ── Par mois (année + mois : pas de fusion entre années) ──
        mois_periode = []
        annee, mois = date_debut.year, date_debut.month
        while (annee, mois) <= (date_fin.year, date_fin.month):
            mois_periode.append((annee, mois))
            annee, mois = (annee + 1, 1) if mois == 12 else (annee, mois + 1)

        commandes_par_mois = {
            (row['mois'].year, row['mois'].month): row
            for row in (
                commande_qs
                .annotate(mois=TruncMonth('menu__date_menu'))
                .values('mois')
                .annotate(
                    total=Count('id'),
                    en_attente=Count('id', filter=Q(statut='en_attente')),
                    retiree=Count('id',    filter=Q(statut='retiree')),
                    annulee=Count('id',    filter=Q(statut='annulee')),
                    echues=Count('id',          filter=filtre_echues),
                    retirees_echues=Count('id', filter=filtre_retirees),
                )
                .order_by('mois')
            )
        }
        par_mois = []
        for annee, mois in mois_periode:
            row = commandes_par_mois.get((annee, mois), {})
            par_mois.append({
                'annee':        annee,
                'mois':         mois,
                'total':        int(row.get('total')      or 0),
                'en_attente':   int(row.get('en_attente') or 0),
                'retiree':      int(row.get('retiree')    or 0),
                'annulee':      int(row.get('annulee')    or 0),
                'taux_retrait': taux(int(row.get('retirees_echues') or 0), int(row.get('echues') or 0)),
            })

        # ── Top plats ─────────────────────────────────────────
        top_plats = (
            commande_qs.values('plat__nom', 'plat__type_plat__libelle')
            .annotate(nombre=Count('id')).order_by('-nombre')[:10]
        )
        top_plats_data = [
            {
                'nom':       str(row['plat__nom'] or ''),
                'type_plat': str(row['plat__type_plat__libelle'] or ''),
                'nombre':    int(row['nombre'] or 0),
            }
            for row in top_plats
        ]

        # ── Par agence ────────────────────────────────────────
        par_agence = (
            commande_qs.values('menu__agence__nom_agence')
            .annotate(
                total=Count('id'),
                en_attente=Count('id', filter=Q(statut='en_attente')),
                retiree=Count('id',    filter=Q(statut='retiree')),
                annulee=Count('id',    filter=Q(statut='annulee')),
            ).order_by('-total')
        )
        par_agence_data = [
            {
                'agence':     str(row['menu__agence__nom_agence'] or ''),
                'total':      int(row['total']      or 0),
                'en_attente': int(row['en_attente'] or 0),
                'retiree':    int(row['retiree']    or 0),
                'annulee':    int(row['annulee']    or 0),
            }
            for row in par_agence
        ]

        # ── Par type plat ─────────────────────────────────────
        par_typeplat_data = [
            {
                'type_plat': str(row['plat__type_plat__libelle'] or ''),
                'total':     int(row['total'] or 0),
            }
            for row in (
                commande_qs.values('plat__type_plat__libelle')
                .annotate(total=Count('id')).order_by('-total')
            )
        ]

        # ── Menus récents (commandes non annulées) ────────────
        menus_recents_data = [
            {
                'id':           int(m.id),
                'date_menu':    str(m.date_menu),
                'agence':       str(m.agence.nom_agence  if m.agence     else ''),
                'typeequipe':   str(m.typeequipe.libelle if m.typeequipe else ''),
                'nb_commandes': int(m.nb_commandes or 0),
            }
            for m in (
                menu_qs.select_related('agence', 'typeequipe')
                .annotate(nb_commandes=Count('commandes', filter=~Q(commandes__statut='annulee')))
                .order_by('-date_menu')[:5]
            )
        ]

        # ── Évolution hebdomadaire (4 semaines glissantes, aujourd'hui inclus) ──
        semaines = []
        for i in range(3, -1, -1):
            fin_s   = aujourdhui - timedelta(weeks=i)
            debut_s = fin_s - timedelta(days=6)
            qs_s    = Commande.objects.filter(
                menu__date_menu__gte=debut_s, menu__date_menu__lte=fin_s,
            ).exclude(statut='annulee')
            if agences_ids:  qs_s = qs_s.filter(menu__agence__id__in=agences_ids)
            if equipes_ids:  qs_s = qs_s.filter(menu__typeequipe__id__in=equipes_ids)
            if statuts_list: qs_s = qs_s.filter(statut__in=statuts_list)
            semaines.append({'label': f'S-{i}' if i > 0 else 'Cette semaine', 'total': qs_s.count()})

        # ── Évolution des commandes par statut par date menu ────
        # Pas de filtre statut : on veut toujours les 3 statuts côte à côte.
        evo_par_date_qs = (
            base_qs
            .values('menu__date_menu')
            .annotate(
                en_attente=Count('id', filter=Q(statut='en_attente')),
                retiree=Count('id',    filter=Q(statut='retiree')),
                annulee=Count('id',    filter=Q(statut='annulee')),
            )
            .order_by('menu__date_menu')
        )
        evolution_par_date = [
            {
                'date':       str(row['menu__date_menu']),
                'en_attente': int(row['en_attente'] or 0),
                'retiree':    int(row['retiree']    or 0),
                'annulee':    int(row['annulee']    or 0),
            }
            for row in evo_par_date_qs
        ]
        # ════════════════════════════════════════════════════
        # FACTURATION — même calcul que /facturation/ et
        # /facturation/prestataires/ (api/facturation.py) : repas commandés
        # et non annulés, tarifs à la date du menu, montants figés pour les
        # mois clôturés. Calculée sur base_qs : le filtre « statuts » ne
        # concerne que les statistiques de commandes.
        # Repas sans tarif (ou sans prestataire rattaché) → repas_sans_tarif.
        # ════════════════════════════════════════════════════
        def agreger(lignes, cle_groupe, cle_liste, libelle_groupe):
            total      = Decimal('0.00')
            sans_tarif = 0
            par_mois_f = {am: Decimal('0.00') for am in mois_periode}
            par_agence_f, par_groupe = {}, {}
            for l in lignes:
                if l['montant'] is None:
                    sans_tarif += 1
                    continue
                montant = l['montant']
                total += montant
                am = (l['date_menu'].year, l['date_menu'].month)
                par_mois_f[am] = par_mois_f.get(am, Decimal('0.00')) + montant
                for dico, cle, nom in ((par_agence_f, 'agence', l['agence_menu']),
                                       (par_groupe, cle_groupe, libelle_groupe(l))):
                    ligne = dico.setdefault(nom, {cle: nom, 'montant': Decimal('0.00'), 'nb_commandes': 0})
                    ligne['montant']      += montant
                    ligne['nb_commandes'] += 1

            def serialiser(dico, cle):
                return [
                    {cle: v[cle], 'montant': float(v['montant']), 'nb_commandes': v['nb_commandes']}
                    for v in sorted(dico.values(), key=lambda x: x['montant'], reverse=True)
                ]
            return {
                'total_montant':    float(total),
                'repas_sans_tarif': sans_tarif,
                'par_mois': [
                    {'annee': a, 'mois': m, 'montant': float(v)}
                    for (a, m), v in sorted(par_mois_f.items())
                ],
                'par_agence': serialiser(par_agence_f, 'agence'),
                cle_liste:    serialiser(par_groupe, cle_groupe),
            }

        fact_fournisseur = agreger(fact.lignes_prestataires(base_qs), 'prestataire',
                                   'par_prestataire', lambda l: l['prestataire'].libelle)
        fact_employe = agreger(fact.lignes_facturation(base_qs), 'categorie',
                               'par_categorie', lambda l: l['categorie'] or '—')

        return Response({
            'date_debut':       date_debut.isoformat(),
            'date_fin':         date_fin.isoformat(),
            'kpis':             {
                'total_commandes':  total_commandes,
                'total_en_attente': total_en_attente,
                'total_retirees':   total_retirees,
                'total_annulees':   total_annulees,
                'total_menus':      total_menus,
                'taux_retrait':     taux_retrait,
                'taux_annulation':  taux_annulation,
            },
            'par_mois':         par_mois,
            'top_plats':        top_plats_data,
            'par_agence':       par_agence_data,
            'par_typeplat':     par_typeplat_data,
            'menus_recents':    menus_recents_data,
            'evolution_hebdo':  semaines,
            'evolution_par_date': evolution_par_date,
            'fact_fournisseur': fact_fournisseur,
            'fact_employe':     fact_employe,
        })


 
# ─────────────────────────────────────────────────────────────────────────────
# RETRAIT
# ─────────────────────────────────────────────────────────────────────────────

class RetraitViewSet(BaseViewSet):
    """Enregistrement des retraits au comptoir : gestionnaires et administrateurs."""
    permission_classes = [IsGestionnaireRole]
    serializer_class = RetraitSerializer
    filterset_fields = ['menu', 'user']

    def get_permissions(self):
        if self.action in ('update', 'partial_update', 'destroy', 'bulk_delete'):
            return [IsAdminRole()]
        return super().get_permissions()

    def get_queryset(self):
        qs = (
            Retrait.objects
            .select_related('user', 'menu__agence', 'menu__typeequipe')
            .order_by('-date_retrait')
        )
        geres = agences_gerees(self.request.user)
        return qs if geres is None else qs.filter(menu__agence_id__in=geres)

    def perform_create(self, serializer):
        verifier_menu_gere(self.request.user, serializer.validated_data['menu'])
        super().perform_create(serializer)

    def verifier_suppression(self, instance):
        verifier_mois_ouvert(instance.menu.date_menu)

    def perform_destroy(self, instance):
        # Annuler un retrait remet les commandes de l'agent « en attente »
        self.verifier_suppression(instance)
        with transaction.atomic():
            Commande.objects.filter(user=instance.user, menu=instance.menu, statut='retiree') \
                .update(statut='en_attente', updated_at=timezone.now())
            instance.delete()


class FonctionListAPIView(ListAPIView):
    queryset = Fonction.objects.all()
    serializer_class = FonctionSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class ServiceListAPIView(ListAPIView):
    queryset = Service.objects.all()
    serializer_class = ServiceSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class PosteListAPIView(ListAPIView):
    queryset = Poste.objects.select_related('fonction', 'service').all()
    serializer_class = PosteSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class CategoriesalarieListAPIView(ListAPIView):
    queryset = Categoriesalarie.objects.all()
    serializer_class = CategoriesalarieSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class GroupListAPIView(ListAPIView):
    queryset = Group.objects.all()
    serializer_class = GroupSerializer
    permission_classes = [IsAdminRole]
    pagination_class = None

class AllPrestataireNopginListAPIView(ListAPIView):
    """Appelé par le web (prestataire.service.ts) mais absent jusqu'ici → 404."""
    queryset           = Prestataire.objects.select_related('statut').order_by('libelle')
    serializer_class   = PrestataireSerializer
    permission_classes = [IsGestionnaireRole]
    pagination_class   = None


class AllPlatNopginListAPIView(ListAPIView):
    queryset = Plat.objects.select_related('type_plat', 'agence').prefetch_related('images')
    serializer_class = PlatSerializer
    permission_classes = [IsAuthenticated]
    pagination_class   = None

    def get_queryset(self):
        return filtrer_agences_gerees(self.request, super().get_queryset(), 'agence_id')


# ============================================================
# AJOUTER DANS views.py
# ============================================================

# ── Imports à ajouter en haut de views.py ───────────────────
# from .models import DeviceToken, Notification
# from .fcm_service import envoyer_notification_user

# ══════════════════════════════════════════════════════════════
# DEVICE TOKEN — Enregistrement des tokens FCM
# ══════════════════════════════════════════════════════════════

class DeviceTokenView(APIView):
    """
    POST /api/api/device-tokens/
    Enregistre ou met à jour le token FCM de l'appareil connecté.
    Appelé automatiquement par Flutter après login.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token    = request.data.get('token', '').strip()
        platform = request.data.get('platform', 'android')

        if not token:
            return Response(
                {'error': 'Token requis.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if platform not in ['android', 'ios', 'web']:
            return Response(
                {'error': 'Plateforme invalide. Valeurs : android, ios, web.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # update_or_create : évite les doublons si le token existe déjà
        # pour un autre user (token recyclé par FCM)
        DeviceToken.objects.filter(token=token).exclude(
            user=request.user
        ).delete()  # supprimer si token appartient à un autre user

        obj, created = DeviceToken.objects.update_or_create(
            token=token,
            defaults={
                'user':     request.user,
                'platform': platform,
            }
        )

        return Response(
            {
                'message':  'Token enregistré.' if created else 'Token mis à jour.',
                'id':       obj.id,
                'platform': obj.platform,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )

    def delete(self, request):
        """
        DELETE /api/api/device-tokens/supprimer/?token=xxx
        Supprime le token FCM au logout.
        """
        token = request.query_params.get('token', '').strip()
        if not token:
            return Response(
                {'error': 'Token requis.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        deleted, _ = DeviceToken.objects.filter(
            user=request.user, token=token
        ).delete()
        return Response(
            {'message': f'{deleted} token(s) supprimé(s).'},
            status=status.HTTP_200_OK
        )


# ══════════════════════════════════════════════════════════════
# NOTIFICATIONS — CRUD
# ══════════════════════════════════════════════════════════════

class NotificationListView(APIView):
    """
    GET /api/api/notifications/mes-notifications/
    Retourne les notifications de l'user connecté
    avec le compteur de non lues.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        notifs = Notification.objects.filter(
            user=request.user
        ).order_by('-created_at')[:50]  # 50 dernières max

        non_lues = Notification.objects.filter(
            user=request.user, lu=False
        ).count()

        data = [
            {
                'id':           n.id,
                'type':         n.type,
                'titre':        n.titre,
                'message':      n.message,
                'lu':           n.lu,
                'commande_id':  n.commande_id,
                'menu_id':      n.menu_id,
                'created_at':   n.created_at.isoformat(),
            }
            for n in notifs
        ]

        return Response({
            'non_lues':      non_lues,
            'notifications': data,
        })


class NotificationDetailView(APIView):
    """
    PATCH /api/api/notifications/{id}/marquer-lu/
    DELETE /api/api/notifications/{id}/supprimer/
    """
    permission_classes = [IsAuthenticated]

    def _get_notif(self, request, pk):
        try:
            return Notification.objects.get(pk=pk, user=request.user)
        except Notification.DoesNotExist:
            return None

    def patch(self, request, pk):
        notif = self._get_notif(request, pk)
        if not notif:
            return Response(status=status.HTTP_404_NOT_FOUND)
        notif.lu = True
        notif.save(update_fields=['lu'])
        return Response({'message': 'Notification marquée comme lue.'})

    def delete(self, request, pk):
        notif = self._get_notif(request, pk)
        if not notif:
            return Response(status=status.HTTP_404_NOT_FOUND)
        notif.delete()
        return Response({'message': 'Notification supprimée.'})


class NotificationBulkView(APIView):
    """
    PATCH /api/api/notifications/tout-marquer-lu/
    DELETE /api/api/notifications/tout-supprimer/
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        count = Notification.objects.filter(
            user=request.user, lu=False
        ).update(lu=True)
        return Response({'message': f'{count} notification(s) marquée(s) comme lues.'})

    def delete(self, request):
        count, _ = Notification.objects.filter(user=request.user).delete()
        return Response({'message': f'{count} notification(s) supprimée(s).'})


# ══════════════════════════════════════════════════════════════
# FACTURATION DES EMPLOYÉS (calcul unique : api/facturation.py)
# ══════════════════════════════════════════════════════════════


def _parse_date(valeur, defaut):
    from datetime import date as date_type
    if not valeur:
        return defaut
    try:
        return date_type.fromisoformat(valeur)
    except ValueError:
        raise ValidationError(f"Date invalide : {valeur} (format AAAA-MM-JJ)")


def _infos_agents(user_ids):
    """Agence, service et poste actuels de chaque agent (une requête + prefetch)."""
    def derniere(lignes, champ):
        return getattr(max(lignes, key=lambda x: x.date_debut), champ) if lignes else None

    infos = {}
    for u in UserViewSet._prefetch(User.objects.filter(id__in=set(user_ids))):
        infos[u.id] = {
            'agence_agent': getattr(derniere(list(u.useragence_set.all()), 'agence'), 'nom_agence', None),
            'service':      getattr(derniere(list(u.userservice_set.all()), 'service'), 'libelle_service', None),
            'poste':        getattr(derniere(list(u.userposte_set.all()), 'poste'), 'libelle', None),
        }
    return infos


def _ligne_json(l):
    return {
        'commande_id': l['commande_id'],
        'date_menu':   l['date_menu'].isoformat(),
        'plat':        l['plat'],
        'agence_menu': l['agence_menu'],
        'equipe':      l['equipe'],
        'statut':      l['statut'],
        'categorie':   l['categorie'],
        'montant':     float(l['montant']) if l['montant'] is not None else None,
        'source':      l['source'],   # 'facture' (mois clôturé, figé) ou 'calcul'
    }


class FacturationView(APIView):
    """
    GET /api/api/facturation/?date_debut=AAAA-MM-JJ&date_fin=AAAA-MM-JJ
                              [&agence=ID&typeequipe=ID&user=ID&moi=1]

    Facturation des repas sur une période (par défaut : le mois en cours).
    Employé (ou moi=1) : uniquement ses propres repas, toutes agences.
    Gestionnaire : repas servis dans ses agences. Administrateur : tous.
    Mois clôturés → montants figés ; autres mois → calcul provisoire.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        aujourdhui = timezone.localdate()
        debut_defaut, fin_defaut = fact.bornes_mois(aujourdhui.year, aujourdhui.month)
        debut = _parse_date(request.query_params.get('date_debut'), debut_defaut)
        fin   = _parse_date(request.query_params.get('date_fin'), fin_defaut)

        qs = Commande.objects.filter(menu__date_menu__gte=debut, menu__date_menu__lte=fin)
        moi = request.query_params.get('moi') in ('1', 'true')
        if is_gestionnaire(request.user) and not moi:
            # Gestionnaire : repas servis dans ses agences
            geres = agences_gerees(request.user)
            if geres is not None:
                qs = qs.filter(menu__agence_id__in=geres)
            for param, champ in (('user', 'user_id'), ('agence', 'menu__agence_id'),
                                 ('typeequipe', 'menu__typeequipe_id')):
                valeur = request.query_params.get(param)
                if valeur:
                    if not str(valeur).isdigit():
                        raise ValidationError(f"Paramètre {param} invalide.")
                    qs = qs.filter(**{champ: int(valeur)})
        else:
            qs = qs.filter(user=request.user)

        employes = fact.synthese_par_employe(fact.lignes_facturation(qs))

        infos = _infos_agents([e['user_id'] for e in employes])
        resultat = [
            {
                **{k: v for k, v in e.items() if k not in ('lignes', 'total', 'tarif_unitaire')},
                **infos.get(e['user_id'], {}),
                'total':          float(e['total']),
                'tarif_unitaire': float(e['tarif_unitaire']) if e['tarif_unitaire'] is not None else None,
                'lignes':         [_ligne_json(l) for l in e['lignes']],
            }
            for e in employes
        ]

        return Response({
            'regle':            fact.REGLE,
            'date_debut':       debut.isoformat(),
            'date_fin':         fin.isoformat(),
            'total_repas':      sum(e['nb_repas'] for e in employes),
            'total_montant':    float(sum((e['total'] for e in employes), Decimal('0'))),
            'repas_sans_tarif': sum(e['repas_sans_tarif'] for e in employes),
            'employes':         resultat,
        })


class ClotureMensuelleViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET  /api/api/facturation/clotures/            liste des mois clôturés (gestionnaires)
    POST /api/api/facturation/clotures/cloturer/   { "annee": 2026, "mois": 9 }  (admins)
    """
    queryset = ClotureMensuelle.objects.select_related('cloturee_par').all()
    serializer_class = ClotureMensuelleSerializer
    permission_classes = [IsGestionnaireRole]
    pagination_class = None

    @action(detail=False, methods=['post'], permission_classes=[IsAdminRole])
    def cloturer(self, request):
        try:
            annee = int(request.data.get('annee'))
            mois  = int(request.data.get('mois'))
            if not 1 <= mois <= 12:
                raise ValueError
        except (TypeError, ValueError):
            return Response({'error': 'Paramètres annee et mois (1-12) requis.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            cloture = fact.cloturer_mois(annee, mois, request.user)
        except fact.ClotureImpossible as e:
            return Response({'error': str(e), 'details': e.details},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response(ClotureMensuelleSerializer(cloture).data, status=status.HTTP_201_CREATED)


class FactureMensuelleViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /api/api/factures/?annee=&mois=&user=   factures figées
    Employé : ses factures. Gestionnaire / admin : toutes.
    """
    serializer_class = FactureMensuelleSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['annee', 'mois', 'user']

    def get_queryset(self):
        qs = (FactureMensuelle.objects
              .select_related('user', 'cloture')
              .prefetch_related('lignes'))
        user = self.request.user
        if not is_gestionnaire(user):
            return qs.filter(user=user)
        geres = agences_gerees(user)
        if geres is None:
            return qs
        # Gestionnaire : ses factures, et celles dont tous les repas ont été servis dans ses agences
        hors = LigneFacture.objects.exclude(commande__menu__agence_id__in=geres).values('facture_id')
        return qs.filter(Q(user=user) | (Q(lignes__isnull=False) & ~Q(pk__in=hors))).distinct()


class FacturationPrestataireView(APIView):
    """
    GET /api/api/facturation/prestataires/?date_debut=&date_fin=
                                          [&prestataire=ID&agence=ID&typeequipe=ID]

    Montant dû à chaque prestataire, détaillé par agent puis par repas.
    Repas commandés et non annulés ; prestataire = celui rattaché à l'agence
    du menu à la date du menu ; tarif = son PlatPrestataire à cette date.
    Gestionnaires et administrateurs.
    """
    permission_classes = [IsGestionnaireRole]

    def get(self, request):
        aujourdhui = timezone.localdate()
        debut_defaut, fin_defaut = fact.bornes_mois(aujourdhui.year, aujourdhui.month)
        debut = _parse_date(request.query_params.get('date_debut'), debut_defaut)
        fin   = _parse_date(request.query_params.get('date_fin'), fin_defaut)

        qs = Commande.objects.filter(menu__date_menu__gte=debut, menu__date_menu__lte=fin)
        geres = agences_gerees(request.user)
        if geres is not None:
            qs = qs.filter(menu__agence_id__in=geres)
        for param, champ in (('agence', 'menu__agence_id'), ('typeequipe', 'menu__typeequipe_id')):
            valeur = request.query_params.get(param)
            if valeur:
                if not str(valeur).isdigit():
                    raise ValidationError(f"Paramètre {param} invalide.")
                qs = qs.filter(**{champ: int(valeur)})

        lignes = fact.lignes_prestataires(qs)
        prestataire_id = request.query_params.get('prestataire')
        anomalies = fact._anomalies_prestataires(lignes)
        prestataires = fact.synthese_par_prestataire(lignes)
        if prestataire_id:
            if not str(prestataire_id).isdigit():
                raise ValidationError("Paramètre prestataire invalide.")
            prestataires = [p for p in prestataires if p['prestataire_id'] == int(prestataire_id)]

        infos = _infos_agents([a['user_id'] for p in prestataires for a in p['agents']])

        def ligne_json(l):
            return {
                'commande_id': l['commande_id'],
                'date_menu':   l['date_menu'].isoformat(),
                'plat':        l['plat'],
                'statut':      l['statut'],
                'montant':     float(l['montant']) if l['montant'] is not None else None,
                'source':      l['source'],
            }

        return Response({
            'regle': ("Repas commandés et non annulés, facturés par le prestataire rattaché à "
                      "l'agence du menu, à son tarif en vigueur à la date du menu"),
            'date_debut':    debut.isoformat(),
            'date_fin':      fin.isoformat(),
            'total_repas':   sum(p['nb_repas'] for p in prestataires),
            'total_montant': float(sum((p['total'] for p in prestataires), Decimal('0'))),
            # Repas qui ne peuvent être attribués / tarifés (toutes agences de la période)
            'anomalies':     anomalies,
            'prestataires': [
                {
                    **{k: v for k, v in p.items() if k not in ('agents', 'total')},
                    'total': float(p['total']),
                    'agents': [
                        {
                            **{k: v for k, v in a.items() if k not in ('lignes', 'total')},
                            **infos.get(a['user_id'], {}),
                            'total':  float(a['total']),
                            'lignes': [ligne_json(l) for l in a['lignes']],
                        } for a in p['agents']
                    ],
                } for p in prestataires
            ],
        })


class FacturePrestataireViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /api/api/factures-prestataires/?annee=&mois=&prestataire=   (gestionnaires)
    GET /api/api/factures-prestataires/{id}/pdf/                     facture PDF officielle
    """
    serializer_class = FacturePrestataireSerializer
    permission_classes = [IsGestionnaireRole]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['annee', 'mois', 'prestataire']
    queryset = (FacturePrestataire.objects
                .select_related('cloture', 'prestataire')
                .prefetch_related('lignes__user'))

    def get_queryset(self):
        qs = super().get_queryset()
        geres = agences_gerees(self.request.user)
        if geres is None:
            return qs
        # Une facture officielle couvre toutes les agences du prestataire :
        # un gestionnaire ne voit que celles qui ne concernent que ses agences.
        hors = LigneFacturePrestataire.objects.exclude(
            commande__menu__agence_id__in=geres).values('facture_id')
        return qs.filter(lignes__isnull=False).exclude(pk__in=hors).distinct()

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        from .pdf_factures import generer_facture_prestataire
        facture = self.get_object()
        contenu = generer_facture_prestataire(facture, ParametresSociete.charger())
        nom = f"facture-{facture.numero or facture.id}.pdf"
        reponse = FileResponse(BytesIO(contenu), content_type='application/pdf',
                               as_attachment=True, filename=nom)
        return reponse


class ParametresSocieteView(APIView):
    """
    GET   /api/api/parametres-societe/   en-tête des factures (gestionnaires)
    PATCH /api/api/parametres-societe/   modification (admins) — JSON ou multipart
                                          (champ « logo », « supprimer_logo »=true)
    """
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_permissions(self):
        return [IsAdminRole()] if self.request.method not in ('GET', 'HEAD', 'OPTIONS') \
            else [IsGestionnaireRole()]

    def get(self, request):
        return Response(ParametresSocieteSerializer(ParametresSociete.charger()).data)

    def patch(self, request):
        serializer = ParametresSocieteSerializer(ParametresSociete.charger(),
                                                 data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(user_updated=request.user)
        return Response(serializer.data)


class ParametresCantineView(APIView):
    """
    GET /api/api/parametres-cantine/   délais de commande et d'annulation
                                        (tout utilisateur connecté : web et mobile).
    La modification se fait par PATCH /parametres-societe/ (administrateurs).
    """
    def get(self, request):
        return Response(ParametresCantineSerializer(ParametresSociete.charger()).data)


class BanniereViewSet(BaseViewSet):
    """
    GET    /api/api/bannieres/            bannières à afficher aujourd'hui (tout utilisateur connecté)
    GET    /api/api/bannieres/?toutes=1   toutes les bannières (administrateurs, écran de gestion)
    POST / PATCH / DELETE                 administrateurs (multipart : image)
    """
    serializer_class = BanniereSerializer
    permission_classes = [ReadAuthenticatedWriteAdmin]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    pagination_class = None
    filter_backends = []

    def get_queryset(self):
        qs = Banniere.objects.all()
        if self.action != 'list' or (self.request.query_params.get('toutes') == '1'
                                     and is_admin(self.request.user)):
            return qs
        jour = timezone.localdate()
        return (qs.filter(actif=True)
                  .filter(Q(date_debut__isnull=True) | Q(date_debut__lte=jour))
                  .filter(Q(date_fin__isnull=True) | Q(date_fin__gte=jour)))


class AvisPlatViewSet(viewsets.ModelViewSet):
    """
    Avis sur les repas retirés.
      Employé        : donne, modifie et voit SES avis.
      Gestionnaire   : voit les avis des repas servis dans son agence.
      Administrateur : voit tous les avis, peut en supprimer (modération).
    GET /avis-plats/?plat=&note=&agence=&date_debut=&date_fin=
    GET /avis-plats/statistiques/   moyenne et nombre d'avis par plat (mêmes filtres)
    """
    serializer_class = AvisPlatSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        qs = AvisPlat.objects.select_related('user', 'plat', 'commande__menu__agence')
        if not is_gestionnaire(user):
            return qs.filter(user=user)
        geres = agences_gerees(user)
        if geres is not None:
            qs = qs.filter(Q(commande__menu__agence_id__in=geres) | Q(user=user))
        p = self.request.query_params
        for param, champ in (('plat', 'plat_id'), ('note', 'note'), ('agence', 'commande__menu__agence_id')):
            valeur = p.get(param)
            if valeur:
                if not str(valeur).isdigit():
                    raise ValidationError(f"Paramètre {param} invalide.")
                qs = qs.filter(**{champ: int(valeur)})
        debut = _parse_date(p.get('date_debut'), None)
        fin = _parse_date(p.get('date_fin'), None)
        if debut:
            qs = qs.filter(commande__menu__date_menu__gte=debut)
        if fin:
            qs = qs.filter(commande__menu__date_menu__lte=fin)
        return qs

    def perform_update(self, serializer):
        if serializer.instance.user_id != self.request.user.id:
            raise PermissionDenied("Vous ne pouvez modifier que vos propres avis.")
        serializer.save()

    def perform_destroy(self, instance):
        if instance.user_id != self.request.user.id and not is_admin(self.request.user):
            raise PermissionDenied("Suppression réservée à l'auteur ou à un administrateur.")
        instance.delete()

    @action(detail=False, methods=['get'], permission_classes=[IsGestionnaireRole])
    def statistiques(self, request):
        lignes = (self.get_queryset().values('plat_id', 'plat__nom')
                  .annotate(moyenne=Avg('note'), nombre=Count('id'))
                  .order_by('-nombre', 'plat__nom'))
        return Response([
            {'plat_id': l['plat_id'], 'plat_nom': l['plat__nom'],
             'note_moyenne': round(l['moyenne'], 1), 'nb_avis': l['nombre']}
            for l in lignes
        ])
