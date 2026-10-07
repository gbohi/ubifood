// src/app/store/Categoriecomptable/categoriecomptable.action.ts

import { createAction, props } from '@ngrx/store';
import { CategoriecomptablelistModel, ApiResponse } from './categoriecomptable.model';

// ── Fetch paginé ──────────────────────────────────────────────
export const fetchcategoriecomptableData = createAction(
  '[Data] Fetch categoriecomptable Table Data',
  props<{ page?: number }>()
);
export const fetchcategoriecomptableSuccess = createAction(
  '[Data] Fetch categoriecomptable Data Success',
  props<{ response: ApiResponse<CategoriecomptablelistModel> }>()
);
export const fetchcategoriecomptableFailure = createAction(
  '[Data] Fetch categoriecomptable Data Failure',
  props<{ error: string }>()
);

// ── Fetch sans pagination ─────────────────────────────────────
export const fetchcategoriecomptableNoPaginateData = createAction(
  '[Categoriecomptable] Fetch Categoriecomptable No Pagination'
);
export const fetchcategoriecomptableNoPaginateSuccess = createAction(
  '[Categoriecomptable API] Fetch All Categoriecomptable Success',
  props<{ response: CategoriecomptablelistModel[] }>()
);
export const fetchcategoriecomptableNoPaginateFailure = createAction(
  '[Categoriecomptable] Fetch Categoriecomptable No Pagination Failure',
  props<{ error: string }>()
);

// ── Ajouter ───────────────────────────────────────────────────
export const addcategoriecomptableData = createAction(
  '[Data] Add categoriecomptableData',
  props<{ newData: CategoriecomptablelistModel }>()
);
export const addcategoriecomptableDataSuccess = createAction(
  '[Data] Add categoriecomptableData Success',
  props<{ newData: CategoriecomptablelistModel }>()
);
export const addcategoriecomptableDataFailure = createAction(
  '[Data] Add categoriecomptableData Failure',
  props<{ error: string }>()
);

// ── Modifier ──────────────────────────────────────────────────
export const updatecategoriecomptableData = createAction(
  '[Data] Update categoriecomptableData',
  props<{ updatedData: CategoriecomptablelistModel }>()
);
export const updatecategoriecomptableDataSuccess = createAction(
  '[Data] Update categoriecomptableData Success',
  props<{ updatedData: CategoriecomptablelistModel }>()
);
export const updatecategoriecomptableDataFailure = createAction(
  '[Data] Update categoriecomptableData Failure',
  props<{ error: string }>()
);

// ── Supprimer (unitaire) ──────────────────────────────────────
export const deletecategoriecomptableData = createAction(
  '[Data] Delete categoriecomptableData',
  props<{ id: string }>()
);
export const deletecategoriecomptableSuccess = createAction(
  '[Data] Delete categoriecomptableData Success',
  props<{ id: string }>()
);
export const deletecategoriecomptableFailure = createAction(
  '[Data] Delete categoriecomptableData Failure',
  props<{ error: string }>()
);

// ── Supprimer (multiple) ──────────────────────────────────────
export const deletemultiplecategoriecomptableData = createAction(
  '[Data] Delete Multiple categoriecomptableData',
  props<{ id: string }>()
);
export const deletemultiplecategoriecomptableSuccess = createAction(
  '[Data] Delete Multiple categoriecomptableData Success',
  props<{ id: string }>()
);
export const deletemultiplecategoriecomptableFailure = createAction(
  '[Data] Delete Multiple categoriecomptableData Failure',
  props<{ error: string }>()
);
