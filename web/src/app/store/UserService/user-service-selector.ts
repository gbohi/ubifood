// src/app/store/UserService/user-service-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { UserServiceState } from './user-service.reducer';

export const selectUserServiceState = createFeatureSelector<UserServiceState>('userService');
export const selectUserServiceItems        = createSelector(selectUserServiceState, s => s?.items ?? []);
export const selectUserServiceIsLoading    = createSelector(selectUserServiceState, s => s?.isLoading ?? false);
export const selectUserServiceIsSubmitting = createSelector(selectUserServiceState, s => s?.isSubmitting ?? false);
