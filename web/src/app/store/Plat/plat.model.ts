// src/app/store/Plat/plat.model.ts

/**
 * Image associée à un plat
 */
export interface PlatImage {
  id: number;
  url: string;
  is_principale: boolean;
}

/**
 * Modèle complet d'un plat
 *
 * AVANT : seuls 4 champs déclarés (id, nom, description, type_plat, agence)
 *         → le template plantait en TypeScript sur type_plat_libelle,
 *           agence_nom, images, created_at car non typés.
 *
 * APRÈS : modèle aligné avec ce que l'API retourne réellement.
 */
export interface PlatModel {
  // ── Champs écriture (envoyés à l'API) ──────────────────────
  id?: number;
  nom: string;
  description?: string;
  type_plat: number;   // ID FK
  agence: number;      // ID FK

  // ── Champs lecture retournés par l'API (ReadOnlyField) ─────
  type_plat_id?: number;
  type_plat_libelle?: string;
  agence_id?: number;
  agence_nom?: string;

  // ── Images associées ───────────────────────────────────────
  images?: PlatImage[];

  // ── Audit ──────────────────────────────────────────────────
  created_at?: string;
  updated_at?: string;

  // ── UI uniquement (non envoyé à l'API) ─────────────────────
  state?: boolean;
}

/**
 * Réponse paginée générique de Django REST Framework
 */
export interface ApiResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * Erreur API uniforme
 */
export interface ApiError {
  status: number;
  message: string;
  errors?: { [field: string]: string[] };
}

/**
 * Statistiques globales des besoins
 * @deprecated À déplacer dans src/app/store/Besoin/besoin.model.ts
 */
export interface StatistiqueGlobale {
  par_etat: { etat: string; nombre: number }[];
  par_priorite: { priorite: string; nombre: number }[];
  total_non_cloture: number;
  total_besoin: number;
}

export interface PlatUploadPayload {
  plat: PlatModel;
  fichiers: File[];
}
