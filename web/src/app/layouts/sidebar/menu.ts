import { MenuItem } from "./menu.model";
import { ADMINS, GESTIONNAIRES } from "../../core/helpers/roles";

export const MENU: MenuItem[] = [
    {
        id: 1,
        label: 'MENUITEMS.MENU.TEXT',
        isTitle: true
    },
    {
        id: 2,
        label: 'MENUITEMS.DASHBOARD.TEXT',
        icon: 'ph-gauge',
        subItems: [
            {
                id: 191,
                label: 'MENUITEMS.DASHBOARD.LIST.DASHBOARDCANTINE',
                link: '/',
                roles: GESTIONNAIRES,
                parentId: 2
            },
        ]
    },
    {
        id: 8,
        label: 'MENUITEMS.APPS.TEXT',
        isTitle: true
    },
    {
        // Besoins : réservé aux administrateurs
        id: 182,
        label: 'MENUITEMS.BESOINS.TEXT',
        icon: 'ph-ticket',
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
        icon: 'ph-fork-knife-light',
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
                id: 218,
                label: 'MENUITEMS.CANTINES.LIST.FACTURATIONCOMMANDE',
                link: '/cantines/facturation-commande',
                roles: GESTIONNAIRES,
                parentId: 210
            },
            {
                id: 219,
                label: 'MENUITEMS.CANTINES.LIST.FACTURATIONPRESTATAIRE',
                link: '/cantines/facturation-prestataire',
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

    //Menu ubici
    {
        id: 175,
        label: 'MENUITEMS.PARAMETRES.TEXT',
        icon: 'ph-gear-light',
        subItems: [
            {
                id: 199,
                label: 'MENUITEMS.PARAMETRES.LIST.SOCIETE',
                link: '/parametres/societe',
                roles: ADMINS,
                parentId: 175
            },
            {
                id: 198,
                label: 'MENUITEMS.PARAMETRES.LIST.BANNIERES',
                link: '/parametres/bannieres',
                roles: ADMINS,
                parentId: 175
            },
            {
                id: 1991,
                label: 'MENUITEMS.PARAMETRES.LIST.POPUPCONNEXION',
                link: '/parametres/popup-connexion',
                roles: ADMINS,
                parentId: 175
            },
            {
                id: 176,
                label: 'MENUITEMS.PARAMETRES.LIST.AGENCE',
                link: '/parametres/agence',
                roles: ADMINS,
                parentId: 175
            },
            {
                id: 177,
                label: 'MENUITEMS.PARAMETRES.LIST.ETAT',
                link: '/parametres/etat',
                roles: ADMINS,
                parentId: 175
            },
            {
                id: 178,
                label: 'MENUITEMS.PARAMETRES.LIST.PRIORITE',
                link: '/parametres/priorite',
                roles: ADMINS,
                parentId: 175
            },
            {
                id: 179,
                label: 'MENUITEMS.PARAMETRES.LIST.DEPARTEMENT',
                link: '/parametres/departement',
                roles: ADMINS,
                parentId: 175
            },
            {
                id: 180,
                label: 'MENUITEMS.PARAMETRES.LIST.STATUT',
                link: '/parametres/statut',
                roles: ADMINS,
                parentId: 175
            },
            {
                id: 181,
                label: 'MENUITEMS.PARAMETRES.LIST.TYPEBESOIN',
                link: '/parametres/typebesoin',
                roles: ADMINS,
                parentId: 175
            },
            {
                id: 1992,
                label: 'MENUITEMS.PARAMETRES.LIST.ROLE',
                link: '/parametres/role',
                roles: ADMINS,
                parentId: 175
            },
            {
                id: 183,
                label: 'MENUITEMS.PARAMETRES.LIST.USER',
                link: '/parametres/user',
                roles: ADMINS,
                parentId: 175
            },
            {
                id: 184,
                label: 'MENUITEMS.PARAMETRES.LIST.TYPEPLAT',
                link: '/parametres/typeplat',
                roles: GESTIONNAIRES,
                parentId: 175
            },
            {
                id: 186,
                label: 'MENUITEMS.PARAMETRES.LIST.TYPEEQUIPE',
                link: '/parametres/type-equipe',
                roles: GESTIONNAIRES,
                parentId: 175
            },
            {
                id: 187,
                label: 'MENUITEMS.PARAMETRES.LIST.FONCTION',
                link: '/parametres/fonction',
                roles: ADMINS,
                parentId: 175
            },
            {
                id: 188,
                label: 'MENUITEMS.PARAMETRES.LIST.CATEGORIESALARIE',
                link: '/parametres/categorie-salarie',
                roles: ADMINS,
                parentId: 175
            },
            {
                id: 189,
                label: 'MENUITEMS.PARAMETRES.LIST.PRESTATAIRE',
                link: '/parametres/prestataire',
                roles: GESTIONNAIRES,
                parentId: 175
            },
            {
                id: 190,
                label: 'MENUITEMS.PARAMETRES.LIST.POSTE',
                link: '/parametres/poste',
                roles: ADMINS,
                parentId: 175
            }
        ]
    },
    
]