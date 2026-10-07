import { createFeatureSelector, createSelector } from '@ngrx/store';
import { PrestataireState } from './prestataire.reducer';

export const selectPrestataireState = createFeatureSelector<PrestataireState>('prestataire');

export const selectprestataireData = createSelector(
    selectPrestataireState,
    (state) => state.prestataireData
);

export const selectLoading = createSelector(
    selectPrestataireState,
    (state) => state.loading
);

export const selectTotalItems = createSelector(
    selectPrestataireState,
    (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
    selectPrestataireState,
    (state) => state.currentPage
);

export const selectNextPage = createSelector(
    selectPrestataireState,
    (state) => state.next
);

export const selectPreviousPage = createSelector(
    selectPrestataireState,
    (state) => state.previous
);

export const selectAllPrestataireWithoutPagination = createSelector(
    selectPrestataireState,
    (state) => state.allPrestataires
  );