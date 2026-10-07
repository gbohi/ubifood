// src/app/store/AgencePrestataire/agence-prestataire-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { AgencePrestataireState } from './agence-prestataire.reducer';

export const selectAgencePrestataireState =
  createFeatureSelector<AgencePrestataireState>('agencePrestataire');

export const selectAgences = createSelector(
  selectAgencePrestataireState,
  s => s?.agences ?? []
);

export const selectAgencePrestataireIsLoading = createSelector(
  selectAgencePrestataireState,
  s => s?.isLoading ?? false
);

export const selectAgencePrestataireIsSubmitting = createSelector(
  selectAgencePrestataireState,
  s => s?.isSubmitting ?? false
);

export const selectAgencePrestataireError = createSelector(
  selectAgencePrestataireState,
  s => s?.error ?? null
);

export const selectAgencePrestataireSuccess = createSelector(
  selectAgencePrestataireState,
  s => s?.successMessage ?? null
);
