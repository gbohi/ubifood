// src/app/store/Plat/plat.action.ts
import { createAction, props } from '@ngrx/store';
import { PlatModel, ApiResponse, StatistiqueGlobale } from './plat.model';

// ─────────────────────────────────────────────────────────────
// FETCH — liste paginée
// ─────────────────────────────────────────────────────────────

export const fetchplatData = createAction(
  '[Plat] Fetch List',
  props<{ page?: number }>()
);
export const fetchplatSuccess = createAction(
  '[Plat] Fetch List Success',
  props<{ response: ApiResponse<PlatModel> }>()
);
export const fetchplatFailure = createAction(
  '[Plat] Fetch List Failure',
  props<{ error: string }>()
);

// ─────────────────────────────────────────────────────────────
// STATISTIQUES
// ─────────────────────────────────────────────────────────────

export const fetchstatistiqueplatData = createAction(
  '[Plat] Fetch Statistiques'
);
export const fetchstatistiqueplatSuccess = createAction(
  '[Plat] Fetch Statistiques Success',
  props<{ response: StatistiqueGlobale }>()
);
export const fetchstatistiqueplatFailure = createAction(
  '[Plat] Fetch Statistiques Failure',
  props<{ error: string }>()
);

// ─────────────────────────────────────────────────────────────
// CRÉATION avec fichiers (FormData)
// ─────────────────────────────────────────────────────────────

export const createPlatWithFiles = createAction(
  '[Plat] Create With Files',
  props<{ newData: FormData }>()
);
export const createPlatWithFilesSuccess = createAction(
  '[Plat] Create With Files Success',
  props<{ plat: PlatModel }>()
);
export const createPlatWithFilesFailure = createAction(
  '[Plat] Create With Files Failure',
  props<{ error: string }>()
);

// ─────────────────────────────────────────────────────────────
// MISE À JOUR avec fichiers (FormData)
// ─────────────────────────────────────────────────────────────

export const updatePlatWithFiles = createAction(
  '[Plat] Update With Files',
  props<{ id: number; updatedData: FormData }>()
);
export const updatePlatWithFilesSuccess = createAction(
  '[Plat] Update With Files Success',
  props<{ updatedPlat: PlatModel }>()
);
export const updatePlatWithFilesFailure = createAction(
  '[Plat] Update With Files Failure',
  props<{ error: string }>()
);

// ─────────────────────────────────────────────────────────────
// SUPPRESSION simple
// ─────────────────────────────────────────────────────────────

export const deleteplatData = createAction(
  '[Plat] Delete',
  props<{ id: string }>()
);
export const deleteplatSuccess = createAction(
  '[Plat] Delete Success',
  props<{ id: string }>()
);
export const deleteplatFailure = createAction(
  '[Plat] Delete Failure',
  props<{ error: string }>()
);

// ─────────────────────────────────────────────────────────────
// SUPPRESSION multiple (bulk)
// ─────────────────────────────────────────────────────────────

export const deletemultipleplatData = createAction(
  '[Plat] Delete Multiple',
  props<{ id: string }>()
);
export const deletemultipleplatSuccess = createAction(
  '[Plat] Delete Multiple Success',
  props<{ id: string }>()
);
export const deletemultipleplatFailure = createAction(
  '[Plat] Delete Multiple Failure',
  props<{ error: string }>()
);
