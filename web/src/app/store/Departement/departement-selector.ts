// src/app/store/Departement/departement-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { DepartementState } from './departement.reducer';

export const selectDepartementState = createFeatureSelector<DepartementState>('departement');

export const selectdepartementData = createSelector(
  selectDepartementState,
  s => s.departementdata
);

export const selectLoading = createSelector(
  selectDepartementState,
  s => s.loading
);

export const selectTotalItems = createSelector(
  selectDepartementState,
  s => s.totalItems
);

export const selectCurrentPage = createSelector(
  selectDepartementState,
  s => s.currentPage
);

export const selectNextPage = createSelector(
  selectDepartementState,
  s => s.next
);

export const selectPreviousPage = createSelector(
  selectDepartementState,
  s => s.previous
);

// ✅ Liste sans pagination
export const selectAllDepartementWithoutPagination = createSelector(
  selectDepartementState,
  s => s.allDepartements
);