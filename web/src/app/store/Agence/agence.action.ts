// src/app/store/Agence/agence.action.ts

import { createAction, props } from '@ngrx/store';
import { AgencelistModel, ApiResponse } from './agence.model';

// ── Fetch paginé ──────────────────────────────────────────────
export const fetchagenceData = createAction(
  '[Data] Fetch agence Table Data',
  props<{ page?: number }>()
);
export const fetchagenceSuccess = createAction(
  '[Data] Fetch agence Data Success',
  props<{ response: ApiResponse<AgencelistModel> }>()
);
export const fetchagenceFailure = createAction(
  '[Data] Fetch agence Data Failure',
  props<{ error: string }>()
);

// ── Fetch sans pagination ─────────────────────────────────────
export const fetchagenceNoPaginateData = createAction(
  '[Agence] Fetch Agence No Pagination'
);
export const fetchagenceNoPaginateSuccess = createAction(
  '[Agence API] Fetch All Agence Success',
  props<{ response: AgencelistModel[] }>()
);
export const fetchagenceNoPaginateFailure = createAction(
  '[Agence] Fetch Agence No Pagination Failure',
  props<{ error: string }>()
);

// ── Ajouter ───────────────────────────────────────────────────
export const addagenceData = createAction(
  '[Data] Add agenceData',
  props<{ newData: AgencelistModel }>()
);
export const addagenceDataSuccess = createAction(
  '[Data] Add agenceData Success',
  props<{ newData: AgencelistModel }>()
);
export const addagenceDataFailure = createAction(
  '[Data] Add agenceData Failure',
  props<{ error: string }>()
);

// ── Modifier ──────────────────────────────────────────────────
export const updateagenceData = createAction(
  '[Data] Update agenceData',
  props<{ updatedData: AgencelistModel }>()
);
export const updateagenceDataSuccess = createAction(
  '[Data] Update agenceData Success',
  props<{ updatedData: AgencelistModel }>()
);
export const updateagenceDataFailure = createAction(
  '[Data] Update agenceData Failure',
  props<{ error: string }>()
);

// ── Supprimer (unitaire) ──────────────────────────────────────
export const deleteagenceData = createAction(
  '[Data] Delete agenceData',
  props<{ id: string }>()
);
export const deleteagenceSuccess = createAction(
  '[Data] Delete agenceData Success',
  props<{ id: string }>()
);
export const deleteagenceFailure = createAction(
  '[Data] Delete agenceData Failure',
  props<{ error: string }>()
);

// ── Supprimer (multiple) ──────────────────────────────────────
export const deletemultipleagenceData = createAction(
  '[Data] Delete Multiple agenceData',
  props<{ id: string }>()
);
export const deletemultipleagenceSuccess = createAction(
  '[Data] Delete Multiple agenceData Success',
  props<{ id: string }>()
);
export const deletemultipleagenceFailure = createAction(
  '[Data] Delete Multiple agenceData Failure',
  props<{ error: string }>()
);
