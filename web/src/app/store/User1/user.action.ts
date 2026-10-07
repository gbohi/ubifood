import { createAction, props } from '@ngrx/store';
import { UserlistModel, ApiResponse } from './user.model';

// fetch user data
export const fetchuserData = createAction(
    '[Data] Fetch user Table Data',
    props<{ page?: number }>()
);

export const fetchuserSuccess = createAction(
  '[Data] Fetch user Data Success',
  props<{ response: ApiResponse<UserlistModel> }>()
);

export const fetchuserFailure = createAction(
  '[Data] Fetch user Data Failure',
  props<{ error: string }>()
);

// Add Data
export const adduserData = createAction(
  '[Data] Add userData',
  props<{ newData: UserlistModel }>()
);

export const adduserDataSuccess = createAction(
  '[Data] Add userData Success',
  props<{ newData: UserlistModel }>()
);

export const adduserDataFailure = createAction(
  '[Data] Add userData Failure',
  props<{ error: string }>()
);

// Update Data
export const updateuserData = createAction(
  '[Data] Update userData',
  props<{ updatedData: UserlistModel }>()
);

export const updateuserDataSuccess = createAction(
  '[Data] Update userData Success',
  props<{ updatedData: UserlistModel }>()
);

export const updateuserDataFailure = createAction(
  '[Data] Update userData Failure',
  props<{ error: string }>()
);

// Delete Data (Single)
export const deleteuserData = createAction(
  '[Data] Delete userData',
  props<{ id: string }>()
);

export const deleteuserSuccess = createAction(
  '[Data] Delete userData Success',
  props<{ id: string }>()
);

export const deleteuserFailure = createAction(
  '[Data] Delete userData Failure',
  props<{ error: string }>()
);

// Delete Multiple
export const deletemultipleuserData = createAction(
  '[Data] Delete Multiple userData',
  props<{ id: string }>()
);

export const deletemultipleuserSuccess = createAction(
  '[Data] Delete Multiple userData Success',
  props<{ id: string }>()
);

export const deletemultipleuserFailure = createAction(
  '[Data] Delete Multiple userData Failure',
  props<{ error: string }>()
);