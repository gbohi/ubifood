// src/app/store/PlatCategoriesalarie/plat-categoriesalarie.reducer.ts

import { createReducer, on } from '@ngrx/store';
import { PlatCategoriesalarieModel } from './plat-categoriesalarie.model';
import * as PlatCategoriesalarieActions from './plat-categoriesalarie.action';

export interface PlatCategoriesalarieState {
  tarifs:         PlatCategoriesalarieModel[];
  isLoading:      boolean;
  isSubmitting:   boolean;
  error:          string | null;
  successMessage: string | null;
}

export const initialPlatCategoriesalarieState: PlatCategoriesalarieState = {
  tarifs:         [],
  isLoading:      false,
  isSubmitting:   false,
  error:          null,
  successMessage: null,
};

export const platCategoriesalarieReducer = createReducer(
  initialPlatCategoriesalarieState,

  // ── Fetch ──────────────────────────────────────────────────
  on(PlatCategoriesalarieActions.fetchPlatCategoriesalarie, state => ({
    ...state, isLoading: true, error: null
  })),
  on(PlatCategoriesalarieActions.fetchPlatCategoriesalarieSuccess, (state, { tarifs }) => ({
    ...state, isLoading: false, tarifs
  })),
  on(PlatCategoriesalarieActions.fetchPlatCategoriesalarieFailure, (state, { error }) => ({
    ...state, isLoading: false, error
  })),

  // ── Create ─────────────────────────────────────────────────
  on(PlatCategoriesalarieActions.createPlatCategoriesalarie, state => ({
    ...state, isSubmitting: true, error: null, successMessage: null
  })),
  on(PlatCategoriesalarieActions.createPlatCategoriesalarieSuccess, (state, { tarif }) => ({
    ...state,
    isSubmitting:   false,
    successMessage: 'Tarif ajouté avec succès.',
    tarifs:         [...state.tarifs, tarif],
  })),
  on(PlatCategoriesalarieActions.createPlatCategoriesalarieFailure, (state, { error }) => ({
    ...state, isSubmitting: false, error
  })),

  // ── Update ─────────────────────────────────────────────────
  on(PlatCategoriesalarieActions.updatePlatCategoriesalarie, state => ({
    ...state, isSubmitting: true, error: null, successMessage: null
  })),
  on(PlatCategoriesalarieActions.updatePlatCategoriesalarieSuccess, (state, { tarif }) => ({
    ...state,
    isSubmitting:   false,
    successMessage: 'Tarif mis à jour avec succès.',
    tarifs:         state.tarifs.map(t => t.id === tarif.id ? tarif : t),
  })),
  on(PlatCategoriesalarieActions.updatePlatCategoriesalarieFailure, (state, { error }) => ({
    ...state, isSubmitting: false, error
  })),

  // ── Delete ─────────────────────────────────────────────────
  on(PlatCategoriesalarieActions.deletePlatCategoriesalarie, state => ({
    ...state, isSubmitting: true, error: null, successMessage: null
  })),
  on(PlatCategoriesalarieActions.deletePlatCategoriesalarieSuccess, (state, { id }) => ({
    ...state,
    isSubmitting:   false,
    successMessage: 'Tarif supprimé avec succès.',
    tarifs:         state.tarifs.filter(t => t.id !== id),
  })),
  on(PlatCategoriesalarieActions.deletePlatCategoriesalarieFailure, (state, { error }) => ({
    ...state, isSubmitting: false, error
  })),

  // ── Batch ──────────────────────────────────────────────────
  on(PlatCategoriesalarieActions.savePlatCategoriesalariesBatch, state => ({
    ...state, isSubmitting: true, error: null, successMessage: null
  })),
  on(PlatCategoriesalarieActions.savePlatCategoriesalariesBatchSuccess, state => ({
    ...state, isSubmitting: false, successMessage: 'Tarifs enregistrés avec succès.',
  })),
  on(PlatCategoriesalarieActions.savePlatCategoriesalariesBatchFailure, (state, { error }) => ({
    ...state, isSubmitting: false, error
  })),

  // ── Reset ──────────────────────────────────────────────────
  on(PlatCategoriesalarieActions.resetPlatCategoriesalarie, () => ({
    ...initialPlatCategoriesalarieState
  })),
);
