import { createAction, props } from '@ngrx/store';
import { RolelistModel, ApiResponse } from './role.model';

// fetch role data
export const fetchroleData = createAction(
    '[Data] Fetch role Table Data',
    props<{ page?: number }>()
);

export const fetchroleSuccess = createAction(
  '[Data] Fetch role Data Success',
  props<{ response: ApiResponse<RolelistModel> }>()
);

export const fetchroleFailure = createAction(
  '[Data] Fetch role Data Failure',
  props<{ error: string }>()
);

// Add Data
export const addroleData = createAction(
  '[Data] Add roleData',
  props<{ newData: RolelistModel }>()
);

export const addroleDataSuccess = createAction(
  '[Data] Add roleData Success',
  props<{ newData: RolelistModel }>()
);

export const addroleDataFailure = createAction(
  '[Data] Add roleData Failure',
  props<{ error: string }>()
);

// Update Data
export const updateroleData = createAction(
  '[Data] Update roleData',
  props<{ updatedData: RolelistModel }>()
);

export const updateroleDataSuccess = createAction(
  '[Data] Update roleData Success',
  props<{ updatedData: RolelistModel }>()
);

export const updateroleDataFailure = createAction(
  '[Data] Update roleData Failure',
  props<{ error: string }>()
);

// Delete Data (Single)
export const deleteroleData = createAction(
  '[Data] Delete roleData',
  props<{ id: string }>()
);

export const deleteroleSuccess = createAction(
  '[Data] Delete roleData Success',
  props<{ id: string }>()
);

export const deleteroleFailure = createAction(
  '[Data] Delete roleData Failure',
  props<{ error: string }>()
);

// Delete Multiple
export const deletemultipleroleData = createAction(
  '[Data] Delete Multiple roleData',
  props<{ id: string }>()
);

export const deletemultipleroleSuccess = createAction(
  '[Data] Delete Multiple roleData Success',
  props<{ id: string }>()
);

export const deletemultipleroleFailure = createAction(
  '[Data] Delete Multiple roleData Failure',
  props<{ error: string }>()
);