import { MenuItem } from "./menu.model";
import { ADMINS, GESTIONNAIRES } from "../../core/helpers/roles";

export const MENU: MenuItem[] = [
    {
        id: 1,
        label: 'MENUITEMS.MENU.TEXT',
        isTitle: true
    },
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
        sansRoles: GESTIONNAIRES,
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
                id: 215,
                label: 'MENUITEMS.CANTINES.LIST.MESCOMMANDES',
                link: '/cantines/mes-commandes',
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
            }
        ]
    },
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
