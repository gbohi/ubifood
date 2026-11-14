from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import *
from .accueil import AccueilView
from .planning import PlanningView
from .tarifs_grille import GrilleTarifsView
from .suivi_repas import (
    PonctualiteView, PreferencesSuiviView, PrestataireIncidentView, PrestataireSuiviEtapeView, PrestataireSuiviView,
    SuiviLivraisonsView,
)
from .planning_equipes import (
    CopierSemaineView, ImporterView, PlanningEmployesView, PlanningEquipesView, PlanningHistoriqueView,
    ProgrammationDetailView, ProgrammerView, RetirerView,
)
from .statistiques import DetailServiceView, RepasCategoriesView, StatistiquesView
from .controle import ContestationRetraitViewSet, ControleRetraitsView
from . import espace_prestataire as presta
from . import caisse
from . import parcours_commande as parcours
from . import suivi_factures as suivi


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
router.register(r'contestations-retrait', ContestationRetraitViewSet, basename='contestation-retrait')

# Espace prestataire (comptes « prestataire » et « agent_comptoir »)
router.register(r'prestataire/plats', presta.PlatEspaceViewSet, basename='prestataire-plat')
router.register(r'prestataire/menus', presta.MenuEspaceViewSet, basename='prestataire-menu')

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
    path('api/tarifs/grille/', GrilleTarifsView.as_view(), name='tarifs-grille'),
    # Suivi des repas (préparation, livraison, arrivée au comptoir)
    path('api/prestataire/suivi/', PrestataireSuiviView.as_view(), name='prestataire-suivi'),
    path('api/prestataire/suivi/<int:pk>/', PrestataireSuiviEtapeView.as_view(), name='prestataire-suivi-etape'),
    path('api/prestataire/suivi/<int:pk>/incident/', PrestataireIncidentView.as_view(),
         name='prestataire-suivi-incident'),
    path('api/suivi-livraisons/', SuiviLivraisonsView.as_view(), name='suivi-livraisons'),
    path('api/suivi-livraisons/ponctualite/', PonctualiteView.as_view(), name='suivi-ponctualite'),
    path('api/suivi/preferences/', PreferencesSuiviView.as_view(), name='suivi-preferences'),
    # Planning des équipes (équipes « sur planning », ex. Nuit)
    path('api/planning-equipes/', PlanningEquipesView.as_view(), name='planning-equipes'),
    path('api/planning-equipes/employes/', PlanningEmployesView.as_view(), name='planning-equipes-employes'),
    path('api/planning-equipes/historique/', PlanningHistoriqueView.as_view(), name='planning-equipes-historique'),
    path('api/planning-equipes/programmer/', ProgrammerView.as_view(), name='planning-equipes-programmer'),
    path('api/planning-equipes/retirer/', RetirerView.as_view(), name='planning-equipes-retirer'),
    path('api/planning-equipes/importer/', ImporterView.as_view(), name='planning-equipes-importer'),
    path('api/planning-equipes/copier-semaine/', CopierSemaineView.as_view(), name='planning-equipes-copier'),
    path('api/planning-equipes/<int:pk>/', ProgrammationDetailView.as_view(), name='planning-equipes-detail'),
    path('api/statistiques/', StatistiquesView.as_view(), name='statistiques'),
    path('api/statistiques/repas-categories/', RepasCategoriesView.as_view(), name='statistiques-repas-categories'),
    path('api/statistiques/detail/', DetailServiceView.as_view(), name='statistiques-detail'),
    path('api/facturation/', FacturationView.as_view(), name='facturation'),
    path('api/facturation/prestataires/', FacturationPrestataireView.as_view(), name='facturation-prestataires'),
    path('api/facturation/prestataires/releve/', RelevePrestataireView.as_view(), name='facturation-prestataires-releve'),
    path('api/facturation/prestataires/<int:pk>/releve-pdf/', RelevePrestatairePdfView.as_view(),
         name='facturation-prestataires-releve-pdf'),
    path('api/facturation/agents-pdf/', ReleveAgentsPdfView.as_view(), name='facturation-agents-pdf'),
    path('api/parametres-societe/', ParametresSocieteView.as_view(), name='parametres-societe'),
    # Liens de téléchargement de l'application mobile : lecture publique, modification admin
    path('api/application-mobile/', ApplicationMobileView.as_view(), name='application-mobile'),
    path('api/parametres-cantine/', ParametresCantineView.as_view(), name='parametres-cantine'),
    path('api/allnopagin/plats/', AllPlatNopginListAPIView.as_view(), name='allnopagin-plat-list'),
    path('api/allnopagin/prestataires/', AllPrestataireNopginListAPIView.as_view(), name='allnopagin-prestataire-list'),
    path('api/controle-retraits/', ControleRetraitsView.as_view(), name='controle-retraits'),
    # Espace prestataire
    path('api/prestataire/contexte/', presta.ContexteView.as_view(), name='prestataire-contexte'),
    path('api/prestataire/accueil/', presta.AccueilPrestataireView.as_view(), name='prestataire-accueil'),
    path('api/prestataire/a-preparer/', presta.APreparerView.as_view(), name='prestataire-a-preparer'),
    path('api/prestataire/liste-du-jour/', presta.ListeDuJourView.as_view(), name='prestataire-liste-du-jour'),
    path('api/prestataire/comptoir/service/', presta.ComptoirServiceView.as_view(),
         name='prestataire-comptoir-service'),
    path('api/prestataire/comptoir/recherche/', presta.ComptoirRechercheView.as_view(),
         name='prestataire-comptoir-recherche'),
    path('api/prestataire/comptoir/valider/', presta.ComptoirValiderView.as_view(),
         name='prestataire-comptoir-valider'),
    path('api/prestataire/comptoir/retraits/<int:pk>/annuler/', presta.ComptoirAnnulerView.as_view(),
         name='prestataire-comptoir-annuler'),
    path('api/prestataire/releves/', presta.RelevesView.as_view(), name='prestataire-releves'),
    # Suivi des factures prestataires (api/suivi_factures.py) : côté prestataire
    path('api/prestataire/factures/', suivi.PrestaFacturesView.as_view(), name='prestataire-factures'),
    path('api/prestataire/factures/<int:pk>/', suivi.PrestaFactureDetailView.as_view(),
         name='prestataire-facture'),
    path('api/prestataire/factures/<int:pk>/accord/', suivi.PrestaFactureActionView.as_view(action='accord'),
         name='prestataire-facture-accord'),
    path('api/prestataire/factures/<int:pk>/contester/', suivi.PrestaFactureActionView.as_view(action='contester'),
         name='prestataire-facture-contester'),
    path('api/prestataire/factures/<int:pk>/deposer/', suivi.PrestaFactureActionView.as_view(action='deposer'),
         name='prestataire-facture-deposer'),
    path('api/prestataire/factures/<int:pk>/releve-pdf/', suivi.PrestaFichiersView.as_view(quoi='releve'),
         name='prestataire-facture-releve-pdf'),
    path('api/prestataire/factures/<int:pk>/depots/<int:depot>/fichier/',
         suivi.PrestaFichiersView.as_view(quoi='depot'), name='prestataire-facture-depot-fichier'),
    path('api/prestataire/factures/<int:pk>/justificatif/', suivi.PrestaFichiersView.as_view(quoi='justificatif'),
         name='prestataire-facture-justificatif'),
    path('api/prestataire/statistiques/', presta.StatistiquesPrestataireView.as_view(),
         name='prestataire-statistiques'),
    path('api/prestataire/equipe/', presta.EquipeView.as_view(), name='prestataire-equipe'),
    path('api/prestataire/profil/', presta.ProfilPrestataireView.as_view(), name='prestataire-profil'),
    # Parcours de commande des employés : agence → prestataire → équipe → jour
    path('api/commander/agences/', parcours.CommanderAgencesView.as_view(), name='commander-agences'),
    path('api/commander/prestataires/', parcours.CommanderPrestatairesView.as_view(),
         name='commander-prestataires'),
    path('api/commander/prestataires/<int:pk>/equipes/', parcours.CommanderEquipesView.as_view(),
         name='commander-equipes'),
    path('api/commander/jours/', parcours.CommanderJoursView.as_view(), name='commander-jours'),
    # Caisse et compte repas prépayé (api/caisse.py)
    path('api/caisse/contexte/', caisse.ContexteCaisseView.as_view(), name='caisse-contexte'),
    path('api/caisse/employes/', caisse.RechercheEmployeView.as_view(), name='caisse-employes'),
    path('api/caisse/employes/<int:pk>/', caisse.FicheEmployeView.as_view(), name='caisse-employe'),
    path('api/caisse/recharger/', caisse.RechargerView.as_view(), name='caisse-recharger'),
    path('api/caisse/rembourser/', caisse.RembourserView.as_view(), name='caisse-rembourser'),
    path('api/caisse/recus/', caisse.RecuListView.as_view(), name='caisse-recus'),
    path('api/caisse/recus/<int:pk>/', caisse.RecuDetailView.as_view(), name='caisse-recu'),
    path('api/caisse/recus/<int:pk>/pdf/', caisse.RecuPdfView.as_view(), name='caisse-recu-pdf'),
    path('api/caisse/recus/<int:pk>/annuler/', caisse.RecuAnnulerView.as_view(), name='caisse-recu-annuler'),
    path('api/caisse/clotures/', caisse.ClotureCaisseListView.as_view(), name='caisse-clotures'),
    path('api/caisse/clotures/apercu/', caisse.ClotureCaisseApercuView.as_view(), name='caisse-cloture-apercu'),
    path('api/caisse/clotures/<int:pk>/', caisse.ClotureCaisseDetailView.as_view(), name='caisse-cloture'),
    path('api/caisse/clotures/<int:pk>/valider/', caisse.ClotureCaisseTraiterView.as_view(valider=True),
         name='caisse-cloture-valider'),
    path('api/caisse/clotures/<int:pk>/rejeter/', caisse.ClotureCaisseTraiterView.as_view(valider=False),
         name='caisse-cloture-rejeter'),
    path('api/caisse/journal/', caisse.JournalCaisseView.as_view(), name='caisse-journal'),
    path('api/caisse/journal/pdf/', caisse.JournalCaisseView.as_view(pdf=True), name='caisse-journal-pdf'),
    path('api/caisse/comptes/', caisse.ComptesRepasView.as_view(), name='caisse-comptes'),
    path('api/caisse/comptes/<int:pk>/mouvements/', caisse.MouvementsCompteView.as_view(),
         name='caisse-compte-mouvements'),
    path('api/caisse/comptes/<int:pk>/mouvements/pdf/', caisse.MouvementsCompteView.as_view(export='pdf'),
         name='caisse-compte-mouvements-pdf'),
    path('api/caisse/comptes/<int:pk>/mouvements/xlsx/', caisse.MouvementsCompteView.as_view(export='xlsx'),
         name='caisse-compte-mouvements-xlsx'),
    path('api/caisse/caissiers/', caisse.CaissiersView.as_view(), name='caisse-caissiers'),
    # Suivi des factures prestataires : comptabilité (et administrateurs)
    path('api/paiements-prestataires/', suivi.PaiementsPrestatairesView.as_view(), name='paiements-prestataires'),
    path('api/paiements-prestataires/<int:pk>/', suivi.PaiementPrestataireDetailView.as_view(),
         name='paiement-prestataire'),
    *[path(f'api/paiements-prestataires/<int:pk>/{a}/', suivi.PaiementPrestataireActionView.as_view(action=a),
           name=f'paiement-prestataire-{a}')
      for a in ('repondre', 'valider', 'refuser', 'payer', 'relancer')],
    path('api/paiements-prestataires/<int:pk>/releve-pdf/', suivi.PaiementFichiersView.as_view(quoi='releve'),
         name='paiement-prestataire-releve-pdf'),
    path('api/paiements-prestataires/<int:pk>/depots/<int:depot>/fichier/',
         suivi.PaiementFichiersView.as_view(quoi='depot'), name='paiement-prestataire-depot-fichier'),
    path('api/paiements-prestataires/<int:pk>/justificatif/', suivi.PaiementFichiersView.as_view(quoi='justificatif'),
         name='paiement-prestataire-justificatif'),
    path('api/compte-repas/', caisse.MonCompteView.as_view(), name='compte-repas'),
    path('api/compte-repas/mouvements/', caisse.MesMouvementsView.as_view(), name='compte-repas-mouvements'),
    path('api/compte-repas/recus/', caisse.MesRecusView.as_view(), name='compte-repas-recus'),
    path('api/compte-repas/recus/<int:pk>/pdf/', caisse.MonRecuPdfView.as_view(), name='compte-repas-recu-pdf'),
    path('api/compte-repas/paiement/', caisse.InfoPaiementView.as_view(), name='compte-repas-paiement'),
    path('api/device-tokens/', DeviceTokenView.as_view(), name='device-token'),
    path('api/device-tokens/supprimer/', DeviceTokenView.as_view(), name='device-token-delete'),
    path('api/notifications/mes-notifications/', NotificationListView.as_view(), name='mes-notifications'),
    path('api/notifications/<int:pk>/marquer-lu/', NotificationDetailView.as_view(), name='notification-marquer-lu'),
    path('api/notifications/<int:pk>/supprimer/', NotificationDetailView.as_view(), name='notification-supprimer'),
    path('api/notifications/tout-marquer-lu/', NotificationBulkView.as_view(), name='notifications-tout-marquer-lu'),
    path('api/notifications/tout-supprimer/', NotificationBulkView.as_view(), name='notifications-tout-supprimer'),
]

