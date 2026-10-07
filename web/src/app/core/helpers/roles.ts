// src/app/core/helpers/roles.ts
//
// Rôles de l'application (groupes Django) et règles d'accès côté web.
// Le backend applique les mêmes règles : ce fichier sert uniquement à
// ne pas afficher de pages / menus inaccessibles à l'utilisateur.

export type Role = 'super_admin' | 'admin' | 'gestionnaire' | 'employe';

export const ADMINS: Role[] = ['super_admin', 'admin'];
export const GESTIONNAIRES: Role[] = ['super_admin', 'admin', 'gestionnaire'];

/** Page d'accueil d'un utilisateur sans droit de gestion */
export const ACCUEIL_EMPLOYE = '/cantines/mes-commandes';

/** Rôles de l'utilisateur stocké après connexion (réponse de /users/me/) */
export function rolesUtilisateur(user: any): string[] {
  if (!user) return [];
  const roles: string[] = Array.isArray(user.roles) ? [...user.roles] : [];
  if (user.is_superuser && !roles.includes('super_admin')) roles.push('super_admin');
  return roles;
}

export function aUnRole(user: any, autorises?: string[] | null): boolean {
  if (!autorises || autorises.length === 0) return true;
  const roles = rolesUtilisateur(user);
  return autorises.some(r => roles.includes(r));
}

export function estGestionnaire(user: any): boolean {
  return aUnRole(user, GESTIONNAIRES);
}

/**
 * Filtre récursivement un menu : retire les entrées dont `roles` ne
 * correspond pas à l'utilisateur, les groupes devenus vides et les
 * titres de section qui n'ont plus d'entrée.
 */
export function filtrerMenu<T extends { roles?: string[]; subItems?: any; isTitle?: boolean }>(
  items: T[], user: any,
): T[] {
  const visibles = items
    .filter(item => aUnRole(user, item.roles))
    .map(item => item.subItems
      ? { ...item, subItems: filtrerMenu(item.subItems, user) }
      : item)
    .filter(item => !item.subItems || item.subItems.length > 0);

  // Supprimer les titres suivis directement d'un autre titre (ou en fin de liste)
  return visibles.filter((item, i) =>
    !item.isTitle || (i + 1 < visibles.length && !visibles[i + 1].isTitle));
}
