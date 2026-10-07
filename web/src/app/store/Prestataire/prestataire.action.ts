import { createAction, props } from '@ngrx/store';
import { PrestatairelistModel, ApiResponse } from './prestataire.model';

// fetch prestataire data
export const fetchprestataireData = createAction(
    '[Data] Fetch prestataire Table Data',
    props<{ page?: number }>()
);

export const fetchprestataireSuccess = createAction(
  '[Data] Fetch prestataire Data Success',
  props<{ response: ApiResponse<PrestatairelistModel> }>()
);

export const fetchprestataireFailure = createAction(
  '[Data] Fetch prestataire Data Failure',
  props<{ error: string }>()
);

// Add Data
export const addprestataireData = createAction(
  '[Data] Add prestataireData',
  props<{ newData: PrestatairelistModel }>()
);

export const addprestataireDataSuccess = createAction(
  '[Data] Add prestataireData Success',
  props<{ newData: PrestatairelistModel }>()
);

export const addprestataireDataFailure = createAction(
  '[Data] Add prestataireData Failure',
  props<{ error: string }>()
);

// Update Data
export const updateprestataireData = createAction(
  '[Data] Update prestataireData',
  props<{ updatedData: PrestatairelistModel }>()
);

export const updateprestataireDataSuccess = createAction(
  '[Data] Update prestataireData Success',
  props<{ updatedData: PrestatairelistModel }>()
);

export const updateprestataireDataFailure = createAction(
  '[Data] Update prestataireData Failure',
  props<{ error: string }>()
);

// Delete Data (Single)
export const deleteprestataireData = createAction(
  '[Data] Delete prestataireData',
  props<{ id: string }>()
);

export const deleteprestataireSuccess = createAction(
  '[Data] Delete prestataireData Success',
  props<{ id: string }>()
);

export const deleteprestataireFailure = createAction(
  '[Data] Delete prestataireData Failure',
  props<{ error: string }>()
);

// Delete Multiple
export const deletemultipleprestataireData = createAction(
  '[Data] Delete Multiple prestataireData',
  props<{ id: string }>()
);

export const deletemultipleprestataireSuccess = createAction(
  '[Data] Delete Multiple prestataireData Success',
  props<{ id: string }>()
);

export const deletemultipleprestataireFailure = createAction(
  '[Data] Delete Multiple prestataireData Failure',
  props<{ error: string }>()
);

export const fetchprestataireNoPaginateData = createAction(
  '[Prestataire] Fetch Prestataire No Pagination'
);

export const fetchprestataireNoPaginateSuccess = createAction(
  '[Prestataire API] Fetch All Prestataire Success',
  props<{ response: PrestatairelistModel[] }>() // ✅ tableau directement
);


export const fetchprestataireNoPaginateFailure = createAction(
  '[Prestataire] Fetch prestataire No Pagination Failure',
  props<{ error: string }>()
);