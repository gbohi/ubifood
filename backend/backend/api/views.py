import hmac
import logging
import secrets
from collections import defaultdict

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
    ReadGestionnaireWriteAdmin, is_admin, is_gestionnaire, is_super_admin,
    ROLE_SUPER_ADMIN,
)
from django.conf import settings
from django.contrib.auth.models import Group
from django.db import transaction
from rest_framework.generics import ListAPIView
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.db.models import Count
from decimal import ROUND_HALF_UP, Decimal
from django.utils.timezone import now
from django.utils import timezone
from django.core.exceptions import ValidationError as DjangoValidationError
import pandas as pd
import requests
from django.core.cache import cache

logger = logging.getLogger(__name__)

# Generer fichier ABP128
from openpyxl import load_workbook
from io import BytesIO
from django.http import FileResponse

from .serializers import nom_complet, validate_password_custom


# ============================================================
# BASE VIEWSET — hérité par tous les autres ViewSets
# ============================================================

class BaseViewSet(viewsets.ModelViewSet):
    """
    Par défaut : lecture pour tout utilisateur connecté, écriture réservée
    aux administrateurs. Les ViewSets surchargent permission_classes si
    une autre règle s'applique (cantine, données personnelles…).
    """
    permission_classes = [ReadAuthenticatedWriteAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    def perform_create(self, serializer):
        serializer.save(
            user_created=self.request.user,
            user_updated=self.request.user
        )

    def perform_update(self, serializer):
        serializer.save(user_updated=self.request.user)

    @action(detail=False, methods=['delete'], permission_classes=[IsAdminRole])
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
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            raise PermissionDenied("Vous ne pouvez pas supprimer votre propre compte.")
        _verifier_peut_gerer(self.request, instance)
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
    queryset = Etat.objects.all().order_by('id')
    serializer_class = EtatSerializer


class StatutViewSet(BaseViewSet):
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
    queryset = Service.objects.all().order_by('id')
    serializer_class = ServiceSerializer


class TypeBesoinViewSet(BaseViewSet):
    queryset = TypeBesoin.objects.all().order_by('id')
    serializer_class = TypeBesoinSerializer


class PrioriteViewSet(BaseViewSet):
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
    queryset = Fonction.objects.all().order_by('id')
    serializer_class = FonctionSerializer
    filterset_fields = ['libelle']
    search_fields = ['libelle']
    ordering_fields = ['libelle', 'created_at']


class CategoriesalarieViewSet(BaseViewSet):
    queryset = Categoriesalarie.objects.all().order_by('id')
    serializer_class = CategoriesalarieSerializer
    filterset_fields = ['libelle']
    search_fields = ['libelle']
    ordering_fields = ['libelle', 'created_at']


class PrestataireViewSet(BaseViewSet):
    permission_classes = [ReadGestionnaireWriteAdmin]
    queryset = Prestataire.objects.all().order_by('id')
    serializer_class = PrestataireSerializer
    filterset_fields = ['libelle']
    search_fields = ['libelle']
    ordering_fields = ['libelle', 'created_at']


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
    queryset = PlatCategoriesalarie.objects.all().order_by('-date_debut')
    serializer_class = PlatCategoriesalarieSerializer
    filterset_fields = ['categoriesalarie', 'statut']
    ordering_fields  = ['date_debut', 'created_at']


class PosteViewSet(BaseViewSet):
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
    Un utilisateur crée et suit ses propres besoins.
    Les administrateurs voient et traitent tous les besoins.
    """
    queryset = (
        Besoin.objects
        .select_related('typebesoin', 'etat', 'priorite', 'user')
        .prefetch_related('besoinservice_set__service', 'documents')
        .order_by('id')
    )
    serializer_class   = BesoinSerializer
    permission_classes = [IsAuthenticated]
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

        created = []
        for file in files:
            doc = BesoinDocument.objects.create(besoin=besoin, document=file)
            created.append(BesoinDocumentSerializer(doc).data)

        return Response(created, status=status.HTTP_201_CREATED)

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
    """Services et documents d'un besoin : visibles par l'auteur du besoin et les administrateurs."""
    permission_classes = [IsAuthenticated]

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
    permission_classes = [IsAuthenticated]
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
    permission_classes = [ReadAuthenticatedWriteGestionnaire]
    queryset = TypePlat.objects.all().order_by('id')
    serializer_class = TypePlatSerializer


class TypeEquipeViewSet(BaseViewSet):
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
            self.perform_update(serializer)

        output_serializer = self.get_serializer(plat)
        return Response(output_serializer.data, status=status.HTTP_200_OK)


class PlatImageViewSet(BaseViewSet):
    permission_classes = [ReadAuthenticatedWriteGestionnaire]
    queryset = PlatImage.objects.all().order_by('id')
    serializer_class = PlatImageSerializer


class PlatCreateView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsGestionnaireRole]

    def post(self, request, *args, **kwargs):
        serializer = PlatCreateWithImagesSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            plat = serializer.save(user_created=request.user, user_updated=request.user)
            return Response({'message': 'Plat enregistré', 'id': plat.id}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PlatUploadAPIView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsGestionnaireRole]

    def post(self, request, *args, **kwargs):
        fichiers = request.FILES.getlist('images[]')
        data = request.data.copy()
        data.setlist('images', [])
        for fichier in fichiers:
            data.appendlist('images', {'image': fichier, 'is_principale': False})

        serializer = PlatUploadSerializer(data=data, context={'request': request})
        if serializer.is_valid():
            plat = serializer.save()
            return Response({'message': 'Plat créé avec succès', 'plat_id': plat.id}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


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


class MenuPlatViewSet(BaseViewSet):
    permission_classes = [ReadAuthenticatedWriteGestionnaire]
    queryset = MenuPlat.objects.select_related('plat').all().order_by('id')
    serializer_class = MenuPlatSerializer
    filterset_fields = ['menu']


# ─────────────────────────────────────────────────────────────────────────────
# COMMANDE
# ─────────────────────────────────────────────────────────────────────────────

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

    def _base_queryset(self):
        return (
            Commande.objects
            .select_related('user', 'menu__agence', 'menu__typeequipe', 'plat__type_plat', 'plat__agence')
            .prefetch_related('plat__images', 'user__useragence_set__agence')
            .order_by('-date_commande')
        )

    def get_queryset(self):
        qs = self._base_queryset()
        if is_gestionnaire(self.request.user):
            return qs
        return qs.filter(user=self.request.user)

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

        qs = self._base_queryset()
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
      date_debut   : YYYY-MM-DD
      date_fin     : YYYY-MM-DD
      agences      : "1,2,3"
      typeequipes  : "1,2"
      statuts      : "en_attente,retiree,annulee"
    """
    permission_classes = [IsGestionnaireRole]

    def get(self, request):
        from django.db.models import Count, Q
        from django.db.models.functions import ExtractMonth
        from decimal import Decimal
        from datetime import date as date_type, timedelta

        # ── Paramètres ────────────────────────────────────────
        date_debut  = request.query_params.get('date_debut',  None)
        date_fin    = request.query_params.get('date_fin',    None)
        agences_str = request.query_params.get('agences',     None)
        equipes_str = request.query_params.get('typeequipes', None)
        statuts_str = request.query_params.get('statuts',     None)

        agences_ids = [
            int(x) for x in agences_str.split(',') if x.strip().isdigit()
        ] if agences_str else []

        equipes_ids = [
            int(x) for x in equipes_str.split(',') if x.strip().isdigit()
        ] if equipes_str else []

        statuts_list = [
            x.strip() for x in statuts_str.split(',')
            if x.strip() in ['en_attente', 'retiree', 'annulee']
        ] if statuts_str else []

        # ── Querysets de base ─────────────────────────────────
        commande_qs = Commande.objects.all()
        menu_qs     = Menu.objects.all()

        if date_debut:
            commande_qs = commande_qs.filter(menu__date_menu__gte=date_debut)
            menu_qs     = menu_qs.filter(date_menu__gte=date_debut)
        if date_fin:
            commande_qs = commande_qs.filter(menu__date_menu__lte=date_fin)
            menu_qs     = menu_qs.filter(date_menu__lte=date_fin)
        if agences_ids:
            commande_qs = commande_qs.filter(menu__agence__id__in=agences_ids)
            menu_qs     = menu_qs.filter(agence__id__in=agences_ids)
        if equipes_ids:
            commande_qs = commande_qs.filter(menu__typeequipe__id__in=equipes_ids)
            menu_qs     = menu_qs.filter(typeequipe__id__in=equipes_ids)
        if statuts_list:
            commande_qs = commande_qs.filter(statut__in=statuts_list)

        # ── KPIs globaux ──────────────────────────────────────
        total_commandes  = commande_qs.count()
        total_en_attente = commande_qs.filter(statut='en_attente').count()
        total_retirees   = commande_qs.filter(statut='retiree').count()
        total_annulees   = commande_qs.filter(statut='annulee').count()
        total_menus      = menu_qs.count()
        taux_retrait     = round((total_retirees / total_commandes * 100) if total_commandes > 0 else 0, 1)
        taux_annulation  = round((total_annulees / total_commandes * 100) if total_commandes > 0 else 0, 1)

        # ── Par mois ──────────────────────────────────────────
        commandes_par_mois = (
            commande_qs
            .annotate(mois=ExtractMonth('menu__date_menu'))
            .values('mois')
            .annotate(
                total=Count('id'),
                en_attente=Count('id', filter=Q(statut='en_attente')),
                retiree=Count('id',    filter=Q(statut='retiree')),
                annulee=Count('id',    filter=Q(statut='annulee')),
            )
            .order_by('mois')
        )
        par_mois = {i: {'total': 0, 'en_attente': 0, 'retiree': 0, 'annulee': 0} for i in range(1, 13)}
        for row in commandes_par_mois:
            par_mois[row['mois']] = {
                'total':      int(row['total']      or 0),
                'en_attente': int(row['en_attente'] or 0),
                'retiree':    int(row['retiree']    or 0),
                'annulee':    int(row['annulee']    or 0),
            }

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

        # ── Par type équipe ───────────────────────────────────
        par_typeequipe_data = [
            {
                'typeequipe': str(row['menu__typeequipe__libelle'] or ''),
                'total':      int(row['total'] or 0),
            }
            for row in (
                commande_qs.values('menu__typeequipe__libelle')
                .annotate(total=Count('id')).order_by('-total')
            )
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

        # ── Menus récents ─────────────────────────────────────
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
                .annotate(nb_commandes=Count('commandes'))
                .order_by('-date_menu')[:5]
            )
        ]

        # ── Évolution hebdomadaire ────────────────────────────
        today    = date_type.today()
        semaines = []
        for i in range(3, -1, -1):
            debut_s = today - timedelta(weeks=i + 1)
            fin_s   = today - timedelta(weeks=i)
            qs_s    = Commande.objects.filter(menu__date_menu__gte=debut_s, menu__date_menu__lt=fin_s)
            if agences_ids: qs_s = qs_s.filter(menu__agence__id__in=agences_ids)
            if equipes_ids: qs_s = qs_s.filter(menu__typeequipe__id__in=equipes_ids)
            if statuts_list: qs_s = qs_s.filter(statut__in=statuts_list)
            semaines.append({'label': 'S-' + str(i + 1) if i > 0 else 'Cette sem.', 'total': qs_s.count()})


        # ── Evolution des commandes par statut par date menu ────
        # Retourne chaque date_menu avec les 3 compteurs de statut
        # Filtres de dates/agences/équipes appliqués, pas de filtre statut
        # (on veut toujours les 3 statuts côte à côte)
        evo_qs = Commande.objects.all()
        if date_debut:  evo_qs = evo_qs.filter(menu__date_menu__gte=date_debut)
        if date_fin:    evo_qs = evo_qs.filter(menu__date_menu__lte=date_fin)
        if agences_ids: evo_qs = evo_qs.filter(menu__agence__id__in=agences_ids)
        if equipes_ids: evo_qs = evo_qs.filter(menu__typeequipe__id__in=equipes_ids)

        evo_par_date_qs = (
            evo_qs
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
        # FACTURATION
        # Les tarifs sont chargés une seule fois en mémoire (avant : 1 à 2
        # requêtes SQL par commande retirée).
        #
        # Prestataire : pour chaque commande retirée, on prend le prestataire
        # rattaché à l'agence du menu (AgencePrestataire actif à la date du
        # menu), puis son tarif (PlatPrestataire actif à cette date).
        # Si aucune agence n'a de prestataire rattaché, on retombe sur
        # l'ancien comportement : le tarif prestataire actif le plus récent.
        #
        # Employé : catégorie salarié active de l'agent à la date du menu
        # (UserCategoriesalarie), puis tarif de cette catégorie (PlatCategoriesalarie).
        # ════════════════════════════════════════════════════
        commandes_retirees = list(
            commande_qs.filter(statut='retiree')
            .select_related('menu__agence')
        )

        def jour(dt):
            return timezone.localtime(dt).date() if timezone.is_aware(dt) else dt.date()

        def ligne_active(lignes, d):
            """Ligne dont la période couvre la date d (la plus récente si plusieurs)."""
            meilleure = None
            for l in lignes:
                if jour(l.date_debut) <= d and (l.date_fin is None or jour(l.date_fin) >= d):
                    if meilleure is None or l.date_debut > meilleure.date_debut:
                        meilleure = l
            return meilleure

        tarifs_prest = defaultdict(list)
        for pp in PlatPrestataire.objects.select_related('prestataire'):
            tarifs_prest[pp.prestataire_id].append(pp)
        tous_tarifs_prest = [pp for lst in tarifs_prest.values() for pp in lst]

        prest_par_agence = defaultdict(list)
        for ap in AgencePrestataire.objects.all():
            prest_par_agence[ap.agence_id].append(ap)

        total_montant_prestataire = Decimal('0.00')
        fact_prest_par_mois       = {i: Decimal('0.00') for i in range(1, 13)}
        fact_prest_par_agence     = {}
        fact_prest_par_prest      = {}

        for cmd in commandes_retirees:
            date_menu = cmd.menu.date_menu
            agence_id = cmd.menu.agence_id

            if prest_par_agence:
                ap = ligne_active(prest_par_agence.get(agence_id, []), date_menu)
                pp = ligne_active(tarifs_prest.get(ap.prestataire_id, []), date_menu) if ap else None
            else:
                pp = ligne_active(tous_tarifs_prest, date_menu)

            if not pp:
                continue

            montant = pp.montant or Decimal('0.00')
            total_montant_prestataire += montant
            fact_prest_par_mois[date_menu.month] += montant

            agence_nom = cmd.menu.agence.nom_agence
            ligne = fact_prest_par_agence.setdefault(
                agence_nom, {'agence': agence_nom, 'montant': Decimal('0.00'), 'nb_commandes': 0})
            ligne['montant']      += montant
            ligne['nb_commandes'] += 1

            prest_nom = pp.prestataire.libelle if pp.prestataire else 'Inconnu'
            ligne = fact_prest_par_prest.setdefault(
                prest_nom, {'prestataire': prest_nom, 'montant': Decimal('0.00'), 'nb_commandes': 0})
            ligne['montant']      += montant
            ligne['nb_commandes'] += 1

        fact_fournisseur = {
            'total_montant': float(total_montant_prestataire),
            'par_mois': {k: float(v) for k, v in fact_prest_par_mois.items()},
            'par_agence': [
                {'agence': v['agence'], 'montant': float(v['montant']), 'nb_commandes': v['nb_commandes']}
                for v in sorted(fact_prest_par_agence.values(), key=lambda x: x['montant'], reverse=True)
            ],
            'par_prestataire': [
                {'prestataire': v['prestataire'], 'montant': float(v['montant']), 'nb_commandes': v['nb_commandes']}
                for v in sorted(fact_prest_par_prest.values(), key=lambda x: x['montant'], reverse=True)
            ],
        }

        user_ids = {cmd.user_id for cmd in commandes_retirees}
        cats_par_user = defaultdict(list)
        for uc in UserCategoriesalarie.objects.filter(user_id__in=user_ids).select_related('categoriesalarie'):
            cats_par_user[uc.user_id].append(uc)
        tarifs_cat = defaultdict(list)
        for pc in PlatCategoriesalarie.objects.all():
            tarifs_cat[pc.categoriesalarie_id].append(pc)

        total_montant_employe   = Decimal('0.00')
        fact_emp_par_mois       = {i: Decimal('0.00') for i in range(1, 13)}
        fact_emp_par_agence     = {}
        fact_emp_par_categorie  = {}

        for cmd in commandes_retirees:
            date_menu = cmd.menu.date_menu

            user_cat = ligne_active(cats_par_user.get(cmd.user_id, []), date_menu)
            if not user_cat:
                continue
            pc = ligne_active(tarifs_cat.get(user_cat.categoriesalarie_id, []), date_menu)
            if not pc:
                continue

            montant = pc.montant or Decimal('0.00')
            total_montant_employe += montant
            fact_emp_par_mois[date_menu.month] += montant

            agence_nom = cmd.menu.agence.nom_agence
            ligne = fact_emp_par_agence.setdefault(
                agence_nom, {'agence': agence_nom, 'montant': Decimal('0.00'), 'nb_commandes': 0})
            ligne['montant']      += montant
            ligne['nb_commandes'] += 1

            cat_lib = user_cat.categoriesalarie.libelle
            ligne = fact_emp_par_categorie.setdefault(
                cat_lib, {'categorie': cat_lib, 'montant': Decimal('0.00'), 'nb_commandes': 0})
            ligne['montant']      += montant
            ligne['nb_commandes'] += 1

        fact_employe = {
            'total_montant': float(total_montant_employe),
            'par_mois': {k: float(v) for k, v in fact_emp_par_mois.items()},
            'par_agence': [
                {'agence': v['agence'], 'montant': float(v['montant']), 'nb_commandes': v['nb_commandes']}
                for v in sorted(fact_emp_par_agence.values(), key=lambda x: x['montant'], reverse=True)
            ],
            'par_categorie': [
                {'categorie': v['categorie'], 'montant': float(v['montant']), 'nb_commandes': v['nb_commandes']}
                for v in sorted(fact_emp_par_categorie.values(), key=lambda x: x['montant'], reverse=True)
            ],
        }

        return Response({
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
            'par_typeequipe':   par_typeequipe_data,
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
        return (
            Retrait.objects
            .select_related('user', 'menu__agence', 'menu__typeequipe')
            .order_by('-date_retrait')
        )


# ============================================================
# GÉNÉRATION FICHIER APB128
# ============================================================

class GenererAPB128View(APIView):
    parser_classes = [MultiPartParser]
    permission_classes = [IsAdminRole]

    def post(self, request):
        excel_file = request.FILES.get("file")
        if not excel_file:
            return Response({"error": "Fichier manquant."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            wb       = load_workbook(filename=excel_file, data_only=True)
            ws_ident = wb["Identification"]
            ws_prel  = wb["Prelevements"]

            ident_data = {
                row[0].value: str(row[1].value).strip() if row[1].value is not None else ''
                for row in ws_ident.iter_rows(min_row=2)
            }

            prelevements = []
            for row in ws_prel.iter_rows(min_row=2, values_only=True):
                prelevements.append({
                    "Date_Execution": row[0], "Code_Guichet": row[1], "Compte": row[2],
                    "Cle_RIB": row[3], "Nom_Client": row[4], "Libelle_Banque_Client": row[5],
                    "Libelle_Operation": row[6], "Numero_Autorisation": row[7], "Montant": row[8]
                })

            def left_pad(val, size, char='0'):
                return str(val).strip()[:size].rjust(size, char)

            def right_pad(val, size, char=' '):
                return str(val).strip()[:size].ljust(size, char)

            def format_amount(val):
                val = int(val or 0)
                return str(val).rjust(12, '0')[-12:]

            lines         = []
            seq           = 1
            montant_total = 0
            compte_total  = int(ident_data["Compte"]) if ident_data["Compte"].isdigit() else 0

            lines.append(
                "03" + "1" + left_pad(seq, 5) +
                left_pad(ident_data["Date_Execution"], 6) + "CI006" +
                left_pad(ident_data["Code_Guichet"], 5) +
                left_pad(ident_data["Compte"], 12) +
                left_pad(ident_data["Cle_RIB"], 2) +
                right_pad(ident_data["Nom_Emetteur"], 24) +
                left_pad(ident_data["Code_Emetteur"], 5) +
                right_pad(" ", 1) +
                left_pad(ident_data["Date_Remise"], 6) +
                right_pad(ident_data["Reference_Remise"], 7) +
                right_pad(ident_data["Zone_Libre"], 47)
            )

            for p in prelevements:
                seq         += 1
                compte_val   = int(str(p["Compte"]).lstrip("0") or 0)
                montant_val  = int(p["Montant"] or 0)
                compte_total += compte_val
                montant_total += montant_val

                lines.append(
                    "03" + "2" + left_pad(seq, 5) +
                    left_pad(p["Date_Execution"], 6) + "CI006" +
                    left_pad(p["Code_Guichet"], 5) +
                    left_pad(p["Compte"], 12) +
                    left_pad(p["Cle_RIB"], 2) +
                    right_pad(p["Nom_Client"], 24) +
                    right_pad(p["Libelle_Banque_Client"], 17) +
                    right_pad(p["Libelle_Operation"], 20) +
                    left_pad(p["Numero_Autorisation"] or "0000000000", 10) +
                    format_amount(p["Montant"]) + "00" +
                    right_pad("", 5)
                )

            seq += 1
            lines.append(
                "03" + "9" + left_pad(seq, 5) +
                left_pad(ident_data["Date_Remise"], 6) +
                right_pad("", 8) +
                format_amount(compte_total) +
                right_pad(ident_data["Compte"].lstrip("0"), 77) +
                format_amount(montant_total) +
                right_pad("", 5)
            )

            output = BytesIO()
            output.write("\n".join(lines).encode('utf-8'))
            output.seek(0)
            return FileResponse(output, as_attachment=True, filename="FICHIER_APB128.txt")

        except Exception as e:
            logger.exception("Génération APB128")
            return Response({"error": f"Fichier invalide : {e}"}, status=status.HTTP_400_BAD_REQUEST)


# ============================================================
# GESTION ENTRETIEN VÉHICULE
# ============================================================

class TypeVehiculeViewSet(BaseViewSet):
    permission_classes = [IsAdminRole]
    queryset = TypeVehicule.objects.all().order_by('id')
    serializer_class = TypeVehiculeSerializer


class VehiculeViewSet(BaseViewSet):
    permission_classes = [IsAdminRole]
    queryset = (
        Vehicule.objects
        .select_related('type_vehicule', 'agence', 'statut')
        .order_by('id')
    )
    serializer_class = VehiculeSerializer
    filterset_fields = ['immatriculation']


class PublicVehiculeListAPIView(ListAPIView):
    queryset = Vehicule.objects.all()
    serializer_class = VehiculeSerializer
    permission_classes = [IsAdminRole]
    pagination_class = None


class PublicTypeVehiculeListAPIView(ListAPIView):
    queryset = TypeVehicule.objects.all()
    serializer_class = TypeVehiculeSerializer
    permission_classes = [IsAdminRole]
    pagination_class = None


class ImportEntretienExcelView(APIView):
    parser_classes = [MultiPartParser]
    permission_classes = [IsAdminRole]

    def post(self, request):
        excel_file = request.FILES.get("file")
        if not excel_file:
            return Response({"error": "Fichier manquant"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            wb    = load_workbook(excel_file, data_only=True)
            sheet = wb.active

            lignes_traitees = 0
            ignorees        = []
            with transaction.atomic():
                for num, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), start=2):
                    if not row or len(row) < 6:
                        continue
                    immatricule_str, description, periode, debit, credit, solde = row[:6]

                    if not immatricule_str or not periode:
                        continue

                    vehicule = Vehicule.objects.filter(immatriculation=immatricule_str).first()
                    if not vehicule:
                        ignorees.append(f"ligne {num} : véhicule {immatricule_str} inconnu")
                        continue

                    EntretienVehicule.objects.filter(vehicule=vehicule, periode=periode).delete()
                    EntretienVehicule.objects.create(
                        vehicule=vehicule,
                        description=description or '',
                        date_entretien_vehicule=now(),
                        periode=periode,
                        debit=Decimal(str(debit or 0)),
                        credit=Decimal(str(credit or 0)),
                        solde=Decimal(str(solde or 0)),
                        user_created=request.user,
                        user_updated=request.user,
                    )
                    lignes_traitees += 1

            return Response(
                {"success": f"{lignes_traitees} entretien(s) importé(s) avec succès",
                 "lignes_ignorees": ignorees},
                status=status.HTTP_201_CREATED
            )

        except Exception as e:
            logger.exception("Import entretien véhicule")
            return Response({"error": f"Fichier invalide : {e}"}, status=status.HTTP_400_BAD_REQUEST)


class EntretienVehiculeViewSet(BaseViewSet):
    permission_classes = [IsAdminRole]
    queryset = (
        EntretienVehicule.objects
        .select_related('vehicule', 'vehicule__agence')
        .order_by('periode')
    )
    serializer_class = EntretienVehiculeSerializer
    filterset_fields = ['vehicule']


class EtatEntretienGroupesView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        annee           = request.query_params.get('annee')
        agence_id       = request.query_params.get('agence_id')
        immatriculation = request.query_params.get('immatriculation')

        if not annee:
            from datetime import datetime
            annee = datetime.today().year
        else:
            try:
                annee = int(annee)
            except ValueError:
                return Response({"error": "Année invalide"}, status=400)

        if agence_id:
            try:
                agence_id = int(agence_id)
            except ValueError:
                return Response({"error": "agence_id invalide"}, status=400)
        else:
            agence_id = None

        data = get_entretien_par_agence_avec_groupement(
            annee=annee, agence_id=agence_id, immatriculation=immatriculation
        )
        return Response(data)


# ============================================================
# RESSOURCES HUMAINES — Simulation salaire
# ============================================================

class SimulationSalaireUploadView(APIView):
    parser_classes = [MultiPartParser]
    permission_classes = [IsAdminRole]

    def post(self, request):
        fichier = request.FILES.get("file")
        if not fichier:
            return Response({"error": "Aucun fichier fourni"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            df = pd.read_excel(fichier)
            with transaction.atomic():
                simulations = self._importer(df)
            return Response(
                [SimulationSalaireSerializer(s).data for s in simulations],
                status=status.HTTP_201_CREATED,
            )

        except DjangoValidationError as e:
            return Response({"error": e.messages[0]}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception("Import simulation salaire")
            return Response({"error": f"Fichier invalide : {e}"}, status=status.HTTP_400_BAD_REQUEST)

    @staticmethod
    def _importer(df):
        from datetime import datetime

        simulations = []
        for _, row in df.iterrows():
            try:
                valeur_date = row["Date de naiss."]
                if isinstance(valeur_date, (datetime, pd.Timestamp)):
                    date_naiss = valeur_date.date()
                else:
                    date_naiss = datetime.strptime(str(valeur_date).strip(), "%d/%m/%Y").date()
            except Exception:
                # Annule tout l'import (transaction) : pas d'import partiel
                raise DjangoValidationError(
                    f"Date invalide pour le matricule {row['Matricule']}."
                )

            age_2025 = 2025 - date_naiss.year
            salaire  = float(row["Salaire de base brut 2025"])

            simulation = SimulationSalaire.objects.create(
                matricule=row["Matricule"],
                categorie=row["Cat."],
                date_naissance=date_naiss,
                salaire_base=row["Salaire de base"],
                sursalaire=row["Sursalaire"],
                salaire_brut_2025=salaire
            )

            annee          = 2025
            salaire_actuel = salaire
            lignes         = []

            while age_2025 <= 60:
                if salaire_actuel < 150000:
                    taux = 0.20
                elif salaire_actuel < 250000:
                    taux = 0.10
                else:
                    taux = 0.025

                augmentation = round(salaire_actuel * taux)
                cotisation   = round(salaire_actuel * 0.075) if salaire_actuel > 250000 else 0

                lignes.append(SimulationHistorique(
                    simulation=simulation, annee=annee, age=age_2025,
                    salaire=salaire_actuel, taux_augmentation=taux * 100,
                    augmentation=augmentation, cotisation=cotisation
                ))

                salaire_actuel += augmentation
                annee          += 1
                age_2025       += 1

            SimulationHistorique.objects.bulk_create(lignes)
            simulations.append(simulation)

        return simulations


class SimulationSalaireListView(ListAPIView):
    permission_classes = [IsAdminRole]
    queryset = SimulationSalaire.objects.all().order_by('-created_at')
    serializer_class = SimulationSalaireSerializer


class SimulationViewSet(BaseViewSet):
    queryset = SimulationSalaire.objects.all().order_by('matricule')
    serializer_class = SimulationSalaireSerializer
    permission_classes = [IsAdminRole]
    pagination_class = None

    def get_serializer_context(self):
        return {'request': self.request}

    def list(self, request, *args, **kwargs):
        from django.db.models import Q

        annee_debut = request.query_params.get('annee_debut')
        annee_fin   = request.query_params.get('annee_fin')
        salaire_min = request.query_params.get('salaire_min')
        salaire_max = request.query_params.get('salaire_max')

        filters = Q()
        if annee_debut: filters &= Q(annee__gte=annee_debut)
        if annee_fin:   filters &= Q(annee__lte=annee_fin)
        if salaire_min: filters &= Q(salaire__gte=salaire_min)
        if salaire_max: filters &= Q(salaire__lte=salaire_max)

        queryset = self.filter_queryset(self.get_queryset().prefetch_related('historique'))

        filtered_queryset = []
        for sim in queryset:
            historique_qs = sim.historique.all()
            if filters:
                historique_qs = historique_qs.filter(filters)
            if historique_qs.exists():
                filtered_queryset.append(sim)

        count = len(filtered_queryset)
        page  = self.paginate_queryset(filtered_queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            data = serializer.data
        else:
            serializer = self.get_serializer(filtered_queryset, many=True)
            data = serializer.data

        historiques   = SimulationHistorique.objects.filter(filters) if filters else SimulationHistorique.objects.all()
        total_global  = {
            "salaire":      sum(float(h.salaire)      for h in historiques),
            "augmentation": sum(float(h.augmentation) for h in historiques),
            "cotisation":   sum(float(h.cotisation)   for h in historiques),
        }

        total_par_annee = {}
        for h in historiques:
            annee = str(h.annee)
            if annee not in total_par_annee:
                total_par_annee[annee] = {"salaire": 0, "augmentation": 0, "cotisation": 0, "effectif_aug": 0, "effectif_cot": 0}
            total_par_annee[annee]["salaire"]      += float(h.salaire)
            total_par_annee[annee]["augmentation"] += float(h.augmentation)
            total_par_annee[annee]["cotisation"]   += float(h.cotisation)
            if float(h.augmentation) > 0: total_par_annee[annee]["effectif_aug"] += 1
            if float(h.cotisation)   > 0: total_par_annee[annee]["effectif_cot"] += 1

        for annee, totals in total_par_annee.items():
            totals["effectif_non_aug"] = count - totals["effectif_aug"]
            totals["effectif_non_cot"] = count - totals["effectif_cot"]

        def init_tranche():
            return {"salaire": 0, "augmentation": 0, "cotisation": 0, "effectif_aug": 0, "effectif_cot": 0}

        total_par_annee_tranche_20  = {}
        total_par_annee_tranche_10  = {}
        total_par_annee_tranche_2_5 = {}

        for h in historiques:
            annee        = str(h.annee)
            salaire      = float(h.salaire)
            augmentation = float(h.augmentation)
            cotisation   = float(h.cotisation)

            if salaire < 150000:
                target = total_par_annee_tranche_20
            elif salaire <= 250000:
                target = total_par_annee_tranche_10
            else:
                target = total_par_annee_tranche_2_5

            if annee not in target:
                target[annee] = init_tranche()

            target[annee]["salaire"]      += salaire
            target[annee]["augmentation"] += augmentation
            target[annee]["cotisation"]   += cotisation
            if augmentation > 0: target[annee]["effectif_aug"] += 1
            if cotisation   > 0: target[annee]["effectif_cot"] += 1

        for total in [total_par_annee_tranche_20, total_par_annee_tranche_10, total_par_annee_tranche_2_5]:
            for annee, vals in total.items():
                vals["effectif_non_aug"] = count - vals["effectif_aug"]
                vals["effectif_non_cot"] = count - vals["effectif_cot"]

        return Response({
            "results": data, "total_global": total_global,
            "total_par_annee": total_par_annee,
            "total_par_annee_tranche_20": total_par_annee_tranche_20,
            "total_par_annee_tranche_10": total_par_annee_tranche_10,
            "total_par_annee_tranche_2_5": total_par_annee_tranche_2_5,
            "count": count
        })


class GenererSimulationHistorique2View(APIView):
    permission_classes = [IsAdminRole]
    @transaction.atomic
    def post(self, request):
        deleted_count, _ = SimulationHistorique2.objects.all().delete()
        simulations  = SimulationSalaire.objects.all()
        total_crees  = 0
        lignes       = []

        for simulation in simulations:
            age_2025      = 2025 - simulation.date_naissance.year
            salaire       = Decimal(simulation.salaire_brut_2025).quantize(Decimal('1.'), rounding=ROUND_HALF_UP)
            annee         = 2025
            age           = age_2025
            is_first_year = True

            while age <= 60:
                if is_first_year and salaire < 150000:
                    augmentation = Decimal(150000 - salaire).quantize(Decimal('1.'), rounding=ROUND_HALF_UP)
                    taux         = (Decimal(augmentation) / salaire * 100).quantize(Decimal('0.01'))
                    salaire      = Decimal(150000)
                else:
                    if salaire < 150000:
                        taux = Decimal('20.00')
                    elif salaire <= 250000:
                        taux = Decimal('10.00')
                    else:
                        taux = Decimal('2.50')
                    augmentation = (salaire * taux / 100).quantize(Decimal('1.'), rounding=ROUND_HALF_UP)

                cotisation = (salaire * Decimal('0.075')).quantize(Decimal('1.')) if salaire > 250000 else Decimal(0)

                lignes.append(SimulationHistorique2(
                    simulation=simulation, annee=annee, age=age, salaire=salaire,
                    taux_augmentation=taux, augmentation=augmentation, cotisation=cotisation
                ))

                salaire      += augmentation
                annee        += 1
                age          += 1
                total_crees  += 1
                is_first_year = False

        SimulationHistorique2.objects.bulk_create(lignes, batch_size=1000)

        return Response({
            "message": f"{deleted_count} ancienne(s) ligne(s) supprimée(s). "
                       f"{total_crees} nouvelle(s) ligne(s) créée(s) dans SimulationHistorique2."
        }, status=status.HTTP_201_CREATED)


class Simulation2ViewSet(BaseViewSet):
    queryset = SimulationSalaire.objects.all().order_by('matricule')
    serializer_class = SimulationSalaire2Serializer
    permission_classes = [IsAdminRole]
    pagination_class = None

    def get_serializer_context(self):
        return {'request': self.request}

    def list(self, request, *args, **kwargs):
        from django.db.models import Q

        annee_debut = request.query_params.get('annee_debut')
        annee_fin   = request.query_params.get('annee_fin')
        salaire_min = request.query_params.get('salaire_min')
        salaire_max = request.query_params.get('salaire_max')

        filters = Q()
        if annee_debut: filters &= Q(annee__gte=annee_debut)
        if annee_fin:   filters &= Q(annee__lte=annee_fin)
        if salaire_min: filters &= Q(salaire__gte=salaire_min)
        if salaire_max: filters &= Q(salaire__lte=salaire_max)

        queryset = self.filter_queryset(self.get_queryset().prefetch_related('historique2'))

        filtered_queryset = []
        for sim in queryset:
            historique_qs = sim.historique2.all()
            if filters:
                historique_qs = historique_qs.filter(filters)
            if historique_qs.exists():
                filtered_queryset.append(sim)

        count = len(filtered_queryset)
        page  = self.paginate_queryset(filtered_queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            data = serializer.data
        else:
            serializer = self.get_serializer(filtered_queryset, many=True)
            data = serializer.data

        historiques  = SimulationHistorique2.objects.filter(filters) if filters else SimulationHistorique2.objects.all()
        total_global = {
            "salaire":      sum(float(h.salaire)      for h in historiques),
            "augmentation": sum(float(h.augmentation) for h in historiques),
            "cotisation":   sum(float(h.cotisation)   for h in historiques),
        }

        total_par_annee = {}
        for h in historiques:
            annee = str(h.annee)
            if annee not in total_par_annee:
                total_par_annee[annee] = {"salaire": 0, "augmentation": 0, "cotisation": 0, "effectif_aug": 0, "effectif_cot": 0}
            total_par_annee[annee]["salaire"]      += float(h.salaire)
            total_par_annee[annee]["augmentation"] += float(h.augmentation)
            total_par_annee[annee]["cotisation"]   += float(h.cotisation)
            if float(h.augmentation) > 0: total_par_annee[annee]["effectif_aug"] += 1
            if float(h.cotisation)   > 0: total_par_annee[annee]["effectif_cot"] += 1

        for annee, totals in total_par_annee.items():
            totals["effectif_non_aug"] = count - totals["effectif_aug"]
            totals["effectif_non_cot"] = count - totals["effectif_cot"]

        def init_tranche():
            return {"salaire": 0, "augmentation": 0, "cotisation": 0, "effectif_aug": 0, "effectif_cot": 0}

        total_par_annee_tranche_20  = {}
        total_par_annee_tranche_10  = {}
        total_par_annee_tranche_2_5 = {}

        for h in historiques:
            annee        = str(h.annee)
            salaire      = float(h.salaire)
            augmentation = float(h.augmentation)
            cotisation   = float(h.cotisation)

            if salaire < 150000:
                target = total_par_annee_tranche_20
            elif salaire <= 250000:
                target = total_par_annee_tranche_10
            else:
                target = total_par_annee_tranche_2_5

            if annee not in target:
                target[annee] = init_tranche()

            target[annee]["salaire"]      += salaire
            target[annee]["augmentation"] += augmentation
            target[annee]["cotisation"]   += cotisation
            if augmentation > 0: target[annee]["effectif_aug"] += 1
            if cotisation   > 0: target[annee]["effectif_cot"] += 1

        for total in [total_par_annee_tranche_20, total_par_annee_tranche_10, total_par_annee_tranche_2_5]:
            for annee, vals in total.items():
                vals["effectif_non_aug"] = count - vals["effectif_aug"]
                vals["effectif_non_cot"] = count - vals["effectif_cot"]

        return Response({
            "results": data, "total_global": total_global,
            "total_par_annee": total_par_annee,
            "total_par_annee_tranche_20": total_par_annee_tranche_20,
            "total_par_annee_tranche_10": total_par_annee_tranche_10,
            "total_par_annee_tranche_2_5": total_par_annee_tranche_2_5,
            "count": count
        })


# ============================================================
# PLAN COMPTABLE
# ============================================================

class CategorieComptableViewSet(BaseViewSet):
    permission_classes = [IsAdminRole]
    queryset = CategorieComptable.objects.all().order_by('id')
    serializer_class = CategorieComptableSerializer


class PublicCategorieComptableListAPIView(ListAPIView):
    queryset = CategorieComptable.objects.all()
    serializer_class = CategorieComptableSerializer
    permission_classes = [IsAdminRole]
    pagination_class = None


class ClasseComptableViewSet(BaseViewSet):
    permission_classes = [IsAdminRole]
    queryset = ClasseComptable.objects.all().order_by('id')
    serializer_class = ClasseComptableSerializer
    filterset_fields = ['libelle']


class ClasseComptableListAPIView(ListAPIView):
    queryset = ClasseComptable.objects.all()
    serializer_class = ClasseComptableSerializer
    permission_classes = [IsAdminRole]
    pagination_class = None


class PosteReportingViewSet(BaseViewSet):
    permission_classes = [IsAdminRole]
    queryset = PosteReporting.objects.all().order_by('id')
    serializer_class = PosteReportingSerializer
    filterset_fields = ['libelle']


class PosteReportingListAPIView(ListAPIView):
    queryset = PosteReporting.objects.all()
    serializer_class = PosteReportingSerializer
    permission_classes = [IsAdminRole]
    pagination_class = None


class CompteComptableViewSet(BaseViewSet):
    permission_classes = [IsAdminRole]
    queryset = (
        CompteComptable.objects
        .select_related('classecomptable', 'postereporting')
        .order_by('id')
    )
    serializer_class = CompteComptableSerializer
    filterset_fields = ['libelle']


class CompteComptableListAPIView(ListAPIView):
    queryset = CompteComptable.objects.all()
    serializer_class = CompteComptableSerializer
    permission_classes = [IsAdminRole]
    pagination_class = None


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


class AllEntretienVehiculeNopginListAPIView(ListAPIView):
    """Appelé par le web (entretienvehicule.service.ts) mais absent jusqu'ici → 404."""
    queryset           = EntretienVehicule.objects.select_related('vehicule').order_by('periode')
    serializer_class   = EntretienVehiculeSerializer
    permission_classes = [IsAdminRole]
    pagination_class   = None


class AllSimulationSalaireNopginListAPIView(ListAPIView):
    """Appelé par le web (simulationsalaire.service.ts) mais absent jusqu'ici → 404."""
    queryset           = SimulationSalaire.objects.prefetch_related('historique').order_by('matricule')
    serializer_class   = SimulationSalaireSerializer
    permission_classes = [IsAdminRole]
    pagination_class   = None


class SimulationSalaireCrudViewSet(BaseViewSet):
    """CRUD paginé /simulationsalaires/ utilisé par le web (absent jusqu'ici → 404)."""
    queryset           = SimulationSalaire.objects.prefetch_related('historique').order_by('matricule')
    serializer_class   = SimulationSalaireSerializer
    permission_classes = [IsAdminRole]


class AllPlatNopginListAPIView(ListAPIView):
    queryset = Plat.objects.select_related('type_plat', 'agence').prefetch_related('images')
    serializer_class = PlatSerializer
    permission_classes = [IsAuthenticated]
    pagination_class   = None


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
