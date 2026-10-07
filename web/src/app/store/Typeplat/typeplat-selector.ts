// src/app/store/Typeplat/typeplat-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { TypeplatState } from './typeplat.reducer';

export const selectTypeplatState =
  createFeatureSelector<TypeplatState>('typeplat');

export const selecttypeplatData = createSelector(
  selectTypeplatState,
  (state) => state.typeplatdata
);

export const selectLoading = createSelector(
  selectTypeplatState,
  (state) => state.loading
);

export const selectTotalItems = createSelector(
  selectTypeplatState,
  (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
  selectTypeplatState,
  (state) => state.currentPage
);

export const selectNextPage = createSelector(
  selectTypeplatState,
  (state) => state.next
);

export const selectPreviousPage = createSelector(
  selectTypeplatState,
  (state) => state.previous
);

export const selectAllTypeplatWithoutPagination = createSelector(
  selectTypeplatState,
  (state) => state.allTypeplats
);
