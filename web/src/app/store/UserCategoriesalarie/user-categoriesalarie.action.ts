// src/app/store/UserCategoriesalarie/user-categoriesalarie.action.ts

import { createAction, props } from '@ngrx/store';
import { UserCategoriesalarieModel } from './user-categoriesalarie.model';

export const fetchUserCategoriesalaries = createAction('[UserCategoriesalarie] Fetch By User', props<{ userId: number }>());
export const fetchUserCategoriesalariesSuccess = createAction('[UserCategoriesalarie] Fetch Success', props<{ items: UserCategoriesalarieModel[] }>());
export const fetchUserCategoriesalariesFailure = createAction('[UserCategoriesalarie] Fetch Failure', props<{ error: string }>());

export const createUserCategoriesalarie = createAction('[UserCategoriesalarie] Create', props<{ data: Partial<UserCategoriesalarieModel> }>());
export const createUserCategoriesalarieSuccess = createAction('[UserCategoriesalarie] Create Success', props<{ item: UserCategoriesalarieModel }>());
export const createUserCategoriesalarieFailure = createAction('[UserCategoriesalarie] Create Failure', props<{ error: string }>());

export const updateUserCategoriesalarie = createAction('[UserCategoriesalarie] Update', props<{ id: number; data: Partial<UserCategoriesalarieModel> }>());
export const updateUserCategoriesalarieSuccess = createAction('[UserCategoriesalarie] Update Success', props<{ item: UserCategoriesalarieModel }>());
export const updateUserCategoriesalarieFailure = createAction('[UserCategoriesalarie] Update Failure', props<{ error: string }>());

export const deleteUserCategoriesalarie = createAction('[UserCategoriesalarie] Delete', props<{ id: number }>());
export const deleteUserCategoriesalarieSuccess = createAction('[UserCategoriesalarie] Delete Success', props<{ id: number }>());
export const deleteUserCategoriesalarieFailure = createAction('[UserCategoriesalarie] Delete Failure', props<{ error: string }>());

export const saveUserCategoriesalariesBatch = createAction('[UserCategoriesalarie] Save Batch', props<{ userId: number; items: Partial<UserCategoriesalarieModel>[] }>());
export const saveUserCategoriesalariesBatchSuccess = createAction('[UserCategoriesalarie] Save Batch Success', props<{ userId: number }>());
export const saveUserCategoriesalariesBatchFailure = createAction('[UserCategoriesalarie] Save Batch Failure', props<{ error: string }>());

export const resetUserCategoriesalarie = createAction('[UserCategoriesalarie] Reset');
