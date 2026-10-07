// src/app/store/PlatPrestataire/plat-prestataire.reducer.ts

import { createReducer, on } from '@ngrx/store';
import { PlatPrestataireModel } from './plat-prestataire.model';
import * as PlatPrestataireActions from './plat-prestataire.action';

export interface PlatPrestataireState {
  tarifs:        PlatPrestataireModel[];
  isLoading:     boolean;
  isSubmitting:  boolean;
  error:         string | null;
  successMessage: string | null;
}

export const initialPlatPrestataireState: PlatPrestataireState = {
  tarifs:         [],
  isLoading:      false,
  isSubmitting:   false,
  error:          null,
  successMessage: null,
};

export const platPrestataireReducer = createReducer(
  initialPlatPrestataireState,

  // ── Fetch ──────────────────────────────────────────────────
  on(PlatPrestataireActions.fetchPlatPrestataire, state => ({
    ...state, isLoading: true, error: null
  })),
  on(PlatPrestataireActions.fetchPlatPrestataireSuccess, (state, { tarifs }) => ({
    ...state, isLoading: false, tarifs
  })),
  on(PlatPrestataireActions.fetchPlatPrestataireFailure, (state, { error }) => ({
    ...state, isLoading: false, error
  })),

  // ── Create ─────────────────────────────────────────────────
  on(PlatPrestataireActions.createPlatPrestataire, state => ({
    ...state, isSubmitting: true, error: null, successMessage: null
  })),
  on(PlatPrestataireActions.createPlatPrestataireSuccess, (state, { tarif }) => ({
    ...state,
    isSubmitting:   false,
    successMessage: 'Tarif ajouté avec succès.',
    tarifs:         [...state.tarifs, tarif],
  })),
  on(PlatPrestataireActions.createPlatPrestataireFailure, (state, { error }) => ({
    ...state, isSubmitting: false, error
  })),

  // ── Update ─────────────────────────────────────────────────
  on(PlatPrestataireActions.updatePlatPrestataire, state => ({
    ...state, isSubmitting: true, error: null, successMessage: null
  })),
  on(PlatPrestataireActions.updatePlatPrestataireSuccess, (state, { tarif }) => ({
    ...state,
    isSubmitting:   false,
    successMessage: 'Tarif mis à jour avec succès.',
    tarifs:         state.tarifs.map(t => t.id === tarif.id ? tarif : t),
  })),
  on(PlatPrestataireActions.updatePlatPrestataireFailure, (state, { error }) => ({
    ...state, isSubmitting: false, error
  })),

  // ── Delete ─────────────────────────────────────────────────
  on(PlatPrestataireActions.deletePlatPrestataire, state => ({
    ...state, isSubmitting: true, error: null, successMessage: null
  })),
  on(PlatPrestataireActions.deletePlatPrestataireSuccess, (state, { id }) => ({
    ...state,
    isSubmitting:   false,
    successMessage: 'Tarif supprimé avec succès.',
    tarifs:         state.tarifs.filter(t => t.id !== id),
  })),
  on(PlatPrestataireActions.deletePlatPrestataireFailure, (state, { error }) => ({
    ...state, isSubmitting: false, error
  })),

  // ── Batch ──────────────────────────────────────────────────
  on(PlatPrestataireActions.savePlatPrestatairesBatch, state => ({
    ...state, isSubmitting: true, error: null, successMessage: null
  })),
  on(PlatPrestataireActions.savePlatPrestatairesBatchSuccess, (state, { prestataireId }) => ({
    ...state,
    isSubmitting:   false,
    successMessage: 'Tarifs enregistrés avec succès.',
  })),
  on(PlatPrestataireActions.savePlatPrestatairesBatchFailure, (state, { error }) => ({
    ...state, isSubmitting: false, error
  })),

  // ── Reset ──────────────────────────────────────────────────
  on(PlatPrestataireActions.resetPlatPrestataire, () => ({
    ...initialPlatPrestataireState
  })),
);
