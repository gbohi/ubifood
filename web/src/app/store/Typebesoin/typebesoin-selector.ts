// src/app/store/Typebesoin/typebesoin-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { TypebesoinState } from './typebesoin.reducer';

export const selectTypebesoinState =
  createFeatureSelector<TypebesoinState>('typebesoin');

export const selecttypebesoinData = createSelector(
  selectTypebesoinState,
  (state) => state.typebesoindata
);

export const selectLoading = createSelector(
  selectTypebesoinState,
  (state) => state.loading
);

export const selectTotalItems = createSelector(
  selectTypebesoinState,
  (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
  selectTypebesoinState,
  (state) => state.currentPage
);

export const selectNextPage = createSelector(
  selectTypebesoinState,
  (state) => state.next
);

export const selectPreviousPage = createSelector(
  selectTypebesoinState,
  (state) => state.previous
);

export const selectAllTypebesoinWithoutPagination = createSelector(
  selectTypebesoinState,
  (state) => state.allTypebesoins
);
