import { createFeatureSelector, createSelector } from '@ngrx/store';
import { DashboardSimulationState } from './dashboardsimulation.reducer';

// Sélecteur de l'état global
export const selectDashboardSimulationState = createFeatureSelector<DashboardSimulationState>('dashboardsimulation');

// Accès brut à l'objet complet retourné par l'API
export const selectDashboardSimulationData = createSelector(
  selectDashboardSimulationState,
  (state) => state.data
);

// Liste des simulations
export const selectSimulationList = createSelector(
  selectDashboardSimulationData,
  (data) => data?.results?.results ?? []
);

// Chargement
export const selectDashboardSimulationLoading = createSelector(
  selectDashboardSimulationState,
  (state) => state.loading
);

// Erreur
export const selectDashboardSimulationError = createSelector(
  selectDashboardSimulationState,
  (state) => state.error
);

// Total global
export const selectTotalGlobal = createSelector(
  selectDashboardSimulationData,
  (data) => data?.results?.total_global ?? null
);

// Total par année
export const selectTotalParAnnee = createSelector(
  selectDashboardSimulationData,
  (data) => data?.results?.total_par_annee ?? {}
);

// ✅ Nombre total de simulations (correctement typé comme number)
export const selectDashboardSimulationCount = createSelector(
  selectDashboardSimulationData,
  (data): number => data?.count ?? 0
);