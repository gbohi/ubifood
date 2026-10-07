// src/app/store/Typebesoin/typebesoin.action.ts

import { createAction, props } from '@ngrx/store';
import { TypebesoinlistModel, ApiResponse } from './typebesoin.model';

// ── Fetch paginé ──────────────────────────────────────────────
export const fetchtypebesoinData = createAction(
  '[Data] Fetch typebesoin Table Data',
  props<{ page?: number }>()
);
export const fetchtypebesoinSuccess = createAction(
  '[Data] Fetch typebesoin Data Success',
  props<{ response: ApiResponse<TypebesoinlistModel> }>()
);
export const fetchtypebesoinFailure = createAction(
  '[Data] Fetch typebesoin Data Failure',
  props<{ error: string }>()
);

// ── Fetch sans pagination ─────────────────────────────────────
export const fetchtypebesoinNoPaginateData = createAction(
  '[Typebesoin] Fetch Typebesoin No Pagination'
);
export const fetchtypebesoinNoPaginateSuccess = createAction(
  '[Typebesoin API] Fetch All Typebesoin Success',
  props<{ response: TypebesoinlistModel[] }>()
);
export const fetchtypebesoinNoPaginateFailure = createAction(
  '[Typebesoin] Fetch Typebesoin No Pagination Failure',
  props<{ error: string }>()
);

// ── Ajouter ───────────────────────────────────────────────────
export const addtypebesoinData = createAction(
  '[Data] Add typebesoinData',
  props<{ newData: TypebesoinlistModel }>()
);
export const addtypebesoinDataSuccess = createAction(
  '[Data] Add typebesoinData Success',
  props<{ newData: TypebesoinlistModel }>()
);
export const addtypebesoinDataFailure = createAction(
  '[Data] Add typebesoinData Failure',
  props<{ error: string }>()
);

// ── Modifier ──────────────────────────────────────────────────
export const updatetypebesoinData = createAction(
  '[Data] Update typebesoinData',
  props<{ updatedData: TypebesoinlistModel }>()
);
export const updatetypebesoinDataSuccess = createAction(
  '[Data] Update typebesoinData Success',
  props<{ updatedData: TypebesoinlistModel }>()
);
export const updatetypebesoinDataFailure = createAction(
  '[Data] Update typebesoinData Failure',
  props<{ error: string }>()
);

// ── Supprimer (unitaire) ──────────────────────────────────────
export const deletetypebesoinData = createAction(
  '[Data] Delete typebesoinData',
  props<{ id: string }>()
);
export const deletetypebesoinSuccess = createAction(
  '[Data] Delete typebesoinData Success',
  props<{ id: string }>()
);
export const deletetypebesoinFailure = createAction(
  '[Data] Delete typebesoinData Failure',
  props<{ error: string }>()
);

// ── Supprimer (multiple) ──────────────────────────────────────
export const deletemultipletypebesoinData = createAction(
  '[Data] Delete Multiple typebesoinData',
  props<{ id: string }>()
);
export const deletemultipletypebesoinSuccess = createAction(
  '[Data] Delete Multiple typebesoinData Success',
  props<{ id: string }>()
);
export const deletemultipletypebesoinFailure = createAction(
  '[Data] Delete Multiple typebesoinData Failure',
  props<{ error: string }>()
);
