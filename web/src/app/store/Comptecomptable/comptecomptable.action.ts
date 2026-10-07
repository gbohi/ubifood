// src/app/store/Comptecomptable/comptecomptable.action.ts

import { createAction, props } from '@ngrx/store';
import { ComptecomptablelistModel, ApiResponse } from './comptecomptable.model';

// ── Fetch paginé ──────────────────────────────────────────────
export const fetchcomptecomptableData = createAction(
  '[Data] Fetch compte comptable Table Data',
  props<{ page?: number }>()
);
export const fetchcomptecomptableSuccess = createAction(
  '[Data] Fetch compte comptable Data Success',
  props<{ response: ApiResponse<ComptecomptablelistModel> }>()
);
export const fetchcomptecomptableFailure = createAction(
  '[Data] Fetch compte comptable Data Failure',
  props<{ error: string }>()
);

// ── Fetch sans pagination ─────────────────────────────────────
export const fetchcomptecomptableNoPaginateData = createAction(
  '[Comptecomptable] Fetch compte comptable No Pagination'
);
export const fetchcomptecomptableNoPaginateSuccess = createAction(
  '[Comptecomptable API] Fetch All compte comptable Success',
  props<{ response: ComptecomptablelistModel[] }>()
);
export const fetchcomptecomptableNoPaginateFailure = createAction(
  '[Comptecomptable] Fetch compte comptable No Pagination Failure',
  props<{ error: string }>()
);

// ── Ajouter ───────────────────────────────────────────────────
export const addcomptecomptableData = createAction(
  '[Data] Add comptecomptableData',
  props<{ newData: ComptecomptablelistModel }>()
);
export const addcomptecomptableDataSuccess = createAction(
  '[Data] Add comptecomptableData Success',
  props<{ newData: ComptecomptablelistModel }>()
);
export const addcomptecomptableDataFailure = createAction(
  '[Data] Add comptecomptableData Failure',
  props<{ error: string }>()
);

// ── Modifier ──────────────────────────────────────────────────
export const updatecomptecomptableData = createAction(
  '[Data] Update comptecomptableData',
  props<{ updatedData: ComptecomptablelistModel }>()
);
export const updatecomptecomptableDataSuccess = createAction(
  '[Data] Update comptecomptableData Success',
  props<{ updatedData: ComptecomptablelistModel }>()
);
export const updatecomptecomptableDataFailure = createAction(
  '[Data] Update comptecomptableData Failure',
  props<{ error: string }>()
);

// ── Supprimer (unitaire) ──────────────────────────────────────
export const deletecomptecomptableData = createAction(
  '[Data] Delete comptecomptableData',
  props<{ id: string }>()
);
export const deletecomptecomptableSuccess = createAction(
  '[Data] Delete comptecomptableData Success',
  props<{ id: string }>()
);
export const deletecomptecomptableFailure = createAction(
  '[Data] Delete comptecomptableData Failure',
  props<{ error: string }>()
);

// ── Supprimer (multiple) ──────────────────────────────────────
export const deletemultiplecomptecomptableData = createAction(
  '[Data] Delete Multiple comptecomptableData',
  props<{ id: string }>()
);
export const deletemultiplecomptecomptableSuccess = createAction(
  '[Data] Delete Multiple comptecomptableData Success',
  props<{ id: string }>()
);
export const deletemultiplecomptecomptableFailure = createAction(
  '[Data] Delete Multiple comptecomptableData Failure',
  props<{ error: string }>()
);
