// src/app/store/Poste/poste.action.ts

import { createAction, props } from '@ngrx/store';
import { PosteModel, ApiResponse } from './poste.model';

// ── Fetch paginé ──────────────────────────────────────────────
export const fetchposteData = createAction(
  '[Poste] Fetch Data',
  props<{ page?: number }>()
);
export const fetchposteSuccess = createAction(
  '[Poste] Fetch Data Success',
  props<{ response: ApiResponse<PosteModel> }>()
);
export const fetchposteFailure = createAction(
  '[Poste] Fetch Data Failure',
  props<{ error: string }>()
);

// ── Fetch sans pagination ─────────────────────────────────────
export const fetchposteNoPaginateData = createAction('[Poste] Fetch No Pagination');
export const fetchposteNoPaginateSuccess = createAction(
  '[Poste] Fetch No Pagination Success',
  props<{ response: PosteModel[] }>()
);
export const fetchposteNoPaginateFailure = createAction(
  '[Poste] Fetch No Pagination Failure',
  props<{ error: string }>()
);

// ── Ajouter ───────────────────────────────────────────────────
export const addposteData = createAction(
  '[Poste] Add',
  props<{ newData: PosteModel }>()
);
export const addposteDataSuccess = createAction(
  '[Poste] Add Success',
  props<{ newData: PosteModel }>()
);
export const addposteDataFailure = createAction(
  '[Poste] Add Failure',
  props<{ error: string }>()
);

// ── Mettre à jour ─────────────────────────────────────────────
export const updateposteData = createAction(
  '[Poste] Update',
  props<{ updatedData: PosteModel }>()
);
export const updateposteDataSuccess = createAction(
  '[Poste] Update Success',
  props<{ updatedData: PosteModel }>()
);
export const updateposteDataFailure = createAction(
  '[Poste] Update Failure',
  props<{ error: string }>()
);

// ── Supprimer un élément ──────────────────────────────────────
export const deleteposteData = createAction(
  '[Poste] Delete',
  props<{ id: string }>()
);
export const deleteposteSuccess = createAction(
  '[Poste] Delete Success',
  props<{ id: string }>()
);
export const deleteposteFailure = createAction(
  '[Poste] Delete Failure',
  props<{ error: string }>()
);

// ── Supprimer plusieurs éléments ──────────────────────────────
export const deletemultipleposteData = createAction(
  '[Poste] Delete Multiple',
  props<{ id: string }>()
);
export const deletemultipleposteSuccess = createAction(
  '[Poste] Delete Multiple Success',
  props<{ id: string }>()
);
export const deletemultipleposteFailure = createAction(
  '[Poste] Delete Multiple Failure',
  props<{ error: string }>()
);
