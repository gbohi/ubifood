import { createAction, props } from '@ngrx/store';
import { SimulationListResponse } from './dashboardsimulation.model';

export const fetchDashboardSimulation = createAction(
  '[DashboardSimulation] Fetch',
  props<{ annee_debut?: number; annee_fin?: number; salaire_min?: number; salaire_max?: number }>()
);

export const fetchDashboardSimulationSuccess = createAction(
  '[DashboardSimulation] Fetch Success',
  props<{ data: SimulationListResponse }>()
);

export const fetchDashboardSimulationFailure = createAction(
  '[DashboardSimulation] Fetch Failure',
  props<{ error: any }>()
);