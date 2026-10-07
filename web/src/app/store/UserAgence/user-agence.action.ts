// src/app/store/UserAgence/user-agence.action.ts

import { createAction, props } from '@ngrx/store';
import { UserAgenceModel } from './user-agence.model';

export const fetchUserAgences = createAction('[UserAgence] Fetch By User', props<{ userId: number }>());
export const fetchUserAgencesSuccess = createAction('[UserAgence] Fetch Success', props<{ items: UserAgenceModel[] }>());
export const fetchUserAgencesFailure = createAction('[UserAgence] Fetch Failure', props<{ error: string }>());

export const createUserAgence = createAction('[UserAgence] Create', props<{ data: Partial<UserAgenceModel> }>());
export const createUserAgenceSuccess = createAction('[UserAgence] Create Success', props<{ item: UserAgenceModel }>());
export const createUserAgenceFailure = createAction('[UserAgence] Create Failure', props<{ error: string }>());

export const updateUserAgence = createAction('[UserAgence] Update', props<{ id: number; data: Partial<UserAgenceModel> }>());
export const updateUserAgenceSuccess = createAction('[UserAgence] Update Success', props<{ item: UserAgenceModel }>());
export const updateUserAgenceFailure = createAction('[UserAgence] Update Failure', props<{ error: string }>());

export const deleteUserAgence = createAction('[UserAgence] Delete', props<{ id: number }>());
export const deleteUserAgenceSuccess = createAction('[UserAgence] Delete Success', props<{ id: number }>());
export const deleteUserAgenceFailure = createAction('[UserAgence] Delete Failure', props<{ error: string }>());

export const saveUserAgencesBatch = createAction('[UserAgence] Save Batch', props<{ userId: number; items: Partial<UserAgenceModel>[] }>());
export const saveUserAgencesBatchSuccess = createAction('[UserAgence] Save Batch Success', props<{ userId: number }>());
export const saveUserAgencesBatchFailure = createAction('[UserAgence] Save Batch Failure', props<{ error: string }>());

export const resetUserAgence = createAction('[UserAgence] Reset');
