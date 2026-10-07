// src/app/store/Menu/menu.model.ts

/**
 * Plat simplifié tel que retourné dans menu_plats
 */
export interface PlatResume {
  id: number;
  nom: string;
  description?: string;
  type_plat_libelle?: string;
  agence_nom?: string;
  images?: { id: number; url: string; is_principale: boolean }[];
}

/**
 * Ligne MenuPlat telle que retournée par l'API (lecture)
 */
export interface MenuPlatItem {
  id: number;
  menu: number;
  plat: PlatResume;  // serializer imbriqué côté Django
}

/**
 * Modèle complet d'un Menu
 *
 * AVANT : seulement id, date_menu, agence
 *         → typeequipe manquant, menu_plats manquant,
 *           agence_detail inexistant (champ correct = agence_nom)
 *
 * APRÈS : aligné avec ce que l'API retourne réellement.
 */
export interface MenulistModel {
  // ── Champs écriture (envoyés à l'API) ──────────────────────
  id?: number;
  date_menu: string;          // format YYYY-MM-DD
  agence: number;             // ID FK
  typeequipe: number;         // ID FK — NOUVEAU

  // ── Champs lecture retournés par l'API (ReadOnlyField) ─────
  agence_id?: number;
  agence_nom?: string;        // remplace agence_detail.nom_agence
  typeequipe_id?: number;
  typeequipe_libelle?: string; // NOUVEAU

  // ── Plats du menu ───────────────────────────────────────────
  menu_plats?: MenuPlatItem[];

  // ── Audit ──────────────────────────────────────────────────
  created_at?: string;
  updated_at?: string;

  // ── UI uniquement ──────────────────────────────────────────
  state?: boolean;
}

/**
 * Payload pour créer/modifier un menu avec ses plats
 * (envoyé séparément : le menu d'abord, puis les MenuPlat)
 */
export interface MenuCreatePayload {
  date_menu: string;
  agence: number;
  typeequipe: number;
  plat_ids: number[];  // IDs des plats à associer
}

export interface ApiResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ApiError {
  status: number;
  message: string;
  errors?: { [field: string]: string[] };
}
