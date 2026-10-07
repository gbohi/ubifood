// src/app/store/UserPoste/user-poste.action.ts

import { createAction, props } from '@ngrx/store';
import { UserPosteModel } from './user-poste.model';

export const fetchUserPostes = createAction('[UserPoste] Fetch By User', props<{ userId: number }>());
export const fetchUserPostesSuccess = createAction('[UserPoste] Fetch Success', props<{ items: UserPosteModel[] }>());
export const fetchUserPostesFailure = createAction('[UserPoste] Fetch Failure', props<{ error: string }>());

export const createUserPoste = createAction('[UserPoste] Create', props<{ data: Partial<UserPosteModel> }>());
export const createUserPosteSuccess = createAction('[UserPoste] Create Success', props<{ item: UserPosteModel }>());
export const createUserPosteFailure = createAction('[UserPoste] Create Failure', props<{ error: string }>());

export const updateUserPoste = createAction('[UserPoste] Update', props<{ id: number; data: Partial<UserPosteModel> }>());
export const updateUserPosteSuccess = createAction('[UserPoste] Update Success', props<{ item: UserPosteModel }>());
export const updateUserPosteFailure = createAction('[UserPoste] Update Failure', props<{ error: string }>());

export const deleteUserPoste = createAction('[UserPoste] Delete', props<{ id: number }>());
export const deleteUserPosteSuccess = createAction('[UserPoste] Delete Success', props<{ id: number }>());
export const deleteUserPosteFailure = createAction('[UserPoste] Delete Failure', props<{ error: string }>());

export const saveUserPostesBatch = createAction('[UserPoste] Save Batch', props<{ userId: number; items: Partial<UserPosteModel>[] }>());
export const saveUserPostesBatchSuccess = createAction('[UserPoste] Save Batch Success', props<{ userId: number }>());
export const saveUserPostesBatchFailure = createAction('[UserPoste] Save Batch Failure', props<{ error: string }>());

export const resetUserPoste = createAction('[UserPoste] Reset');
