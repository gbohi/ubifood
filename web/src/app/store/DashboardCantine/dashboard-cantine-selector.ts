// src/app/store/DashboardCantine/dashboard-cantine-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { DashboardCantineState } from './dashboard-cantine.reducer';
import {
  KpisCantine, ParMoisItem, TopPlatItem, ParAgenceItem,
  ParTypeEquipeItem, ParTypePlatItem, MenuRecentItem,
  EvolutionHebdoItem, EvolutionParDateItem, FactFournisseur, FactEmploye,
} from './dashboard-cantine.model';

export const selectDashboardCantineState =
  createFeatureSelector<DashboardCantineState>('dashboardCantine');

export const selectDashboardCantineData    = createSelector(selectDashboardCantineState, s => s.data);
export const selectDashboardCantineLoading = createSelector(selectDashboardCantineState, s => s.loading);
export const selectDashboardCantineError   = createSelector(selectDashboardCantineState, s => s.error);

export const selectKpis = createSelector(
  selectDashboardCantineData, (d): KpisCantine | null => d?.kpis ?? null
);
export const selectParMois = createSelector(
  selectDashboardCantineData, (d): { [mois: number]: ParMoisItem } | null => d?.par_mois ?? null
);
export const selectTopPlats = createSelector(
  selectDashboardCantineData, (d): TopPlatItem[] | null => d?.top_plats ?? null
);
export const selectParAgence = createSelector(
  selectDashboardCantineData, (d): ParAgenceItem[] | null => d?.par_agence ?? null
);
export const selectParTypeEquipe = createSelector(
  selectDashboardCantineData, (d): ParTypeEquipeItem[] | null => d?.par_typeequipe ?? null
);
export const selectParTypePlat = createSelector(
  selectDashboardCantineData, (d): ParTypePlatItem[] | null => d?.par_typeplat ?? null
);
export const selectMenusRecents = createSelector(
  selectDashboardCantineData, (d): MenuRecentItem[] | null => d?.menus_recents ?? null
);
export const selectEvolutionHebdo = createSelector(
  selectDashboardCantineData, (d): EvolutionHebdoItem[] | null => d?.evolution_hebdo ?? null
);

export const selectEvolutionParDate = createSelector(
  selectDashboardCantineData,
  (d): EvolutionParDateItem[] | null => d?.evolution_par_date ?? null
);

// ── Facturation ───────────────────────────────────────────────
export const selectFactFournisseur = createSelector(
  selectDashboardCantineData, (d): FactFournisseur | null => d?.fact_fournisseur ?? null
);
export const selectFactEmploye = createSelector(
  selectDashboardCantineData, (d): FactEmploye | null => d?.fact_employe ?? null
);
