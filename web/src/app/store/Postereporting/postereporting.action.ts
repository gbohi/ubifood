// src/app/store/Postereporting/postereporting.action.ts

import { createAction, props } from '@ngrx/store';
import { PostereportinglistModel, ApiResponse } from './postereporting.model';

// ── Fetch paginé ──────────────────────────────────────────────
export const fetchpostereportingData = createAction(
  '[Data] Fetch poste reporting Table Data',
  props<{ page?: number }>()
);
export const fetchpostereportingSuccess = createAction(
  '[Data] Fetch poste reporting Data Success',
  props<{ response: ApiResponse<PostereportinglistModel> }>()
);
export const fetchpostereportingFailure = createAction(
  '[Data] Fetch poste reporting Data Failure',
  props<{ error: string }>()
);

// ── Fetch sans pagination ─────────────────────────────────────
export const fetchpostereportingNoPaginateData = createAction(
  '[Postereporting] Fetch poste reporting No Pagination'
);
export const fetchpostereportingNoPaginateSuccess = createAction(
  '[Postereporting API] Fetch All poste reporting Success',
  props<{ response: PostereportinglistModel[] }>()
);
export const fetchpostereportingNoPaginateFailure = createAction(
  '[Postereporting] Fetch poste reporting No Pagination Failure',
  props<{ error: string }>()
);

// ── Ajouter ───────────────────────────────────────────────────
export const addpostereportingData = createAction(
  '[Data] Add postereportingData',
  props<{ newData: PostereportinglistModel }>()
);
export const addpostereportingDataSuccess = createAction(
  '[Data] Add postereportingData Success',
  props<{ newData: PostereportinglistModel }>()
);
export const addpostereportingDataFailure = createAction(
  '[Data] Add postereportingData Failure',
  props<{ error: string }>()
);

// ── Modifier ──────────────────────────────────────────────────
export const updatepostereportingData = createAction(
  '[Data] Update postereportingData',
  props<{ updatedData: PostereportinglistModel }>()
);
export const updatepostereportingDataSuccess = createAction(
  '[Data] Update postereportingData Success',
  props<{ updatedData: PostereportinglistModel }>()
);
export const updatepostereportingDataFailure = createAction(
  '[Data] Update postereportingData Failure',
  props<{ error: string }>()
);

// ── Supprimer (unitaire) ──────────────────────────────────────
export const deletepostereportingData = createAction(
  '[Data] Delete postereportingData',
  props<{ id: string }>()
);
export const deletepostereportingSuccess = createAction(
  '[Data] Delete postereportingData Success',
  props<{ id: string }>()
);
export const deletepostereportingFailure = createAction(
  '[Data] Delete postereportingData Failure',
  props<{ error: string }>()
);

// ── Supprimer (multiple) ──────────────────────────────────────
export const deletemultiplepostereportingData = createAction(
  '[Data] Delete Multiple postereportingData',
  props<{ id: string }>()
);
export const deletemultiplepostereportingSuccess = createAction(
  '[Data] Delete Multiple postereportingData Success',
  props<{ id: string }>()
);
export const deletemultiplepostereportingFailure = createAction(
  '[Data] Delete Multiple postereportingData Failure',
  props<{ error: string }>()
);
