// src/app/store/UserAllergie/user-allergie.action.ts

import { createAction, props } from '@ngrx/store';
import { UserAllergieModel } from './user-allergie.model';

export const fetchUserAllergies = createAction('[UserAllergie] Fetch By User', props<{ userId: number }>());
export const fetchUserAllergiesSuccess = createAction('[UserAllergie] Fetch Success', props<{ items: UserAllergieModel[] }>());
export const fetchUserAllergiesFailure = createAction('[UserAllergie] Fetch Failure', props<{ error: string }>());

export const createUserAllergie = createAction('[UserAllergie] Create', props<{ data: Partial<UserAllergieModel> }>());
export const createUserAllergieSuccess = createAction('[UserAllergie] Create Success', props<{ item: UserAllergieModel }>());
export const createUserAllergieFailure = createAction('[UserAllergie] Create Failure', props<{ error: string }>());

export const updateUserAllergie = createAction('[UserAllergie] Update', props<{ id: number; data: Partial<UserAllergieModel> }>());
export const updateUserAllergieSuccess = createAction('[UserAllergie] Update Success', props<{ item: UserAllergieModel }>());
export const updateUserAllergieFailure = createAction('[UserAllergie] Update Failure', props<{ error: string }>());

export const deleteUserAllergie = createAction('[UserAllergie] Delete', props<{ id: number }>());
export const deleteUserAllergieSuccess = createAction('[UserAllergie] Delete Success', props<{ id: number }>());
export const deleteUserAllergieFailure = createAction('[UserAllergie] Delete Failure', props<{ error: string }>());

export const saveUserAllergiesBatch = createAction('[UserAllergie] Save Batch', props<{ userId: number; items: Partial<UserAllergieModel>[] }>());
export const saveUserAllergiesBatchSuccess = createAction('[UserAllergie] Save Batch Success', props<{ userId: number }>());
export const saveUserAllergiesBatchFailure = createAction('[UserAllergie] Save Batch Failure', props<{ error: string }>());

export const resetUserAllergie = createAction('[UserAllergie] Reset');
