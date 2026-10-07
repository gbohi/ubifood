import { createFeatureSelector, createSelector } from '@ngrx/store';
import { DashboardEntretienVehiculeState } from './dashboardentretienvehicule.reducer';

export const selectDashboardEntretienVehiculeState = createFeatureSelector<DashboardEntretienVehiculeState>('dashboardentretienvehicule');

export const selectDashboardEntretienData = createSelector(
  selectDashboardEntretienVehiculeState,
  (state) => state.data
);

export const selectDashboardEntretienLoading = createSelector(
  selectDashboardEntretienVehiculeState,
  (state) => state.loading
);

export const selectDashboardEntretienError = createSelector(
  selectDashboardEntretienVehiculeState,
  (state) => state.error
);

export const selectDashboardDonnees = createSelector(
  selectDashboardEntretienVehiculeState,
  (state) => state.data?.donnees || []
);

export const selectDashboardTotalGlobal = createSelector(
  selectDashboardEntretienVehiculeState,
  (state) => state.data?.total_global || 0
);

export const selectDashboardTotalGlobalMois = createSelector(
  selectDashboardEntretienVehiculeState,
  (state) => state.data?.total_global_mois || {}
);

