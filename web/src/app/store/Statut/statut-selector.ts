// src/app/store/Statut/statut-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { StatutState } from './statut.reducer';

export const selectStatutState =
  createFeatureSelector<StatutState>('statut');

export const selectstatutData = createSelector(
  selectStatutState,
  (state) => state.statutdata
);

export const selectLoading = createSelector(
  selectStatutState,
  (state) => state.loading
);

export const selectTotalItems = createSelector(
  selectStatutState,
  (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
  selectStatutState,
  (state) => state.currentPage
);

export const selectNextPage = createSelector(
  selectStatutState,
  (state) => state.next
);

export const selectPreviousPage = createSelector(
  selectStatutState,
  (state) => state.previous
);

// ⚠️ Nom corrigé : selectAllSatutWithoutPagination → selectAllStatutWithoutPagination
export const selectAllSatutWithoutPagination = createSelector(
  selectStatutState,
  (state) => state.allStatuts
);
