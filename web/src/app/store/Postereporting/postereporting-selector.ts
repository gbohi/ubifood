// src/app/store/Postereporting/postereporting-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { PostereportingState } from './postereporting.reducer';

export const selectPostereportingState =
  createFeatureSelector<PostereportingState>('postereporting');

export const selectpostereportingData = createSelector(
  selectPostereportingState,
  (state) => state.postereportingData
);

export const selectLoading = createSelector(
  selectPostereportingState,
  (state) => state.loading
);

export const selectTotalItems = createSelector(
  selectPostereportingState,
  (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
  selectPostereportingState,
  (state) => state.currentPage
);

export const selectNextPage = createSelector(
  selectPostereportingState,
  (state) => state.next
);

export const selectPreviousPage = createSelector(
  selectPostereportingState,
  (state) => state.previous
);

export const selectAllPostereportingWithoutPagination = createSelector(
  selectPostereportingState,
  (state) => state.allPostereportings
);
