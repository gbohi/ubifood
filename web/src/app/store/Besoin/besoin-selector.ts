// src/app/store/Besoin/besoin-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { BesoinState } from './besoin.reducer';

export const selectBesoinState =
  createFeatureSelector<BesoinState>('besoin');

export const selectbesoinData = createSelector(
  selectBesoinState,
  (state) => state.besoindata
);

export const selectLoading = createSelector(
  selectBesoinState,
  (state) => state.loading
);

export const selectTotalItems = createSelector(
  selectBesoinState,
  (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
  selectBesoinState,
  (state) => state.currentPage
);

export const selectNextPage = createSelector(
  selectBesoinState,
  (state) => state.next
);

export const selectPreviousPage = createSelector(
  selectBesoinState,
  (state) => state.previous
);

export const selectStatistiqueGlobale = createSelector(
  selectBesoinState,
  (state) => state.statistiqueGlobale
);

export const selectStatistiqueLoading = createSelector(
  selectBesoinState,
  (state) => state.loadingStat
);
