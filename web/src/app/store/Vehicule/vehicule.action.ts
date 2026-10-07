// src/app/store/Vehicule/vehicule.action.ts

import { createAction, props } from '@ngrx/store';
import { VehiculelistModel, ApiResponse } from './vehicule.model';

// ── Fetch paginé ──────────────────────────────────────────────
export const fetchvehiculeData = createAction(
  '[Data] Fetch vehicule Table Data',
  props<{ page?: number }>()
);
export const fetchvehiculeSuccess = createAction(
  '[Data] Fetch vehicule Data Success',
  props<{ response: ApiResponse<VehiculelistModel> }>()
);
export const fetchvehiculeFailure = createAction(
  '[Data] Fetch vehicule Data Failure',
  props<{ error: string }>()
);

// ── Fetch sans pagination ─────────────────────────────────────
export const fetchvehiculeNoPaginateData = createAction(
  '[Vehicule] Fetch Vehicule No Pagination'
);
export const fetchvehiculeNoPaginateSuccess = createAction(
  '[Vehicule API] Fetch All Vehicule Success',
  props<{ response: VehiculelistModel[] }>()
);
export const fetchvehiculeNoPaginateFailure = createAction(
  '[Vehicule] Fetch Vehicule No Pagination Failure',
  props<{ error: string }>()
);

// ── Ajouter ───────────────────────────────────────────────────
export const addvehiculeData = createAction(
  '[Data] Add vehiculeData',
  props<{ newData: VehiculelistModel }>()
);
export const addvehiculeDataSuccess = createAction(
  '[Data] Add vehiculeData Success',
  props<{ newData: VehiculelistModel }>()
);
export const addvehiculeDataFailure = createAction(
  '[Data] Add vehiculeData Failure',
  props<{ error: string }>()
);

// ── Modifier ──────────────────────────────────────────────────
export const updatevehiculeData = createAction(
  '[Data] Update vehiculeData',
  props<{ updatedData: VehiculelistModel }>()
);
export const updatevehiculeDataSuccess = createAction(
  '[Data] Update vehiculeData Success',
  props<{ updatedData: VehiculelistModel }>()
);
export const updatevehiculeDataFailure = createAction(
  '[Data] Update vehiculeData Failure',
  props<{ error: string }>()
);

// ── Supprimer (unitaire) ──────────────────────────────────────
export const deletevehiculeData = createAction(
  '[Data] Delete vehiculeData',
  props<{ id: string }>()
);
export const deletevehiculeSuccess = createAction(
  '[Data] Delete vehiculeData Success',
  props<{ id: string }>()
);
export const deletevehiculeFailure = createAction(
  '[Data] Delete vehiculeData Failure',
  props<{ error: string }>()
);

// ── Supprimer (multiple) ──────────────────────────────────────
export const deletemultiplevehiculeData = createAction(
  '[Data] Delete Multiple vehiculeData',
  props<{ id: string }>()
);
export const deletemultiplevehiculeSuccess = createAction(
  '[Data] Delete Multiple vehiculeData Success',
  props<{ id: string }>()
);
export const deletemultiplevehiculeFailure = createAction(
  '[Data] Delete Multiple vehiculeData Failure',
  props<{ error: string }>()
);
