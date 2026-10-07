// src/app/store/Agence/agence-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { AgenceState } from './agence.reducer';

export const selectAgenceState = createFeatureSelector<AgenceState>('agence');

export const selectagenceData = createSelector(
  selectAgenceState,
  (state) => state.agencedata
);

export const selectLoading = createSelector(
  selectAgenceState,
  (state) => state.loading
);

export const selectTotalItems = createSelector(
  selectAgenceState,
  (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
  selectAgenceState,
  (state) => state.currentPage
);

export const selectNextPage = createSelector(
  selectAgenceState,
  (state) => state.next
);

export const selectPreviousPage = createSelector(
  selectAgenceState,
  (state) => state.previous
);

export const selectAllAgenceWithoutPagination = createSelector(
  selectAgenceState,
  (state) => state.allAgences
);
