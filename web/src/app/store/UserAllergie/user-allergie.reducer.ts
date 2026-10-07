// src/app/store/UserAllergie/user-allergie.reducer.ts

import { createReducer, on } from '@ngrx/store';
import { UserAllergieModel } from './user-allergie.model';
import * as A from './user-allergie.action';

export interface UserAllergieState {
  items:          UserAllergieModel[];
  isLoading:      boolean;
  isSubmitting:   boolean;
  error:          string | null;
  successMessage: string | null;
}

export const initialUserAllergieState: UserAllergieState = {
  items:          [],
  isLoading:      false,
  isSubmitting:   false,
  error:          null,
  successMessage: null,
};

export const userAllergieReducer = createReducer(
  initialUserAllergieState,

  on(A.fetchUserAllergies,        state => ({ ...state, isLoading: true, error: null })),
  on(A.fetchUserAllergiesSuccess, (state, { items }) => ({ ...state, isLoading: false, items })),
  on(A.fetchUserAllergiesFailure, (state, { error }) => ({ ...state, isLoading: false, error })),

  on(A.createUserAllergie,        state => ({ ...state, isSubmitting: true, error: null, successMessage: null })),
  on(A.createUserAllergieSuccess, (state, { item }) => ({
    ...state, isSubmitting: false, successMessage: 'Allergie ajoutée.', items: [...state.items, item]
  })),
  on(A.createUserAllergieFailure, (state, { error }) => ({ ...state, isSubmitting: false, error })),

  on(A.updateUserAllergie,        state => ({ ...state, isSubmitting: true, error: null, successMessage: null })),
  on(A.updateUserAllergieSuccess, (state, { item }) => ({
    ...state, isSubmitting: false, successMessage: 'Allergie mise à jour.',
    items: state.items.map(i => i.id === item.id ? item : i),
  })),
  on(A.updateUserAllergieFailure, (state, { error }) => ({ ...state, isSubmitting: false, error })),

  on(A.deleteUserAllergie,        state => ({ ...state, isSubmitting: true, error: null, successMessage: null })),
  on(A.deleteUserAllergieSuccess, (state, { id }) => ({
    ...state, isSubmitting: false, successMessage: 'Allergie supprimée.',
    items: state.items.filter(i => i.id !== id),
  })),
  on(A.deleteUserAllergieFailure, (state, { error }) => ({ ...state, isSubmitting: false, error })),

  on(A.saveUserAllergiesBatch,        state => ({ ...state, isSubmitting: true, error: null, successMessage: null })),
  on(A.saveUserAllergiesBatchSuccess, state => ({ ...state, isSubmitting: false, successMessage: 'Allergies enregistrées.' })),
  on(A.saveUserAllergiesBatchFailure, (state, { error }) => ({ ...state, isSubmitting: false, error })),

  on(A.resetUserAllergie, () => ({ ...initialUserAllergieState })),
);
