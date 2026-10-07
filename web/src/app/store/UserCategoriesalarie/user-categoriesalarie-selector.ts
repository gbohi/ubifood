// src/app/store/UserCategoriesalarie/user-categoriesalarie-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { UserCategoriesalarieState } from './user-categoriesalarie.reducer';

export const selectUserCategoriesalarieState = createFeatureSelector<UserCategoriesalarieState>('userCategoriesalarie');
export const selectUserCategoriesalarieItems        = createSelector(selectUserCategoriesalarieState, s => s?.items ?? []);
export const selectUserCategoriesalarieIsLoading    = createSelector(selectUserCategoriesalarieState, s => s?.isLoading ?? false);
export const selectUserCategoriesalarieIsSubmitting = createSelector(selectUserCategoriesalarieState, s => s?.isSubmitting ?? false);
