// src/app/store/UserCategoriesalarie/user-categoriesalarie.reducer.ts

import { createReducer, on } from '@ngrx/store';
import { UserCategoriesalarieModel } from './user-categoriesalarie.model';
import * as A from './user-categoriesalarie.action';

export interface UserCategoriesalarieState {
  items:          UserCategoriesalarieModel[];
  isLoading:      boolean;
  isSubmitting:   boolean;
  error:          string | null;
  successMessage: string | null;
}

export const initialUserCategoriesalarieState: UserCategoriesalarieState = {
  items:          [],
  isLoading:      false,
  isSubmitting:   false,
  error:          null,
  successMessage: null,
};

export const userCategoriesalarieReducer = createReducer(
  initialUserCategoriesalarieState,

  on(A.fetchUserCategoriesalaries,        state => ({ ...state, isLoading: true, error: null })),
  on(A.fetchUserCategoriesalariesSuccess, (state, { items }) => ({ ...state, isLoading: false, items })),
  on(A.fetchUserCategoriesalariesFailure, (state, { error }) => ({ ...state, isLoading: false, error })),

  on(A.createUserCategoriesalarie,        state => ({ ...state, isSubmitting: true, error: null, successMessage: null })),
  on(A.createUserCategoriesalarieSuccess, (state, { item }) => ({
    ...state, isSubmitting: false, successMessage: 'Catégorie ajoutée.', items: [...state.items, item]
  })),
  on(A.createUserCategoriesalarieFailure, (state, { error }) => ({ ...state, isSubmitting: false, error })),

  on(A.updateUserCategoriesalarie,        state => ({ ...state, isSubmitting: true, error: null, successMessage: null })),
  on(A.updateUserCategoriesalarieSuccess, (state, { item }) => ({
    ...state, isSubmitting: false, successMessage: 'Catégorie mise à jour.',
    items: state.items.map(i => i.id === item.id ? item : i),
  })),
  on(A.updateUserCategoriesalarieFailure, (state, { error }) => ({ ...state, isSubmitting: false, error })),

  on(A.deleteUserCategoriesalarie,        state => ({ ...state, isSubmitting: true, error: null, successMessage: null })),
  on(A.deleteUserCategoriesalarieSuccess, (state, { id }) => ({
    ...state, isSubmitting: false, successMessage: 'Catégorie supprimée.',
    items: state.items.filter(i => i.id !== id),
  })),
  on(A.deleteUserCategoriesalarieFailure, (state, { error }) => ({ ...state, isSubmitting: false, error })),

  on(A.saveUserCategoriesalariesBatch,        state => ({ ...state, isSubmitting: true, error: null, successMessage: null })),
  on(A.saveUserCategoriesalariesBatchSuccess, state => ({ ...state, isSubmitting: false, successMessage: 'Catégories enregistrées.' })),
  on(A.saveUserCategoriesalariesBatchFailure, (state, { error }) => ({ ...state, isSubmitting: false, error })),

  on(A.resetUserCategoriesalarie, () => ({ ...initialUserCategoriesalarieState })),
);
