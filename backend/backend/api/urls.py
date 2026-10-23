from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import *
from .accueil import AccueilView
from .planning import PlanningView


class ConnexionSerializer(TokenObtainPairSerializer):
    default_error_messages = {
        'no_active_account': 'Matricule ou mot de passe incorrect, ou compte désactivé.',
    }


class ThrottledTokenObtainPairView(TokenObtainPairView):
    """Connexion JWT avec limitation de débit (anti force brute)."""
    serializer_class = ConnexionSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'


class ThrottledTokenRefreshView(TokenRefreshView):
    """Renouvellement du jeton, lui aussi limité."""
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'token_refresh'

router = DefaultRouter()
router.register(r'users', UserViewSet)
router.register(r'agences', AgenceViewSet)
router.register(r'etats', EtatViewSet)
router.register(r'statuts', StatutViewSet)
router.register(r'services', ServiceViewSet)
router.register(r'typebesoins', TypeBesoinViewSet)
router.register(r'priorites', PrioriteViewSet)
router.register(r'user-services', UserServiceViewSet)
router.register(r'user-agences', UserAgenceViewSet)
router.register(r'besoins', BesoinViewSet)
router.register(r'besoin-services', BesoinServiceViewSet)
router.register(r'besoin-documents', BesoinDocumentViewSet)
router.register(r'groups', GroupViewSet)
router.register(r'fonctions', FonctionViewSet)
router.register(r'categoriesalaries', CategoriesalarieViewSet)
router.register(r'prestataires', PrestataireViewSet)

# cantine
router.register(r'typeplats', TypePlatViewSet)
router.register(r'plats', PlatViewSet)
router.register(r'plat-images', PlatImageViewSet)
router.register(r'menus', MenuViewSet)
router.register(r'menu-plats', MenuPlatViewSet)
router.register(r'commandes', CommandeViewSet, basename='commande')
router.register(r'retraits',  RetraitViewSet,  basename='retrait')
router.register(r'typeequipes', TypeEquipeViewSet)


router.register(r'plat-prestataires', PlatPrestataireViewSet)
router.register(r'agence-prestataires', AgencePrestataireViewSet)
router.register(r'plat-categoriesalaries', PlatCategoriesalarieViewSet)
router.register(r'postes', PosteViewSet)

router.register(r'user-postes',            UserPosteViewSet)
router.register(r'user-categoriesalaries', UserCategoriesalarieViewSet)
router.register(r'user-allergies',         UserAllergieViewSet, basename='userallergie')

# Facturation mensuelle figée
router.register(r'facturation/clotures', ClotureMensuelleViewSet, basename='cloture-mensuelle')
router.register(r'factures',             FactureMensuelleViewSet, basename='facture-mensuelle')
router.register(r'factures-prestataires', FacturePrestataireViewSet, basename='facture-prestataire')
router.register(r'popups-connexion', PopupConnexionViewSet, basename='popup-connexion')
router.register(r'bannieres',            BanniereViewSet, basename='banniere')
router.register(r'avis-plats',           AvisPlatViewSet, basename='avis-plat')

urlpatterns = [
    path('api/', include(router.urls)),
    path('api/token/', ThrottledTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', ThrottledTokenRefreshView.as_view(), name='token_refresh'),
    # Listes sans pagination (utilisateur connecté requis)
    path('api/public/typebesoins/', PublicTypeBesoinListAPIView.as_view(), name='public-typebesoin-list'),
    path('api/public/priorites/', PublicPrioriteListAPIView.as_view(), name='public-priorite-list'),
    path('besoins/creer/', BesoinCreateView.as_view(), name='besoin-creer'),
    path('api/allnopagin/agences/', AllAgenceNopginListAPIView.as_view(), name='allnopagin-agence-list'),
    path('api/allnopagin/typeplats/', PublicTypePlatListAPIView.as_view(), name='allnopagin-typeplat-list'),
    path('api/allnopagin/typeequipes/', PublicTypeEquipeListAPIView.as_view(), name='allnopagin-typeequipe-list'),
    path('api/allnopagin/statuts/', PublicStatutListAPIView.as_view(), name='allnopagin-statut-list'),
    path('api/allnopagin/etats/', PublicEtatListAPIView.as_view(), name='allnopagin-etat-list'),
    path('api/allnopagin/fonctions/', FonctionListAPIView.as_view(), name='allnopagin-fonction-list'),
    path('api/allnopagin/services/', ServiceListAPIView.as_view(), name='allnopagin-service-list'),
    path('api/allnopagin/categoriesalaries/', CategoriesalarieListAPIView.as_view(), name='allnopagin-categoriesalarie-list'),
    path('api/allnopagin/postes/', PosteListAPIView.as_view(), name='allnopagin-poste-list'),
    path('api/allnopagin/groups/', GroupListAPIView.as_view(), name='allnopagin-group-list'),
    path('api/allnopagin/users/', AllUserNopginListAPIView.as_view(), name='allnopagin-user-list'),
    path('api/dashboard-cantine/', DashboardCantineView.as_view(), name='dashboard-cantine'),
    path('api/accueil/', AccueilView.as_view(), name='accueil'),
    path('api/planning/', PlanningView.as_view(), name='planning'),
    path('api/facturation/', FacturationView.as_view(), name='facturation'),
    path('api/facturation/prestataires/', FacturationPrestataireView.as_view(), name='facturation-prestataires'),
    path('api/parametres-societe/', ParametresSocieteView.as_view(), name='parametres-societe'),
    # Liens de téléchargement de l'application mobile : lecture publique, modification admin
    path('api/application-mobile/', ApplicationMobileView.as_view(), name='application-mobile'),
    path('api/parametres-cantine/', ParametresCantineView.as_view(), name='parametres-cantine'),
    path('api/allnopagin/plats/', AllPlatNopginListAPIView.as_view(), name='allnopagin-plat-list'),
    path('api/allnopagin/prestataires/', AllPrestataireNopginListAPIView.as_view(), name='allnopagin-prestataire-list'),
    path('api/device-tokens/', DeviceTokenView.as_view(), name='device-token'),
    path('api/device-tokens/supprimer/', DeviceTokenView.as_view(), name='device-token-delete'),
    path('api/notifications/mes-notifications/', NotificationListView.as_view(), name='mes-notifications'),
    path('api/notifications/<int:pk>/marquer-lu/', NotificationDetailView.as_view(), name='notification-marquer-lu'),
    path('api/notifications/<int:pk>/supprimer/', NotificationDetailView.as_view(), name='notification-supprimer'),
    path('api/notifications/tout-marquer-lu/', NotificationBulkView.as_view(), name='notifications-tout-marquer-lu'),
    path('api/notifications/tout-supprimer/', NotificationBulkView.as_view(), name='notifications-tout-supprimer'),
]

