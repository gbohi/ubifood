import { createAction, props } from '@ngrx/store';
import { EtatlistModel, ApiResponse } from './etat.model';

// fetch etat data
export const fetchetatData = createAction(
    '[Data] Fetch etat Table Data',
    props<{ page?: number }>()
);

export const fetchetatSuccess = createAction(
  '[Data] Fetch etat Data Success',
  props<{ response: ApiResponse<EtatlistModel> }>()
);

export const fetchetatFailure = createAction(
  '[Data] Fetch etat Data Failure',
  props<{ error: string }>()
);

// Add Data
export const addetatData = createAction(
  '[Data] Add etatData',
  props<{ newData: EtatlistModel }>()
);

export const addetatDataSuccess = createAction(
  '[Data] Add etatData Success',
  props<{ newData: EtatlistModel }>()
);

export const addetatDataFailure = createAction(
  '[Data] Add etatData Failure',
  props<{ error: string }>()
);

// Update Data
export const updateetatData = createAction(
  '[Data] Update etatData',
  props<{ updatedData: EtatlistModel }>()
);

export const updateetatDataSuccess = createAction(
  '[Data] Update etatData Success',
  props<{ updatedData: EtatlistModel }>()
);

export const updateetatDataFailure = createAction(
  '[Data] Update etatData Failure',
  props<{ error: string }>()
);

// Delete Data (Single)
export const deleteetatData = createAction(
  '[Data] Delete etatData',
  props<{ id: string }>()
);

export const deleteetatSuccess = createAction(
  '[Data] Delete etatData Success',
  props<{ id: string }>()
);

export const deleteetatFailure = createAction(
  '[Data] Delete etatData Failure',
  props<{ error: string }>()
);

// Delete Multiple
export const deletemultipleetatData = createAction(
  '[Data] Delete Multiple etatData',
  props<{ id: string }>()
);

export const deletemultipleetatSuccess = createAction(
  '[Data] Delete Multiple etatData Success',
  props<{ id: string }>()
);

export const deletemultipleetatFailure = createAction(
  '[Data] Delete Multiple etatData Failure',
  props<{ error: string }>()
);

export const fetchetatNoPaginateData = createAction(
  '[Etat] Fetch etat No Pagination'
);

export const fetchetatNoPaginateSuccess = createAction(
  '[Etat API] Fetch All etat Success',
  props<{ response: EtatlistModel[] }>() // ✅ tableau directement
);


export const fetchetatNoPaginateFailure = createAction(
  '[Etat] Fetch etat No Pagination Failure',
  props<{ error: string }>()
);