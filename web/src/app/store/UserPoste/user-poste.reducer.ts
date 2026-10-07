// src/app/store/UserPoste/user-poste.reducer.ts

import { createReducer, on } from '@ngrx/store';
import { UserPosteModel } from './user-poste.model';
import * as A from './user-poste.action';

export interface UserPosteState {
  items:          UserPosteModel[];
  isLoading:      boolean;
  isSubmitting:   boolean;
  error:          string | null;
  successMessage: string | null;
}

export const initialUserPosteState: UserPosteState = {
  items:          [],
  isLoading:      false,
  isSubmitting:   false,
  error:          null,
  successMessage: null,
};

export const userPosteReducer = createReducer(
  initialUserPosteState,

  on(A.fetchUserPostes,        state => ({ ...state, isLoading: true, error: null })),
  on(A.fetchUserPostesSuccess, (state, { items }) => ({ ...state, isLoading: false, items })),
  on(A.fetchUserPostesFailure, (state, { error }) => ({ ...state, isLoading: false, error })),

  on(A.createUserPoste,        state => ({ ...state, isSubmitting: true, error: null, successMessage: null })),
  on(A.createUserPosteSuccess, (state, { item }) => ({
    ...state, isSubmitting: false, successMessage: 'Poste ajouté.', items: [...state.items, item]
  })),
  on(A.createUserPosteFailure, (state, { error }) => ({ ...state, isSubmitting: false, error })),

  on(A.updateUserPoste,        state => ({ ...state, isSubmitting: true, error: null, successMessage: null })),
  on(A.updateUserPosteSuccess, (state, { item }) => ({
    ...state, isSubmitting: false, successMessage: 'Poste mis à jour.',
    items: state.items.map(i => i.id === item.id ? item : i),
  })),
  on(A.updateUserPosteFailure, (state, { error }) => ({ ...state, isSubmitting: false, error })),

  on(A.deleteUserPoste,        state => ({ ...state, isSubmitting: true, error: null, successMessage: null })),
  on(A.deleteUserPosteSuccess, (state, { id }) => ({
    ...state, isSubmitting: false, successMessage: 'Poste supprimé.',
    items: state.items.filter(i => i.id !== id),
  })),
  on(A.deleteUserPosteFailure, (state, { error }) => ({ ...state, isSubmitting: false, error })),

  on(A.saveUserPostesBatch,        state => ({ ...state, isSubmitting: true, error: null, successMessage: null })),
  on(A.saveUserPostesBatchSuccess, state => ({ ...state, isSubmitting: false, successMessage: 'Postes enregistrés.' })),
  on(A.saveUserPostesBatchFailure, (state, { error }) => ({ ...state, isSubmitting: false, error })),

  on(A.resetUserPoste, () => ({ ...initialUserPosteState })),
);
