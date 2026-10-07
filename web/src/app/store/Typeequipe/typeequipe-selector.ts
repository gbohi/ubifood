// src/app/store/Typeequipe/typeequipe-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { TypeequipeState } from './typeequipe.reducer';

export const selectTypeequipeState =
  createFeatureSelector<TypeequipeState>('typeequipe');

export const selecttypeequipeData = createSelector(
  selectTypeequipeState,
  (state) => state.typeequipedata
);

export const selectLoading = createSelector(
  selectTypeequipeState,
  (state) => state.loading
);

export const selectTotalItems = createSelector(
  selectTypeequipeState,
  (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
  selectTypeequipeState,
  (state) => state.currentPage
);

export const selectNextPage = createSelector(
  selectTypeequipeState,
  (state) => state.next
);

export const selectPreviousPage = createSelector(
  selectTypeequipeState,
  (state) => state.previous
);

export const selectAllTypeequipeWithoutPagination = createSelector(
  selectTypeequipeState,
  (state) => state.allTypeequipes
);
