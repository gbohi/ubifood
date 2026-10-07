// src/app/store/Classecomptable/classecomptable.action.ts

import { createAction, props } from '@ngrx/store';
import { ClassecomptablelistModel, ApiResponse } from './classecomptable.model';

// ── Fetch paginé ──────────────────────────────────────────────
export const fetchclassecomptableData = createAction(
  '[Data] Fetch classe comptable Table Data',
  props<{ page?: number }>()
);
export const fetchclassecomptableSuccess = createAction(
  '[Data] Fetch classe comptable Data Success',
  props<{ response: ApiResponse<ClassecomptablelistModel> }>()
);
export const fetchclassecomptableFailure = createAction(
  '[Data] Fetch classe comptable Data Failure',
  props<{ error: string }>()
);

// ── Fetch sans pagination ─────────────────────────────────────
export const fetchclassecomptableNoPaginateData = createAction(
  '[Classecomptable] Fetch classe comptable No Pagination'
);
export const fetchclassecomptableNoPaginateSuccess = createAction(
  '[Classecomptable API] Fetch All classe comptable Success',
  props<{ response: ClassecomptablelistModel[] }>()
);
export const fetchclassecomptableNoPaginateFailure = createAction(
  '[Classecomptable] Fetch classe comptable No Pagination Failure',
  props<{ error: string }>()
);

// ── Ajouter ───────────────────────────────────────────────────
export const addclassecomptableData = createAction(
  '[Data] Add classecomptableData',
  props<{ newData: ClassecomptablelistModel }>()
);
export const addclassecomptableDataSuccess = createAction(
  '[Data] Add classecomptableData Success',
  props<{ newData: ClassecomptablelistModel }>()
);
export const addclassecomptableDataFailure = createAction(
  '[Data] Add classecomptableData Failure',
  props<{ error: string }>()
);

// ── Modifier ──────────────────────────────────────────────────
export const updateclassecomptableData = createAction(
  '[Data] Update classecomptableData',
  props<{ updatedData: ClassecomptablelistModel }>()
);
export const updateclassecomptableDataSuccess = createAction(
  '[Data] Update classecomptableData Success',
  props<{ updatedData: ClassecomptablelistModel }>()
);
export const updateclassecomptableDataFailure = createAction(
  '[Data] Update classecomptableData Failure',
  props<{ error: string }>()
);

// ── Supprimer (unitaire) ──────────────────────────────────────
export const deleteclassecomptableData = createAction(
  '[Data] Delete classecomptableData',
  props<{ id: string }>()
);
export const deleteclassecomptableSuccess = createAction(
  '[Data] Delete classecomptableData Success',
  props<{ id: string }>()
);
export const deleteclassecomptableFailure = createAction(
  '[Data] Delete classecomptableData Failure',
  props<{ error: string }>()
);

// ── Supprimer (multiple) ──────────────────────────────────────
export const deletemultipleclassecomptableData = createAction(
  '[Data] Delete Multiple classecomptableData',
  props<{ id: string }>()
);
export const deletemultipleclassecomptableSuccess = createAction(
  '[Data] Delete Multiple classecomptableData Success',
  props<{ id: string }>()
);
export const deletemultipleclassecomptableFailure = createAction(
  '[Data] Delete Multiple classecomptableData Failure',
  props<{ error: string }>()
);
