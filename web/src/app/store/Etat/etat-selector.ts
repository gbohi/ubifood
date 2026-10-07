import { createFeatureSelector, createSelector } from '@ngrx/store';
import { EtatState } from './etat.reducer';

export const selectEtatState = createFeatureSelector<EtatState>('etat');

export const selectetatData = createSelector(
    selectEtatState,
    (state) => state.etatdata
);

export const selectLoading = createSelector(
    selectEtatState,
    (state) => state.loading
);

export const selectTotalItems = createSelector(
    selectEtatState,
    (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
    selectEtatState,
    (state) => state.currentPage
);

export const selectNextPage = createSelector(
    selectEtatState,
    (state) => state.next
);

export const selectPreviousPage = createSelector(
    selectEtatState,
    (state) => state.previous
);

export const selectAllEtatWithoutPagination = createSelector(
    selectEtatState,
    (state) => state.allEtats
  );