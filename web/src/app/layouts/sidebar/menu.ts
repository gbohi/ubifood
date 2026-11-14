import { MenuItem } from "./menu.model";
import { ADMINS, CAISSIERS, COMPTABLES, GESTIONNAIRES, PRESTATAIRES, RESPONSABLES_PRESTATAIRE } from "../../core/helpers/roles";


export const MENU: MenuItem[] = [
    {
        id: 1,
        label: 'MENUITEMS.MENU.TEXT',
        isTitle: true
    },
    // ── Espace prestataire (comptes prestataire / agent_comptoir uniquement) ──
    // L'agent de comptoir ne voit que Comptoir et Liste du jour.
    { id: 300, label: 'Accueil', icon: 'ri-home-4-line', link: '/prestataire/accueil', roles: RESPONSABLES_PRESTATAIRE },
    { id: 301, label: 'Mes plats', icon: 'ri-restaurant-2-line', link: '/prestataire/plats', roles: RESPONSABLES_PRESTATAIRE },
    { id: 302, label: 'Mes menus', icon: 'ri-calendar-2-line', link: '/prestataire/menus', roles: RESPONSABLES_PRESTATAIRE },
    { id: 303, label: 'À préparer', icon: 'ri-list-check-2', link: '/prestataire/a-preparer', roles: RESPONSABLES_PRESTATAIRE },
    { id: 304, label: 'Comptoir', icon: 'ri-qr-scan-2-line', link: '/prestataire/comptoir', roles: PRESTATAIRES },
    { id: 305, label: 'Liste du jour', icon: 'ri-file-list-3-line', link: '/prestataire/liste-du-jour', roles: PRESTATAIRES },
    { id: 306, label: 'Relevés & factures', icon: 'ri-file-text-line', link: '/prestataire/releves', roles: RESPONSABLES_PRESTATAIRE },
    { id: 307, label: 'Statistiques', icon: 'ri-bar-chart-2-line', link: '/prestataire/statistiques', roles: RESPONSABLES_PRESTATAIRE },
    { id: 308, label: 'Mon compte', isTitle: true, roles: RESPONSABLES_PRESTATAIRE },
    { id: 310, label: 'Mon profil prestataire', icon: 'ri-store-2-line', link: '/prestataire/profil', roles: RESPONSABLES_PRESTATAIRE, isNew: true },
    { id: 309, label: 'Mon équipe', icon: 'ri-team-line', link: '/prestataire/equipe', roles: RESPONSABLES_PRESTATAIRE },
    {
        // Tableau de bord de la cantine (gestionnaires et administrateurs)
        id: 2,
        label: 'MENUITEMS.DASHBOARD.TEXT',
        icon: 'ri-dashboard-line',
        link: '/',
        roles: GESTIONNAIRES
    },
    {
        id: 8,
        label: 'MENUITEMS.APPS.TEXT',
        isTitle: true
    },
    {
        // Accueil de l'employé ; les gestionnaires ont le tableau de bord
        id: 9,
        label: 'MENUITEMS.ACCUEIL.TEXT',
        icon: 'ri-home-4-line',
        link: '/cantines/accueil',
        sansRoles: [...GESTIONNAIRES, ...PRESTATAIRES],
        parentId: 8
    },
    {
        // Besoins : réservé aux administrateurs
        id: 182,
        label: 'MENUITEMS.BESOINS.TEXT',
        icon: 'ri-ticket-line',
        parentId: 8,
        roles: ADMINS,
        subItems: [
            {
                id: 201,
                label: 'MENUITEMS.APPS.LIST.LISTBESOIN',
                link: '/besoins/list-besoin',
                roles: ADMINS,
                parentId: 182
            }
        ]
    },
    {
        id: 210,
        label: 'MENUITEMS.CANTINES.TEXT',
        icon: 'ri-restaurant-line',
        parentId: 8,
        subItems: [
            {
                id: 211,
                label: 'MENUITEMS.CANTINES.LIST.PLAT',
                link: '/cantines/liste-plats',
                roles: GESTIONNAIRES,
                parentId: 210
            },
            {
                id: 212,
                label: 'MENUITEMS.CANTINES.LIST.MENU',
                link: '/cantines/liste-menus',
                roles: GESTIONNAIRES,
                parentId: 210
            },
            {
                id: 213,
                label: 'MENUITEMS.CANTINES.LIST.COMMANDE',
                link: '/cantines/liste-commandes',
                sansRoles: PRESTATAIRES,
                parentId: 210
            },
            {
                id: 214,
                label: 'MENUITEMS.CANTINES.LIST.PLANNINGMENU',
                link: '/cantines/planning-menus',
                roles: GESTIONNAIRES,
                parentId: 210
            },
            {
                // Préparation, livraison, arrivée au comptoir ; ponctualité des prestataires
                id: 2116,
                label: 'Suivi des livraisons',
                link: '/cantines/suivi-livraisons',
                roles: GESTIONNAIRES,
                isNew: true,
                parentId: 210
            },
            {
                // Équipes réservées aux employés programmés (ex. Nuit)
                id: 2115,
                label: 'Planning des équipes',
                link: '/cantines/planning-equipes',
                roles: GESTIONNAIRES,
                isNew: true,
                parentId: 210
            },
            {
                id: 215,
                label: 'MENUITEMS.CANTINES.LIST.MESCOMMANDES',
                link: '/cantines/mes-commandes',
                sansRoles: PRESTATAIRES,
                parentId: 210
            },
            {
                // Compte repas prépayé : solde, repas payés par le compte / en retenue, reçus de caisse
                id: 2113,
                label: 'Mon compte repas',
                link: '/cantines/mon-compte-repas',
                sansRoles: PRESTATAIRES,
                isNew: true,
                parentId: 210
            },
            {
                // Quiz à lots : jouer, résultats, classement, lot gagné / perdu
                id: 2118,
                label: 'Jeux',
                link: '/cantines/jeux',
                sansRoles: PRESTATAIRES,
                isNew: true,
                parentId: 210
            },
            {
                // Création des jeux, classement, publication des résultats, remise des lots
                id: 2119,
                label: 'Gérer les jeux',
                link: '/cantines/gestion-jeux',
                roles: GESTIONNAIRES,
                isNew: true,
                parentId: 210
            },
            {
                // Soldes des comptes repas des employés de ses agences (lecture seule) ;
                // la comptabilité et les administrateurs l'ont dans la section « Comptabilité »
                id: 2114,
                label: 'Comptes repas',
                link: '/caisse/comptes',
                roles: ['gestionnaire'],
                sansRoles: COMPTABLES,
                parentId: 210
            },
            {
                // Suivi des factures des prestataires de ses agences (lecture seule) ;
                // la comptabilité et les administrateurs l'ont dans « Comptabilité »
                id: 2117,
                label: 'Factures prestataires',
                link: '/caisse/paiements-prestataires',
                roles: ['gestionnaire'],
                sansRoles: COMPTABLES,
                isNew: true,
                parentId: 210
            },
            {
                id: 216,
                label: 'MENUITEMS.CANTINES.LIST.GESTIONCOMMANDE',
                link: '/cantines/gestion-commandes',
                roles: GESTIONNAIRES,
                parentId: 210
            },
            {
                id: 217,
                label: 'MENUITEMS.CANTINES.LIST.RETRAITCOMMANDE',
                link: '/cantines/retrait-commande',
                roles: GESTIONNAIRES,
                parentId: 210
            },
            {
                // Retraits validés au comptoir par les agents des prestataires,
                // contestations des employés, anomalies détectées
                id: 2112,
                label: 'Contrôle des retraits',
                link: '/cantines/controle-retraits',
                roles: GESTIONNAIRES,
                isNew: true,
                parentId: 210
            },
            {
                // Une seule entrée : la page de facturation regroupe employés et
                // prestataires en onglets (l'ancienne adresse prestataire reste valide)
                id: 218,
                label: 'MENUITEMS.CANTINES.LIST.FACTURATION',
                link: '/cantines/facturation-commande',
                actifSur: ['/cantines/facturation-prestataire'],
                roles: GESTIONNAIRES,
                parentId: 210
            },
            {
                id: 2110,
                label: 'MENUITEMS.CANTINES.LIST.AVIS',
                link: '/cantines/avis-plats',
                roles: GESTIONNAIRES,
                parentId: 210
            },
            {
                // Graphiques, classements et exports (déplacés de l'accueil gestionnaire)
                id: 2111,
                label: 'MENUITEMS.CANTINES.LIST.STATISTIQUES',
                link: '/cantines/statistiques',
                roles: GESTIONNAIRES,
                isNew: true,
                parentId: 210
            }
        ]
    },
    // ── Caisse (caissiers) et comptabilité (étape 2) ─────────────────
    // Un compte limité à la caisse ne voit que ces entrées (espaceCaisse, voir SidebarComponent).
    { id: 400, label: 'Espace caisse', isTitle: true, roles: CAISSIERS, espaceCaisse: true },
    { id: 401, label: 'Caisse', icon: 'ri-money-dollar-circle-line', link: '/caisse', roles: CAISSIERS, espaceCaisse: true },
    // Journal : dans la section Comptabilité pour qui la voit (tous les caissiers)
    { id: 402, label: 'Journal de caisse', icon: 'ri-file-list-3-line', link: '/caisse/journal', roles: CAISSIERS, sansRoles: COMPTABLES, espaceCaisse: true },
    { id: 403, label: 'Clôture de caisse', icon: 'ri-safe-2-line', link: '/caisse/cloture', roles: CAISSIERS, espaceCaisse: true },
    { id: 410, label: 'Comptabilité', isTitle: true, roles: COMPTABLES, espaceCaisse: true },
    { id: 411, label: 'Clôtures à valider', icon: 'ri-checkbox-multiple-line', link: '/caisse/clotures', roles: COMPTABLES, espaceCaisse: true },
    { id: 412, label: 'Reçus', icon: 'ri-file-paper-2-line', link: '/caisse/recus', roles: COMPTABLES, espaceCaisse: true },
    { id: 413, label: 'Comptes repas', icon: 'ri-wallet-3-line', link: '/caisse/comptes', roles: COMPTABLES, espaceCaisse: true },
    { id: 414, label: 'Journal', icon: 'ri-file-list-3-line', link: '/caisse/journal', roles: COMPTABLES, espaceCaisse: true },
    // Suivi des relevés prestataires jusqu'au paiement (étape 3)
    { id: 415, label: 'Paiements prestataires', icon: 'ri-bank-card-line', link: '/caisse/paiements-prestataires', roles: COMPTABLES, espaceCaisse: true, isNew: true },
    { id: 416, label: 'Coût des jeux', icon: 'ri-trophy-line', link: '/caisse/couts-jeux', roles: COMPTABLES, espaceCaisse: true, isNew: true },
    {
        // Une seule entrée vers l'accueil des paramètres (cartes par thème,
        // filtrées selon le rôle : le gestionnaire n'y voit que la cantine)
        id: 175,
        label: 'MENUITEMS.PARAMETRES.TEXT',
        icon: 'ri-settings-3-line',
        link: '/parametres/accueil',
        actifSur: ['/parametres'],
        roles: GESTIONNAIRES
    },
]
