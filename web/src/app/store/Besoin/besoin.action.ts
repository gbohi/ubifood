// src/app/store/Besoin/besoin.action.ts

import { createAction, props } from '@ngrx/store';
import { BesoinlistModel, ApiResponse, StatistiqueGlobale } from './besoin.model';

// ── Fetch paginé ──────────────────────────────────────────────
export const fetchbesoinData = createAction(
  '[Data] Fetch besoin Table Data',
  props<{ page?: number; search?: string }>()
);
export const fetchbesoinSuccess = createAction(
  '[Data] Fetch besoin Data Success',
  props<{ response: ApiResponse<BesoinlistModel> }>()
);
export const fetchbesoinFailure = createAction(
  '[Data] Fetch besoin Data Failure',
  props<{ error: string }>()
);

// ── Statistiques globales ─────────────────────────────────────
export const fetchstatistiquebesoinData = createAction(
  '[Data] Fetch statistique besoin Data'
);
export const fetchstatistiquebesoinSuccess = createAction(
  '[Data] Fetch statistique besoin Data Success',
  props<{ response: StatistiqueGlobale }>()
);
export const fetchstatistiquebesoinFailure = createAction(
  '[Data] Fetch statistique besoin Data Failure',
  props<{ error: string }>()
);

// ── Ajouter (authentifié) ─────────────────────────────────────
// FormData (champs + pièces jointes documents[]) → POST /api/besoins/creer/
// Objet simple → POST /api/api/besoins/
export const addbesoinData = createAction(
  '[Data] Add besoinData',
  props<{ newData: BesoinlistModel | FormData }>()
);
export const addbesoinDataSuccess = createAction(
  '[Data] Add besoinData Success',
  props<{ newData: any }>()
);
export const addbesoinDataFailure = createAction(
  '[Data] Add besoinData Failure',
  props<{ error: string }>()
);


// ── Modifier ──────────────────────────────────────────────────
export const updatebesoinData = createAction(
  '[Data] Update besoinData',
  props<{ updatedData: BesoinlistModel }>()
);
export const updatebesoinDataSuccess = createAction(
  '[Data] Update besoinData Success',
  props<{ updatedData: BesoinlistModel }>()
);
export const updatebesoinDataFailure = createAction(
  '[Data] Update besoinData Failure',
  props<{ error: string }>()
);

// ── Supprimer (unitaire) ──────────────────────────────────────
export const deletebesoinData = createAction(
  '[Data] Delete besoinData',
  props<{ id: string }>()
);
export const deletebesoinSuccess = createAction(
  '[Data] Delete besoinData Success',
  props<{ id: string }>()
);
export const deletebesoinFailure = createAction(
  '[Data] Delete besoinData Failure',
  props<{ error: string }>()
);

// ── Supprimer (multiple) ──────────────────────────────────────
export const deletemultiplebesoinData = createAction(
  '[Data] Delete Multiple besoinData',
  props<{ id: string }>()
);
export const deletemultiplebesoinSuccess = createAction(
  '[Data] Delete Multiple besoinData Success',
  props<{ id: string }>()
);
export const deletemultiplebesoinFailure = createAction(
  '[Data] Delete Multiple besoinData Failure',
  props<{ error: string }>()
);
