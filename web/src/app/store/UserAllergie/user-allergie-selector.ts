// src/app/store/UserAllergie/user-allergie-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { UserAllergieState } from './user-allergie.reducer';

export const selectUserAllergieState = createFeatureSelector<UserAllergieState>('userAllergie');
export const selectUserAllergieItems        = createSelector(selectUserAllergieState, s => s?.items ?? []);
export const selectUserAllergieIsLoading    = createSelector(selectUserAllergieState, s => s?.isLoading ?? false);
export const selectUserAllergieIsSubmitting = createSelector(selectUserAllergieState, s => s?.isSubmitting ?? false);
