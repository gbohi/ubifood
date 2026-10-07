// src/app/store/Typevehicule/typevehicule.action.ts

import { createAction, props } from '@ngrx/store';
import { TypevehiculelistModel, ApiResponse } from './typevehicule.model';

// ── Fetch paginé ──────────────────────────────────────────────
export const fetchtypevehiculeData = createAction(
  '[Data] Fetch typevehicule Table Data',
  props<{ page?: number }>()
);
export const fetchtypevehiculeSuccess = createAction(
  '[Data] Fetch typevehicule Data Success',
  props<{ response: ApiResponse<TypevehiculelistModel> }>()
);
export const fetchtypevehiculeFailure = createAction(
  '[Data] Fetch typevehicule Data Failure',
  props<{ error: string }>()
);

// ── Fetch sans pagination ─────────────────────────────────────
export const fetchtypevehiculeNoPaginateData = createAction(
  '[Typevehicule] Fetch typevehicule No Pagination'
);
export const fetchtypevehiculeNoPaginateSuccess = createAction(
  '[Typevehicule API] Fetch All Typevehicule Success',
  props<{ response: TypevehiculelistModel[] }>()
);
export const fetchtypevehiculeNoPaginateFailure = createAction(
  '[Typevehicule] Fetch typevehicule No Pagination Failure',
  props<{ error: string }>()
);

// ── Ajouter ───────────────────────────────────────────────────
export const addtypevehiculeData = createAction(
  '[Data] Add typevehiculeData',
  props<{ newData: TypevehiculelistModel }>()
);
export const addtypevehiculeDataSuccess = createAction(
  '[Data] Add typevehiculeData Success',
  props<{ newData: TypevehiculelistModel }>()
);
export const addtypevehiculeDataFailure = createAction(
  '[Data] Add typevehiculeData Failure',
  props<{ error: string }>()
);

// ── Modifier ──────────────────────────────────────────────────
export const updatetypevehiculeData = createAction(
  '[Data] Update typevehiculeData',
  props<{ updatedData: TypevehiculelistModel }>()
);
export const updatetypevehiculeDataSuccess = createAction(
  '[Data] Update typevehiculeData Success',
  props<{ updatedData: TypevehiculelistModel }>()
);
export const updatetypevehiculeDataFailure = createAction(
  '[Data] Update typevehiculeData Failure',
  props<{ error: string }>()
);

// ── Supprimer (unitaire) ──────────────────────────────────────
export const deletetypevehiculeData = createAction(
  '[Data] Delete typevehiculeData',
  props<{ id: string }>()
);
export const deletetypevehiculeSuccess = createAction(
  '[Data] Delete typevehiculeData Success',
  props<{ id: string }>()
);
export const deletetypevehiculeFailure = createAction(
  '[Data] Delete typevehiculeData Failure',
  props<{ error: string }>()
);

// ── Supprimer (multiple) ──────────────────────────────────────
export const deletemultipletypevehiculeData = createAction(
  '[Data] Delete Multiple typevehiculeData',
  props<{ id: string }>()
);
export const deletemultipletypevehiculeSuccess = createAction(
  '[Data] Delete Multiple typevehiculeData Success',
  props<{ id: string }>()
);
export const deletemultipletypevehiculeFailure = createAction(
  '[Data] Delete Multiple typevehiculeData Failure',
  props<{ error: string }>()
);
