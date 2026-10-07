// src/app/store/Priorite/priorite-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { PrioriteState } from './priorite.reducer';

export const selectPrioriteState =
  createFeatureSelector<PrioriteState>('priorite');

export const selectprioriteData = createSelector(
  selectPrioriteState,
  (state) => state.prioritedata
);

export const selectLoading = createSelector(
  selectPrioriteState,
  (state) => state.loading
);

export const selectTotalItems = createSelector(
  selectPrioriteState,
  (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
  selectPrioriteState,
  (state) => state.currentPage
);

export const selectNextPage = createSelector(
  selectPrioriteState,
  (state) => state.next
);

export const selectPreviousPage = createSelector(
  selectPrioriteState,
  (state) => state.previous
);

export const selectAllPrioritesWithoutPagination = createSelector(
  selectPrioriteState,
  (state) => state.allPriorites
);
