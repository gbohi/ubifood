// src/app/store/Comptecomptable/comptecomptable-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { ComptecomptableState } from './comptecomptable.reducer';

export const selectComptecomptableState =
  createFeatureSelector<ComptecomptableState>('comptecomptable');

export const selectcomptecomptableData = createSelector(
  selectComptecomptableState,
  (state) => state.comptecomptableData
);

export const selectLoading = createSelector(
  selectComptecomptableState,
  (state) => state.loading
);

export const selectTotalItems = createSelector(
  selectComptecomptableState,
  (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
  selectComptecomptableState,
  (state) => state.currentPage
);

export const selectNextPage = createSelector(
  selectComptecomptableState,
  (state) => state.next
);

export const selectPreviousPage = createSelector(
  selectComptecomptableState,
  (state) => state.previous
);

export const selectAllComptecomptableWithoutPagination = createSelector(
  selectComptecomptableState,
  (state) => state.allComptecomptables
);
