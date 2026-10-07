// src/app/store/Priorite/priorite.action.ts

import { createAction, props } from '@ngrx/store';
import { PrioritelistModel, ApiResponse } from './priorite.model';

// ── Fetch paginé ──────────────────────────────────────────────
export const fetchprioriteData = createAction(
  '[Data] Fetch priorite Table Data',
  props<{ page?: number }>()
);
export const fetchprioriteSuccess = createAction(
  '[Data] Fetch priorite Data Success',
  props<{ response: ApiResponse<PrioritelistModel> }>()
);
export const fetchprioriteFailure = createAction(
  '[Data] Fetch priorite Data Failure',
  props<{ error: string }>()
);

// ── Fetch sans pagination ─────────────────────────────────────
export const fetchprioriteNoPaginateData = createAction(
  '[Priorite] Fetch Priorite No Pagination'
);
export const fetchprioriteNoPaginateSuccess = createAction(
  '[Priorite API] Fetch All Priorites Success',
  props<{ response: PrioritelistModel[] }>()
);
export const fetchprioriteNoPaginateFailure = createAction(
  '[Priorite] Fetch Priorite No Pagination Failure',
  props<{ error: string }>()
);

// ── Ajouter ───────────────────────────────────────────────────
export const addprioriteData = createAction(
  '[Data] Add prioriteData',
  props<{ newData: PrioritelistModel }>()
);
export const addprioriteDataSuccess = createAction(
  '[Data] Add prioriteData Success',
  props<{ newData: PrioritelistModel }>()
);
export const addprioriteDataFailure = createAction(
  '[Data] Add prioriteData Failure',
  props<{ error: string }>()
);

// ── Modifier ──────────────────────────────────────────────────
export const updateprioriteData = createAction(
  '[Data] Update prioriteData',
  props<{ updatedData: PrioritelistModel }>()
);
export const updateprioriteDataSuccess = createAction(
  '[Data] Update prioriteData Success',
  props<{ updatedData: PrioritelistModel }>()
);
export const updateprioriteDataFailure = createAction(
  '[Data] Update prioriteData Failure',
  props<{ error: string }>()
);

// ── Supprimer (unitaire) ──────────────────────────────────────
export const deleteprioriteData = createAction(
  '[Data] Delete prioriteData',
  props<{ id: string }>()
);
export const deleteprioriteSuccess = createAction(
  '[Data] Delete prioriteData Success',
  props<{ id: string }>()
);
export const deleteprioriteFailure = createAction(
  '[Data] Delete prioriteData Failure',
  props<{ error: string }>()
);

// ── Supprimer (multiple) ──────────────────────────────────────
export const deletemultipleprioriteData = createAction(
  '[Data] Delete Multiple prioriteData',
  props<{ id: string }>()
);
export const deletemultipleprioriteSuccess = createAction(
  '[Data] Delete Multiple prioriteData Success',
  props<{ id: string }>()
);
export const deletemultipleprioriteFailure = createAction(
  '[Data] Delete Multiple prioriteData Failure',
  props<{ error: string }>()
);
