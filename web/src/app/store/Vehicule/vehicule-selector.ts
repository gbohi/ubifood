// src/app/store/Vehicule/vehicule-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { VehiculeState } from './vehicule.reducer';

export const selectVehiculeState =
  createFeatureSelector<VehiculeState>('vehicule');

export const selectvehiculeData = createSelector(
  selectVehiculeState,
  (state) => state.vehiculeData
);

export const selectLoading = createSelector(
  selectVehiculeState,
  (state) => state.loading
);

export const selectTotalItems = createSelector(
  selectVehiculeState,
  (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
  selectVehiculeState,
  (state) => state.currentPage
);

export const selectNextPage = createSelector(
  selectVehiculeState,
  (state) => state.next
);

export const selectPreviousPage = createSelector(
  selectVehiculeState,
  (state) => state.previous
);

export const selectAllVehiculeWithoutPagination = createSelector(
  selectVehiculeState,
  (state) => state.allVehicules
);
