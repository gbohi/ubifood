// src/app/store/Typeplat/typeplat.action.ts

import { createAction, props } from '@ngrx/store';
import { TypeplatlistModel, ApiResponse } from './typeplat.model';

// ── Fetch paginé ──────────────────────────────────────────────
export const fetchtypeplatData = createAction(
  '[Data] Fetch typeplat Table Data',
  props<{ page?: number }>()
);
export const fetchtypeplatSuccess = createAction(
  '[Data] Fetch typeplat Data Success',
  props<{ response: ApiResponse<TypeplatlistModel> }>()
);
export const fetchtypeplatFailure = createAction(
  '[Data] Fetch typeplat Data Failure',
  props<{ error: string }>()
);

// ── Fetch sans pagination ─────────────────────────────────────
export const fetchtypeplatNoPaginateData = createAction(
  '[Typeplat] Fetch typeplat No Pagination'
);
export const fetchtypeplatNoPaginateSuccess = createAction(
  '[Typeplat API] Fetch All Typeplat Success',
  props<{ response: TypeplatlistModel[] }>()
);
export const fetchtypeplatNoPaginateFailure = createAction(
  '[Typeplat] Fetch Typeplat No Pagination Failure',
  props<{ error: string }>()
);

// ── Ajouter ───────────────────────────────────────────────────
export const addtypeplatData = createAction(
  '[Data] Add typeplatData',
  props<{ newData: TypeplatlistModel }>()
);
export const addtypeplatDataSuccess = createAction(
  '[Data] Add typeplatData Success',
  props<{ newData: TypeplatlistModel }>()
);
export const addtypeplatDataFailure = createAction(
  '[Data] Add typeplatData Failure',
  props<{ error: string }>()
);

// ── Modifier ──────────────────────────────────────────────────
export const updatetypeplatData = createAction(
  '[Data] Update typeplatData',
  props<{ updatedData: TypeplatlistModel }>()
);
export const updatetypeplatDataSuccess = createAction(
  '[Data] Update typeplatData Success',
  props<{ updatedData: TypeplatlistModel }>()
);
export const updatetypeplatDataFailure = createAction(
  '[Data] Update typeplatData Failure',
  props<{ error: string }>()
);

// ── Supprimer (unitaire) ──────────────────────────────────────
export const deletetypeplatData = createAction(
  '[Data] Delete typeplatData',
  props<{ id: string }>()
);
export const deletetypeplatSuccess = createAction(
  '[Data] Delete typeplatData Success',
  props<{ id: string }>()
);
export const deletetypeplatFailure = createAction(
  '[Data] Delete typeplatData Failure',
  props<{ error: string }>()
);

// ── Supprimer (multiple) ──────────────────────────────────────
export const deletemultipletypeplatData = createAction(
  '[Data] Delete Multiple typeplatData',
  props<{ id: string }>()
);
export const deletemultipletypeplatSuccess = createAction(
  '[Data] Delete Multiple typeplatData Success',
  props<{ id: string }>()
);
export const deletemultipletypeplatFailure = createAction(
  '[Data] Delete Multiple typeplatData Failure',
  props<{ error: string }>()
);
