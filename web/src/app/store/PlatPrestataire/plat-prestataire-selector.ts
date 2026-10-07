// src/app/store/PlatPrestataire/plat-prestataire-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { PlatPrestataireState } from './plat-prestataire.reducer';

export const selectPlatPrestataireState =
  createFeatureSelector<PlatPrestataireState>('platPrestataire');

export const selectTarifs = createSelector(
  selectPlatPrestataireState,
  s => s?.tarifs ?? []
);

export const selectPlatPrestataireIsLoading = createSelector(
  selectPlatPrestataireState,
  s => s?.isLoading ?? false
);

export const selectPlatPrestataireIsSubmitting = createSelector(
  selectPlatPrestataireState,
  s => s?.isSubmitting ?? false
);

export const selectPlatPrestataireError = createSelector(
  selectPlatPrestataireState,
  s => s?.error ?? null
);

export const selectPlatPrestataireSuccess = createSelector(
  selectPlatPrestataireState,
  s => s?.successMessage ?? null
);
