// src/app/store/Authentication/authentication.selectors.ts
import { createFeatureSelector, createSelector } from '@ngrx/store';
import { AuthenticationState } from './authentication.reducer';

export const getLayoutState = createFeatureSelector<AuthenticationState>('auth');

// Selectors existants — conservés tels quels pour ne pas casser les usages
export const getUser = createSelector(
  getLayoutState,
  (state: AuthenticationState) => state.user
);

export const getisLoggedIn = createSelector(
  getLayoutState,
  (state: AuthenticationState) => state.isLoggedIn
);

export const getError = createSelector(
  getLayoutState,
  (state: AuthenticationState) => state.error
);

// Aliases pour login.component.ts — pointent sur les mêmes champs
export const selectLoginError = getError;
export const selectLoginLoading = createSelector(
  getLayoutState,
  (state: AuthenticationState) => state.loading
);
