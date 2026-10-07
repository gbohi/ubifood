// src/app/store/AgencePrestataire/agence-prestataire.reducer.ts

import { createReducer, on } from '@ngrx/store';
import { AgencePrestataireModel } from './agence-prestataire.model';
import * as AgencePrestataireActions from './agence-prestataire.action';

export interface AgencePrestataireState {
  agences:        AgencePrestataireModel[];
  isLoading:      boolean;
  isSubmitting:   boolean;
  error:          string | null;
  successMessage: string | null;
}

export const initialAgencePrestataireState: AgencePrestataireState = {
  agences:        [],
  isLoading:      false,
  isSubmitting:   false,
  error:          null,
  successMessage: null,
};

export const agencePrestataireReducer = createReducer(
  initialAgencePrestataireState,

  // ── Fetch ──────────────────────────────────────────────────
  on(AgencePrestataireActions.fetchAgencePrestataire, state => ({
    ...state, isLoading: true, error: null
  })),
  on(AgencePrestataireActions.fetchAgencePrestataireSuccess, (state, { agences }) => ({
    ...state, isLoading: false, agences
  })),
  on(AgencePrestataireActions.fetchAgencePrestataireFailure, (state, { error }) => ({
    ...state, isLoading: false, error
  })),

  // ── Create ─────────────────────────────────────────────────
  on(AgencePrestataireActions.createAgencePrestataire, state => ({
    ...state, isSubmitting: true, error: null, successMessage: null
  })),
  on(AgencePrestataireActions.createAgencePrestataireSuccess, (state, { agence }) => ({
    ...state,
    isSubmitting:   false,
    successMessage: 'Agence ajoutée avec succès.',
    agences:        [...state.agences, agence],
  })),
  on(AgencePrestataireActions.createAgencePrestataireFailure, (state, { error }) => ({
    ...state, isSubmitting: false, error
  })),

  // ── Update ─────────────────────────────────────────────────
  on(AgencePrestataireActions.updateAgencePrestataire, state => ({
    ...state, isSubmitting: true, error: null, successMessage: null
  })),
  on(AgencePrestataireActions.updateAgencePrestataireSuccess, (state, { agence }) => ({
    ...state,
    isSubmitting:   false,
    successMessage: 'Agence mise à jour avec succès.',
    agences:        state.agences.map(a => a.id === agence.id ? agence : a),
  })),
  on(AgencePrestataireActions.updateAgencePrestataireFailure, (state, { error }) => ({
    ...state, isSubmitting: false, error
  })),

  // ── Delete ─────────────────────────────────────────────────
  on(AgencePrestataireActions.deleteAgencePrestataire, state => ({
    ...state, isSubmitting: true, error: null, successMessage: null
  })),
  on(AgencePrestataireActions.deleteAgencePrestataireSuccess, (state, { id }) => ({
    ...state,
    isSubmitting:   false,
    successMessage: 'Agence supprimée avec succès.',
    agences:        state.agences.filter(a => a.id !== id),
  })),
  on(AgencePrestataireActions.deleteAgencePrestataireFailure, (state, { error }) => ({
    ...state, isSubmitting: false, error
  })),

  // ── Batch ──────────────────────────────────────────────────
  on(AgencePrestataireActions.saveAgencePrestatairesBatch, state => ({
    ...state, isSubmitting: true, error: null, successMessage: null
  })),
  on(AgencePrestataireActions.saveAgencePrestatairesBatchSuccess, state => ({
    ...state, isSubmitting: false, successMessage: 'Agences enregistrées avec succès.',
  })),
  on(AgencePrestataireActions.saveAgencePrestatairesBatchFailure, (state, { error }) => ({
    ...state, isSubmitting: false, error
  })),

  // ── Reset ──────────────────────────────────────────────────
  on(AgencePrestataireActions.resetAgencePrestataire, () => ({
    ...initialAgencePrestataireState
  })),
);
