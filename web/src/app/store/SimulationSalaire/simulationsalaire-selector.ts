import { createFeatureSelector, createSelector } from '@ngrx/store';
import { SimulationsalaireState } from './simulationsalaire.reducer';

export const selectSimulationsalaireState = createFeatureSelector<SimulationsalaireState>('simulationsalaire');

export const selectsimulationsalaireData = createSelector(
    selectSimulationsalaireState,
    (state) => state.simulationsalaireData
);

export const selectLoading = createSelector(
    selectSimulationsalaireState,
    (state) => state.loading
);

export const selectTotalItems = createSelector(
    selectSimulationsalaireState,
    (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
    selectSimulationsalaireState,
    (state) => state.currentPage
);

export const selectNextPage = createSelector(
    selectSimulationsalaireState,
    (state) => state.next
);

export const selectPreviousPage = createSelector(
    selectSimulationsalaireState,
    (state) => state.previous
);

export const selectAllSimulationsalaireWithoutPagination = createSelector(
    selectSimulationsalaireState,
    (state) => state.allSimulationsalaires
  );