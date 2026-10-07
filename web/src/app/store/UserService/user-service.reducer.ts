// src/app/store/UserService/user-service.reducer.ts

import { createReducer, on } from '@ngrx/store';
import { UserServiceModel } from './user-service.model';
import * as A from './user-service.action';

export interface UserServiceState {
  items:          UserServiceModel[];
  isLoading:      boolean;
  isSubmitting:   boolean;
  error:          string | null;
  successMessage: string | null;
}

export const initialUserServiceState: UserServiceState = {
  items:          [],
  isLoading:      false,
  isSubmitting:   false,
  error:          null,
  successMessage: null,
};

export const userServiceReducer = createReducer(
  initialUserServiceState,

  on(A.fetchUserServices,        state => ({ ...state, isLoading: true, error: null })),
  on(A.fetchUserServicesSuccess, (state, { items }) => ({ ...state, isLoading: false, items })),
  on(A.fetchUserServicesFailure, (state, { error }) => ({ ...state, isLoading: false, error })),

  on(A.createUserService,        state => ({ ...state, isSubmitting: true, error: null, successMessage: null })),
  on(A.createUserServiceSuccess, (state, { item }) => ({
    ...state, isSubmitting: false, successMessage: 'Service ajouté.', items: [...state.items, item]
  })),
  on(A.createUserServiceFailure, (state, { error }) => ({ ...state, isSubmitting: false, error })),

  on(A.updateUserService,        state => ({ ...state, isSubmitting: true, error: null, successMessage: null })),
  on(A.updateUserServiceSuccess, (state, { item }) => ({
    ...state, isSubmitting: false, successMessage: 'Service mis à jour.',
    items: state.items.map(i => i.id === item.id ? item : i),
  })),
  on(A.updateUserServiceFailure, (state, { error }) => ({ ...state, isSubmitting: false, error })),

  on(A.deleteUserService,        state => ({ ...state, isSubmitting: true, error: null, successMessage: null })),
  on(A.deleteUserServiceSuccess, (state, { id }) => ({
    ...state, isSubmitting: false, successMessage: 'Service supprimé.',
    items: state.items.filter(i => i.id !== id),
  })),
  on(A.deleteUserServiceFailure, (state, { error }) => ({ ...state, isSubmitting: false, error })),

  on(A.saveUserServicesBatch,        state => ({ ...state, isSubmitting: true, error: null, successMessage: null })),
  on(A.saveUserServicesBatchSuccess, state => ({ ...state, isSubmitting: false, successMessage: 'Services enregistrés.' })),
  on(A.saveUserServicesBatchFailure, (state, { error }) => ({ ...state, isSubmitting: false, error })),

  on(A.resetUserService, () => ({ ...initialUserServiceState })),
);
