export interface MenuItem {
    id?: number;
    label?: any;
    icon?: string;
    link?: string;
    subItems?: any;
    isTitle?: boolean;
    badge?: any;
    parentId?: number;
    isLayout?: boolean;
    isOpen?: boolean;
    /** Rôles autorisés à voir l'entrée (aucun = tout utilisateur connecté) */
    roles?: string[];
}