// src/app/store/Categoriecomptable/categoriecomptable-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { CategoriecomptableState } from './categoriecomptable.reducer';

export const selectCategoriecomptableState =
  createFeatureSelector<CategoriecomptableState>('categoriecomptable');

export const selectcategoriecomptableData = createSelector(
  selectCategoriecomptableState,
  (state) => state.categoriecomptableData
);

export const selectLoading = createSelector(
  selectCategoriecomptableState,
  (state) => state.loading
);

export const selectTotalItems = createSelector(
  selectCategoriecomptableState,
  (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
  selectCategoriecomptableState,
  (state) => state.currentPage
);

export const selectNextPage = createSelector(
  selectCategoriecomptableState,
  (state) => state.next
);

export const selectPreviousPage = createSelector(
  selectCategoriecomptableState,
  (state) => state.previous
);

export const selectAllCategoriecomptableWithoutPagination = createSelector(
  selectCategoriecomptableState,
  (state) => state.allCategoriecomptables
);
