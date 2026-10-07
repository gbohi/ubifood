// src/app/store/Classecomptable/classecomptable-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { ClassecomptableState } from './classecomptable.reducer';

export const selectClassecomptableState =
  createFeatureSelector<ClassecomptableState>('classecomptable');

export const selectclassecomptableData = createSelector(
  selectClassecomptableState,
  (state) => state.classecomptableData
);

export const selectLoading = createSelector(
  selectClassecomptableState,
  (state) => state.loading
);

export const selectTotalItems = createSelector(
  selectClassecomptableState,
  (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
  selectClassecomptableState,
  (state) => state.currentPage
);

export const selectNextPage = createSelector(
  selectClassecomptableState,
  (state) => state.next
);

export const selectPreviousPage = createSelector(
  selectClassecomptableState,
  (state) => state.previous
);

export const selectAllClassecomptableWithoutPagination = createSelector(
  selectClassecomptableState,
  (state) => state.allClassecomptables
);
