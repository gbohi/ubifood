// src/app/store/Typeequipe/typeequipe.action.ts

import { createAction, props } from '@ngrx/store';
import { TypeequipelistModel, ApiResponse } from './typeequipe.model';

// ── Fetch paginé ──────────────────────────────────────────────
export const fetchtypeequipeData = createAction(
  '[Data] Fetch typeequipe Table Data',
  props<{ page?: number }>()
);
export const fetchtypeequipeSuccess = createAction(
  '[Data] Fetch typeequipe Data Success',
  props<{ response: ApiResponse<TypeequipelistModel> }>()
);
export const fetchtypeequipeFailure = createAction(
  '[Data] Fetch typeequipe Data Failure',
  props<{ error: string }>()
);

// ── Fetch sans pagination ─────────────────────────────────────
export const fetchtypeequipeNoPaginateData = createAction(
  '[Typeequipe] Fetch typeequipe No Pagination'
);
export const fetchtypeequipeNoPaginateSuccess = createAction(
  '[Typeequipe API] Fetch All Typeequipe Success',
  props<{ response: TypeequipelistModel[] }>()
);
export const fetchtypeequipeNoPaginateFailure = createAction(
  '[Typeequipe] Fetch Typeequipe No Pagination Failure',
  props<{ error: string }>()
);

// ── Ajouter ───────────────────────────────────────────────────
export const addtypeequipeData = createAction(
  '[Data] Add typeequipeData',
  props<{ newData: TypeequipelistModel }>()
);
export const addtypeequipeDataSuccess = createAction(
  '[Data] Add typeequipeData Success',
  props<{ newData: TypeequipelistModel }>()
);
export const addtypeequipeDataFailure = createAction(
  '[Data] Add typeequipeData Failure',
  props<{ error: string }>()
);

// ── Modifier ──────────────────────────────────────────────────
export const updatetypeequipeData = createAction(
  '[Data] Update typeequipeData',
  props<{ updatedData: TypeequipelistModel }>()
);
export const updatetypeequipeDataSuccess = createAction(
  '[Data] Update typeequipeData Success',
  props<{ updatedData: TypeequipelistModel }>()
);
export const updatetypeequipeDataFailure = createAction(
  '[Data] Update typeequipeData Failure',
  props<{ error: string }>()
);

// ── Supprimer (unitaire) ──────────────────────────────────────
export const deletetypeequipeData = createAction(
  '[Data] Delete typeequipeData',
  props<{ id: string }>()
);
export const deletetypeequipeSuccess = createAction(
  '[Data] Delete typeequipeData Success',
  props<{ id: string }>()
);
export const deletetypeequipeFailure = createAction(
  '[Data] Delete typeequipeData Failure',
  props<{ error: string }>()
);

// ── Supprimer (multiple) ──────────────────────────────────────
export const deletemultipletypeequipeData = createAction(
  '[Data] Delete Multiple typeequipeData',
  props<{ id: string }>()
);
export const deletemultipletypeequipeSuccess = createAction(
  '[Data] Delete Multiple typeequipeData Success',
  props<{ id: string }>()
);
export const deletemultipletypeequipeFailure = createAction(
  '[Data] Delete Multiple typeequipeData Failure',
  props<{ error: string }>()
);
