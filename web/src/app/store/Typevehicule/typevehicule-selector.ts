// src/app/store/Typevehicule/typevehicule-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { TypevehiculeState } from './typevehicule.reducer';

export const selectTypevehiculeState =
  createFeatureSelector<TypevehiculeState>('typevehicule');

export const selecttypevehiculeData = createSelector(
  selectTypevehiculeState,
  (state) => state.typevehiculedata
);

export const selectLoading = createSelector(
  selectTypevehiculeState,
  (state) => state.loading
);

export const selectTotalItems = createSelector(
  selectTypevehiculeState,
  (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
  selectTypevehiculeState,
  (state) => state.currentPage
);

export const selectNextPage = createSelector(
  selectTypevehiculeState,
  (state) => state.next
);

export const selectPreviousPage = createSelector(
  selectTypevehiculeState,
  (state) => state.previous
);

export const selectAllTypevehiculeWithoutPagination = createSelector(
  selectTypevehiculeState,
  (state) => state.allTypevehicules
);
