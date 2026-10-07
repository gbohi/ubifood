import { createAction, props } from '@ngrx/store';
import { EntretienVehiculelistModel, ApiResponse } from './entretienvehicule.model';

// fetch Entretienvehicule Data
export const fetchentretienvehiculeData = createAction(
    '[Data] Fetch Entretienvehicule Table Data',
    props<{ page?: number }>()
);

export const fetchentretienvehiculeSuccess = createAction(
  '[Data] Fetch entretienvehicule Data Success',
  props<{ response: ApiResponse<EntretienVehiculelistModel> }>()
);

export const fetchentretienvehiculeFailure = createAction(
  '[Data] Fetch entretienvehicule Data Failure',
  props<{ error: string }>()
);

// Add Data
export const addentretienvehiculeData = createAction(
  '[Data] Add entretienvehiculeData',
  props<{ newData: EntretienVehiculelistModel }>()
);

export const addentretienvehiculeDataSuccess = createAction(
  '[Data] Add entretienvehiculeData Success',
  props<{ newData: EntretienVehiculelistModel }>()
);

export const addentretienvehiculeDataFailure = createAction(
  '[Data] Add entretienvehiculeData Failure',
  props<{ error: string }>()
);

// Update Data
export const updateentretienvehiculeData = createAction(
  '[Data] Update entretienvehiculeData',
  props<{ updatedData: EntretienVehiculelistModel }>()
);

export const updateentretienvehiculeDataSuccess = createAction(
  '[Data] Update entretienvehiculeData Success',
  props<{ updatedData: EntretienVehiculelistModel }>()
);

export const updateentretienvehiculeDataFailure = createAction(
  '[Data] Update entretienvehiculeData Failure',
  props<{ error: string }>()
);

// Delete Data (Single)
export const deleteentretienvehiculeData = createAction(
  '[Data] Delete entretienvehiculeData',
  props<{ id: string }>()
);

export const deleteentretienvehiculeSuccess = createAction(
  '[Data] Delete entretienvehiculeData Success',
  props<{ id: string }>()
);

export const deleteentretienvehiculeFailure = createAction(
  '[Data] Delete entretienvehiculeData Failure',
  props<{ error: string }>()
);

// Delete Multiple
export const deletemultipleentretienvehiculeData = createAction(
  '[Data] Delete Multiple entretienvehiculeData',
  props<{ id: string }>()
);

export const deletemultipleentretienvehiculeSuccess = createAction(
  '[Data] Delete Multiple entretienvehiculeData Success',
  props<{ id: string }>()
);

export const deletemultipleentretienvehiculeFailure = createAction(
  '[Data] Delete Multiple entretienvehiculeData Failure',
  props<{ error: string }>()
);

export const fetchentretienvehiculeNoPaginateData = createAction(
  '[Entretienvehicule] Fetch Entretienvehicule No Pagination'
);

export const fetchentretienvehiculeNoPaginateSuccess = createAction(
  '[Entretienvehicule API] Fetch All Entretienvehicule Success',
  props<{ response: EntretienVehiculelistModel[] }>() // ✅ tableau directement
);


export const fetchentretienvehiculeNoPaginateFailure = createAction(
  '[Entretienvehicule] Fetch Entretienvehicule No Pagination Failure',
  props<{ error: string }>()
);