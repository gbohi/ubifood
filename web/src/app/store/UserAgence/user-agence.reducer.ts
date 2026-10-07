// src/app/store/UserAgence/user-agence.reducer.ts

import { createReducer, on } from '@ngrx/store';
import { UserAgenceModel } from './user-agence.model';
import * as A from './user-agence.action';

export interface UserAgenceState {
  items:          UserAgenceModel[];
  isLoading:      boolean;
  isSubmitting:   boolean;
  error:          string | null;
  successMessage: string | null;
}

export const initialUserAgenceState: UserAgenceState = {
  items:          [],
  isLoading:      false,
  isSubmitting:   false,
  error:          null,
  successMessage: null,
};

export const userAgenceReducer = createReducer(
  initialUserAgenceState,

  on(A.fetchUserAgences,        state => ({ ...state, isLoading: true, error: null })),
  on(A.fetchUserAgencesSuccess, (state, { items }) => ({ ...state, isLoading: false, items })),
  on(A.fetchUserAgencesFailure, (state, { error }) => ({ ...state, isLoading: false, error })),

  on(A.createUserAgence,        state => ({ ...state, isSubmitting: true, error: null, successMessage: null })),
  on(A.createUserAgenceSuccess, (state, { item }) => ({
    ...state, isSubmitting: false, successMessage: 'Agence ajoutée.', items: [...state.items, item]
  })),
  on(A.createUserAgenceFailure, (state, { error }) => ({ ...state, isSubmitting: false, error })),

  on(A.updateUserAgence,        state => ({ ...state, isSubmitting: true, error: null, successMessage: null })),
  on(A.updateUserAgenceSuccess, (state, { item }) => ({
    ...state, isSubmitting: false, successMessage: 'Agence mise à jour.',
    items: state.items.map(i => i.id === item.id ? item : i),
  })),
  on(A.updateUserAgenceFailure, (state, { error }) => ({ ...state, isSubmitting: false, error })),

  on(A.deleteUserAgence,        state => ({ ...state, isSubmitting: true, error: null, successMessage: null })),
  on(A.deleteUserAgenceSuccess, (state, { id }) => ({
    ...state, isSubmitting: false, successMessage: 'Agence supprimée.',
    items: state.items.filter(i => i.id !== id),
  })),
  on(A.deleteUserAgenceFailure, (state, { error }) => ({ ...state, isSubmitting: false, error })),

  on(A.saveUserAgencesBatch,        state => ({ ...state, isSubmitting: true, error: null, successMessage: null })),
  on(A.saveUserAgencesBatchSuccess, state => ({ ...state, isSubmitting: false, successMessage: 'Agences enregistrées.' })),
  on(A.saveUserAgencesBatchFailure, (state, { error }) => ({ ...state, isSubmitting: false, error })),

  on(A.resetUserAgence, () => ({ ...initialUserAgenceState })),
);
