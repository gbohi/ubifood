// src/app/store/Menu/menu.action.ts
import { createAction, props } from '@ngrx/store';
import { MenulistModel, ApiResponse } from './menu.model';

// ─────────────────────────────────────────────────────────────
// FETCH — liste paginée
// ─────────────────────────────────────────────────────────────

export const fetchmenuData = createAction(
  '[Menu] Fetch List',
  props<{ page?: number }>()
);
export const fetchmenuSuccess = createAction(
  '[Menu] Fetch List Success',
  props<{ response: ApiResponse<MenulistModel> }>()
);
export const fetchmenuFailure = createAction(
  '[Menu] Fetch List Failure',
  props<{ error: string }>()
);

// ─────────────────────────────────────────────────────────────
// FETCH sans pagination (pour les selects)
// ─────────────────────────────────────────────────────────────

export const fetchmenuNoPaginateData = createAction('[Menu] Fetch No Paginate');
export const fetchmenuNoPaginateSuccess = createAction(
  '[Menu] Fetch No Paginate Success',
  props<{ response: MenulistModel[] }>()
);
export const fetchmenuNoPaginateFailure = createAction(
  '[Menu] Fetch No Paginate Failure',
  props<{ error: string }>()
);

// ─────────────────────────────────────────────────────────────
// CRÉATION
// ─────────────────────────────────────────────────────────────

export const addmenuData = createAction(
  '[Menu] Add',
  props<{ newData: any }>()
);
export const addmenuDataSuccess = createAction(
  '[Menu] Add Success',
  props<{ newData: MenulistModel }>()
);
export const addmenuDataFailure = createAction(
  '[Menu] Add Failure',
  props<{ error: string }>()
);

// ─────────────────────────────────────────────────────────────
// MISE À JOUR
// ─────────────────────────────────────────────────────────────

export const updatemenuData = createAction(
  '[Menu] Update',
  props<{ updatedData: any }>()
);
export const updatemenuDataSuccess = createAction(
  '[Menu] Update Success',
  props<{ updatedData: MenulistModel }>()
);
export const updatemenuDataFailure = createAction(
  '[Menu] Update Failure',
  props<{ error: string }>()
);

// ─────────────────────────────────────────────────────────────
// SUPPRESSION simple
// ─────────────────────────────────────────────────────────────

export const deletemenuData = createAction(
  '[Menu] Delete',
  props<{ id: string }>()
);
export const deletemenuSuccess = createAction(
  '[Menu] Delete Success',
  props<{ id: string }>()
);
export const deletemenuFailure = createAction(
  '[Menu] Delete Failure',
  props<{ error: string }>()
);

// ─────────────────────────────────────────────────────────────
// SUPPRESSION multiple
// ─────────────────────────────────────────────────────────────

export const deletemultiplemenuData = createAction(
  '[Menu] Delete Multiple',
  props<{ id: string }>()
);
export const deletemultiplemenuSuccess = createAction(
  '[Menu] Delete Multiple Success',
  props<{ id: string }>()
);
export const deletemultiplemenuFailure = createAction(
  '[Menu] Delete Multiple Failure',
  props<{ error: string }>()
);
