// src/app/store/UserAgence/user-agence-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { UserAgenceState } from './user-agence.reducer';

export const selectUserAgenceState = createFeatureSelector<UserAgenceState>('userAgence');
export const selectUserAgenceItems        = createSelector(selectUserAgenceState, s => s?.items ?? []);
export const selectUserAgenceIsLoading    = createSelector(selectUserAgenceState, s => s?.isLoading ?? false);
export const selectUserAgenceIsSubmitting = createSelector(selectUserAgenceState, s => s?.isSubmitting ?? false);
