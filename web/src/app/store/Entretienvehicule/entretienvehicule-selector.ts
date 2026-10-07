import { createFeatureSelector, createSelector } from '@ngrx/store';
import { EntretienvehiculeState } from './entretienvehicule.reducer';

export const selectEntretienvehiculeState = createFeatureSelector<EntretienvehiculeState>('entretienvehicule');

export const selectentretienvehiculeData = createSelector(
    selectEntretienvehiculeState,
    (state) => state.entretienvehiculeData
);

export const selectLoading = createSelector(
    selectEntretienvehiculeState,
    (state) => state.loading
);

export const selectTotalItems = createSelector(
    selectEntretienvehiculeState,
    (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
    selectEntretienvehiculeState,
    (state) => state.currentPage
);

export const selectNextPage = createSelector(
    selectEntretienvehiculeState,
    (state) => state.next
);

export const selectPreviousPage = createSelector(
    selectEntretienvehiculeState,
    (state) => state.previous
);

export const selectAllEntretienvehiculeWithoutPagination = createSelector(
    selectEntretienvehiculeState,
    (state) => state.allEntretienvehicules
  );