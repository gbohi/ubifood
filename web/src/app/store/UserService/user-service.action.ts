// src/app/store/UserService/user-service.action.ts

import { createAction, props } from '@ngrx/store';
import { UserServiceModel } from './user-service.model';

export const fetchUserServices = createAction('[UserService] Fetch By User', props<{ userId: number }>());
export const fetchUserServicesSuccess = createAction('[UserService] Fetch Success', props<{ items: UserServiceModel[] }>());
export const fetchUserServicesFailure = createAction('[UserService] Fetch Failure', props<{ error: string }>());

export const createUserService = createAction('[UserService] Create', props<{ data: Partial<UserServiceModel> }>());
export const createUserServiceSuccess = createAction('[UserService] Create Success', props<{ item: UserServiceModel }>());
export const createUserServiceFailure = createAction('[UserService] Create Failure', props<{ error: string }>());

export const updateUserService = createAction('[UserService] Update', props<{ id: number; data: Partial<UserServiceModel> }>());
export const updateUserServiceSuccess = createAction('[UserService] Update Success', props<{ item: UserServiceModel }>());
export const updateUserServiceFailure = createAction('[UserService] Update Failure', props<{ error: string }>());

export const deleteUserService = createAction('[UserService] Delete', props<{ id: number }>());
export const deleteUserServiceSuccess = createAction('[UserService] Delete Success', props<{ id: number }>());
export const deleteUserServiceFailure = createAction('[UserService] Delete Failure', props<{ error: string }>());

export const saveUserServicesBatch = createAction('[UserService] Save Batch', props<{ userId: number; items: Partial<UserServiceModel>[] }>());
export const saveUserServicesBatchSuccess = createAction('[UserService] Save Batch Success', props<{ userId: number }>());
export const saveUserServicesBatchFailure = createAction('[UserService] Save Batch Failure', props<{ error: string }>());

export const resetUserService = createAction('[UserService] Reset');
