import { createAction, props } from '@ngrx/store';
import { FonctionlistModel, ApiResponse } from './fonction.model';

// fetch fonction data
export const fetchfonctionData = createAction(
    '[Data] Fetch fonction Table Data',
    props<{ page?: number }>()
);

export const fetchfonctionSuccess = createAction(
  '[Data] Fetch fonction Data Success',
  props<{ response: ApiResponse<FonctionlistModel> }>()
);

export const fetchfonctionFailure = createAction(
  '[Data] Fetch fonction Data Failure',
  props<{ error: string }>()
);

// Add Data
export const addfonctionData = createAction(
  '[Data] Add fonctionData',
  props<{ newData: FonctionlistModel }>()
);

export const addfonctionDataSuccess = createAction(
  '[Data] Add fonctionData Success',
  props<{ newData: FonctionlistModel }>()
);

export const addfonctionDataFailure = createAction(
  '[Data] Add fonctionData Failure',
  props<{ error: string }>()
);

// Update Data
export const updatefonctionData = createAction(
  '[Data] Update fonctionData',
  props<{ updatedData: FonctionlistModel }>()
);

export const updatefonctionDataSuccess = createAction(
  '[Data] Update fonctionData Success',
  props<{ updatedData: FonctionlistModel }>()
);

export const updatefonctionDataFailure = createAction(
  '[Data] Update fonctionData Failure',
  props<{ error: string }>()
);

// Delete Data (Single)
export const deletefonctionData = createAction(
  '[Data] Delete fonctionData',
  props<{ id: string }>()
);

export const deletefonctionSuccess = createAction(
  '[Data] Delete fonctionData Success',
  props<{ id: string }>()
);

export const deletefonctionFailure = createAction(
  '[Data] Delete fonctionData Failure',
  props<{ error: string }>()
);

// Delete Multiple
export const deletemultiplefonctionData = createAction(
  '[Data] Delete Multiple fonctionData',
  props<{ id: string }>()
);

export const deletemultiplefonctionSuccess = createAction(
  '[Data] Delete Multiple fonctionData Success',
  props<{ id: string }>()
);

export const deletemultiplefonctionFailure = createAction(
  '[Data] Delete Multiple fonctionData Failure',
  props<{ error: string }>()
);

export const fetchfonctionNoPaginateData = createAction(
  '[Fonction] Fetch Fonction No Pagination'
);

export const fetchfonctionNoPaginateSuccess = createAction(
  '[Fonction API] Fetch All Fonction Success',
  props<{ response: FonctionlistModel[] }>() // ✅ tableau directement
);


export const fetchfonctionNoPaginateFailure = createAction(
  '[Fonction] Fetch Fonction No Pagination Failure',
  props<{ error: string }>()
);