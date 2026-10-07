import { createAction, props } from '@ngrx/store';
import { SimulationsalairelistModel, ApiResponse } from './simulationsalaire.model';

// fetch Simulationsalaire Data
export const fetchsimulationsalaireData = createAction(
    '[Data] Fetch Simulationsalaire Table Data',
    props<{ page?: number }>()
);

export const fetchsimulationsalaireSuccess = createAction(
  '[Data] Fetch simulationsalaire Data Success',
  props<{ response: ApiResponse<SimulationsalairelistModel> }>()
);

export const fetchsimulationsalaireFailure = createAction(
  '[Data] Fetch simulationsalaire Data Failure',
  props<{ error: string }>()
);

// Add Data
export const addsimulationsalaireData = createAction(
  '[Data] Add simulationsalaireData',
  props<{ newData: SimulationsalairelistModel }>()
);

export const addsimulationsalaireDataSuccess = createAction(
  '[Data] Add simulationsalaireData Success',
  props<{ newData: SimulationsalairelistModel }>()
);

export const addsimulationsalaireDataFailure = createAction(
  '[Data] Add simulationsalaireData Failure',
  props<{ error: string }>()
);

// Update Data
export const updatesimulationsalaireData = createAction(
  '[Data] Update simulationsalaireData',
  props<{ updatedData: SimulationsalairelistModel }>()
);

export const updatesimulationsalaireDataSuccess = createAction(
  '[Data] Update simulationsalaireData Success',
  props<{ updatedData: SimulationsalairelistModel }>()
);

export const updatesimulationsalaireDataFailure = createAction(
  '[Data] Update simulationsalaireData Failure',
  props<{ error: string }>()
);

// Delete Data (Single)
export const deletesimulationsalaireData = createAction(
  '[Data] Delete simulationsalaireData',
  props<{ id: string }>()
);

export const deletesimulationsalaireSuccess = createAction(
  '[Data] Delete simulationsalaireData Success',
  props<{ id: string }>()
);

export const deletesimulationsalaireFailure = createAction(
  '[Data] Delete simulationsalaireData Failure',
  props<{ error: string }>()
);

// Delete Multiple
export const deletemultiplesimulationsalaireData = createAction(
  '[Data] Delete Multiple simulationsalaireData',
  props<{ id: string }>()
);

export const deletemultiplesimulationsalaireSuccess = createAction(
  '[Data] Delete Multiple simulationsalaireData Success',
  props<{ id: string }>()
);

export const deletemultiplesimulationsalaireFailure = createAction(
  '[Data] Delete Multiple simulationsalaireData Failure',
  props<{ error: string }>()
);

export const fetchsimulationsalaireNoPaginateData = createAction(
  '[Simulationsalaire] Fetch Simulationsalaire No Pagination'
);

export const fetchsimulationsalaireNoPaginateSuccess = createAction(
  '[Simulationsalaire API] Fetch All Simulationsalaire Success',
  props<{ response: SimulationsalairelistModel[] }>() // ✅ tableau directement
);


export const fetchsimulationsalaireNoPaginateFailure = createAction(
  '[Simulationsalaire] Fetch Simulationsalaire No Pagination Failure',
  props<{ error: string }>()
);