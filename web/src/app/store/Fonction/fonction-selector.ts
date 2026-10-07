import { createFeatureSelector, createSelector } from '@ngrx/store';
import { FonctionState } from './fonction.reducer';

export const selectFonctionState = createFeatureSelector<FonctionState>('fonction');

export const selectfonctionData = createSelector(
    selectFonctionState,
    (state) => state.fonctionData
);

export const selectLoading = createSelector(
    selectFonctionState,
    (state) => state.loading
);

export const selectTotalItems = createSelector(
    selectFonctionState,
    (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
    selectFonctionState,
    (state) => state.currentPage
);

export const selectNextPage = createSelector(
    selectFonctionState,
    (state) => state.next
);

export const selectPreviousPage = createSelector(
    selectFonctionState,
    (state) => state.previous
);

export const selectAllFonctionWithoutPagination = createSelector(
    selectFonctionState,
    (state) => state.allFonctions
  );