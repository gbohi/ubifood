// src/app/core/helpers/roles.ts
//
// Rôles de l'application (groupes Django) et règles d'accès côté web.
// Le backend applique les mêmes règles : ce fichier sert uniquement à
// ne pas afficher de pages / menus inaccessibles à l'utilisateur.

export type Role = 'super_admin' | 'admin' | 'gestionnaire' | 'employe' | 'prestataire' | 'agent_comptoir'
  | 'caissier' | 'comptabilite';

export const ADMINS: Role[] = ['super_admin', 'admin'];

/** Libellés français des rôles (affichés à la place des codes) */
export const LIBELLES_ROLES: Record<string, string> = {
  super_admin:  'Super administrateur',
  admin:        'Administrateur',
  gestionnaire: 'Gestionnaire',
  employe:      'Employé',
  prestataire:    'Prestataire (responsable)',
  agent_comptoir: 'Agent de comptoir',
  caissier:       'Caissier',
  comptabilite:   'Comptabilité',
};
export const GESTIONNAIRES: Role[] = ['super_admin', 'admin', 'gestionnaire'];

/** Page d'accueil d'un utilisateur sans droit de gestion */
export const ACCUEIL_EMPLOYE = '/cantines/accueil';

/**
 * Comptes de l'espace prestataire (responsable et agents de comptoir).
 * Ils sont cloisonnés : seules les pages /prestataire/… leur sont ouvertes
 * (le serveur refuse toute autre route avec un 403).
 */
export const PRESTATAIRES: Role[] = ['prestataire', 'agent_comptoir'];
/** Responsable du prestataire : tout l'espace prestataire */
export const RESPONSABLES_PRESTATAIRE: Role[] = ['prestataire'];

/** Préfixe des adresses de l'espace prestataire */
export const ESPACE_PRESTATAIRE = '/prestataire';
export const ACCUEIL_PRESTATAIRE = '/prestataire/accueil';
export const ACCUEIL_COMPTOIR = '/prestataire/comptoir';

// ── Caisse et compte repas (étape 2) ─────────────────────────────
// Rôles cumulables avec « employe », jamais avec un rôle prestataire (refus du serveur).
// Les administrateurs ont tous les droits de la caisse et de la comptabilité.

/** Encaissements (recharge du compte repas, clôture de sa caisse) */
export const CAISSIERS: Role[] = ['super_admin', 'admin', 'caissier'];
/** Contrôle de la caisse (validation des clôtures, annulation des reçus, remboursement, journaux) */
export const COMPTABLES: Role[] = ['super_admin', 'admin', 'comptabilite'];
/** Écrans de caisse en lecture (contexte, recherche, journal) */
export const ACCES_CAISSE: Role[] = ['super_admin', 'admin', 'caissier', 'comptabilite'];
/** Soldes des comptes repas (lecture) : comptabilité, administrateurs et gestionnaires (leurs agences) */
export const LECTURE_COMPTES: Role[] = ['super_admin', 'admin', 'comptabilite', 'gestionnaire'];

/** Préfixe des adresses de la caisse et de la comptabilité */
export const ESPACE_CAISSE = '/caisse';
export const ACCUEIL_CAISSIER = '/caisse';
export const ACCUEIL_COMPTABILITE = '/caisse/clotures';

/**
 * Compte limité à la caisse : caissier ou comptabilité sans autre rôle
 * (ni employé, ni gestionnaire, ni administrateur). Il ne peut ouvrir que /caisse/…
 * (le reste de l'application n'a pas de sens pour lui, et les écrans de gestion
 * lui sont refusés par le serveur : 403).
 */
export function estCaisseSeule(user: any): boolean {
  return aUnRole(user, ['caissier', 'comptabilite'])
    && !aUnRole(user, [...GESTIONNAIRES, 'employe', ...PRESTATAIRES]);
}

export function estCaissier(user: any): boolean {
  return aUnRole(user, CAISSIERS);
}

export function estComptable(user: any): boolean {
  return aUnRole(user, COMPTABLES);
}

export function estPrestataire(user: any): boolean {
  return aUnRole(user, PRESTATAIRES);
}

/** Agent de comptoir seulement (menu réduit : Comptoir + Liste du jour) */
export function estAgentComptoir(user: any): boolean {
  return aUnRole(user, ['agent_comptoir']) && !aUnRole(user, ['prestataire']);
}

/** Page d'arrivée de l'utilisateur selon son rôle */
export function accueilUtilisateur(user: any): string {
  if (estAgentComptoir(user)) return ACCUEIL_COMPTOIR;
  if (estPrestataire(user)) return ACCUEIL_PRESTATAIRE;
  if (estGestionnaire(user)) return '/';
  // Caissier (même s'il est aussi employé) : l'écran de caisse ; comptabilité : les clôtures à valider
  if (aUnRole(user, ['caissier'])) return ACCUEIL_CAISSIER;
  if (aUnRole(user, ['comptabilite'])) return ACCUEIL_COMPTABILITE;
  return ACCUEIL_EMPLOYE;
}

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
 * correspond pas à l'utilisateur (ou dont `sansRoles` lui correspond), les groupes devenus vides et les
 * titres de section qui n'ont plus d'entrée.
 */
export function filtrerMenu<T extends { roles?: string[]; sansRoles?: string[]; subItems?: any; isTitle?: boolean }>(
  items: T[], user: any,
): T[] {
  const visibles = items
    .filter(item => aUnRole(user, item.roles))
    .filter(item => !item.sansRoles?.length || !aUnRole(user, item.sansRoles))
    .map(item => item.subItems
      ? { ...item, subItems: filtrerMenu(item.subItems, user) }
      : item)
    .filter(item => !item.subItems || item.subItems.length > 0);

  // Supprimer les titres suivis directement d'un autre titre (ou en fin de liste)
  return visibles.filter((item, i) =>
    !item.isTitle || (i + 1 < visibles.length && !visibles[i + 1].isTitle));
}

/**
 * Agences gérées : null pour un administrateur (toutes), sinon les agences
 * de rattachement en cours du gestionnaire (même règle que le serveur).
 */
export function agencesGerees(user: any): number[] | null {
  if (aUnRole(user, ADMINS)) return null;
  const today = new Date().toISOString().slice(0, 10);
  return (user?.user_agences ?? [])
    .filter((l: any) => String(l.date_debut).slice(0, 10) <= today
      && (!l.date_fin || String(l.date_fin).slice(0, 10) >= today))
    .map((l: any) => Number(l.agence_id ?? l.agence));
}

/** Liste d'agences réduite à celles que l'utilisateur gère */
export function filtrerAgencesGerees<T extends { id?: any }>(agences: T[], user: any): T[] {
  const gerees = agencesGerees(user);
  return gerees === null ? agences : agences.filter(a => gerees.includes(Number(a.id)));
}
