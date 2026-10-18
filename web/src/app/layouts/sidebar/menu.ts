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
    /*{
        id: 182,
        label: 'MENUITEMS.BESOINS.TEXT',
        icon: 'ph-ticket',
        parentId: 8,
        subItems: [
            {
                id: 201,
                label: 'MENUITEMS.APPS.LIST.LISTBESOIN',
                link: '/besoins/list-besoin',
                parentId: 182
            }
        ]
    },*/
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
            }
        ]
    },/*
    {
        id: 220,
        label: 'MENUITEMS.COMPTABILITE.TEXT',
        icon: 'ph-money-light',
        parentId: 8,
        subItems: [
            {
                id: 221,
                label: 'MENUITEMS.COMPTABILITE.LIST.GENERATIONBANCAIRE',
                link: '/comptabilite/generation-bancaire',
                parentId: 220
            }
        ]
    },
    {
        id: 230,
        label: 'MENUITEMS.MOYENSGENERAUX.TEXT',
        icon: 'ph-cpu-thin',
        parentId: 8,
        subItems: [
            {
                id: 231,
                label: 'MENUITEMS.MOYENSGENERAUX.LIST.IMPORTERENTRTIEN',
                link: '/moyens-generaux/importer-entretien',
                parentId: 230
            },
            {
                id: 232,
                label: 'MENUITEMS.MOYENSGENERAUX.LIST.LISTENTRETIEN',
                link: '/moyens-generaux/liste-entretien',
                parentId: 230
            },
            {
                id: 233,
                label: 'MENUITEMS.MOYENSGENERAUX.LIST.LISTVEHICULE',
                link: '/moyens-generaux/liste-vehicule',
                parentId: 230
            }
        ]
    },
    {
        id: 300,
        label: 'MENUITEMS.GESTIONCOMPTES.TEXT',
        icon: 'ph-ticket',
        parentId: 8,
        subItems: [
            {
                id: '300A1',
                label: 'MENUITEMS.GESTIONCOMPTES.LIST.LISTCOMPTE',
                link: '/plan-comptable/comptecomptable',
                parentId: 300
            },
            {
                id: '300A2',
                label: 'MENUITEMS.GESTIONCOMPTES.LIST.LISTCATEGORIECOMPTE',
                link: '/plan-comptable/categoriecomptable',
                parentId: 300
            },
            {
                id: '300A3',
                label: 'MENUITEMS.GESTIONCOMPTES.LIST.LISTPOSTECOMPTE',
                link: '/plan-comptable/postereporting',
                parentId: 300
            },
            {
                id: '300A4',
                label: 'MENUITEMS.GESTIONCOMPTES.LIST.LISTCLASSECOMPTE',
                link: '/plan-comptable/classecomptable',
                parentId: 300
            }
        ]
    },*/
    /*{
        id: 240,
        label: 'MENUITEMS.RESSOURCESHUMAINES.TEXT',
        icon: 'ph-cpu-thin',
        parentId: 8,
        subItems: [
            {
                id: 241,
                label: 'MENUITEMS.RESSOURCESHUMAINES.LIST.IMPORTERSALAIRE',
                link: '/ressources-humaines/importer-salaire',
                parentId: 240
            },
            {
                id: 242,
                label: 'MENUITEMS.RESSOURCESHUMAINES.LIST.LISTSALAIRE',
                link: '/ressources-humaines/liste-salaire',
                parentId: 240
            }
        ]
    },*/

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
                id: 182,
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
                id: 185,
                label: 'MENUITEMS.PARAMETRES.LIST.TYPEVEHICULE',
                link: '/parametres/type-vehicule',
                roles: ADMINS,
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