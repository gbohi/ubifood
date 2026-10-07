// src/app/store/UserPoste/user-poste-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { UserPosteState } from './user-poste.reducer';

export const selectUserPosteState = createFeatureSelector<UserPosteState>('userPoste');
export const selectUserPosteItems        = createSelector(selectUserPosteState, s => s?.items ?? []);
export const selectUserPosteIsLoading    = createSelector(selectUserPosteState, s => s?.isLoading ?? false);
export const selectUserPosteIsSubmitting = createSelector(selectUserPosteState, s => s?.isSubmitting ?? false);
