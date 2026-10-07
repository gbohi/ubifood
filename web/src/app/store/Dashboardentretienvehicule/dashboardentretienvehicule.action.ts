import { createAction, props } from '@ngrx/store';
import { DashboardEntretienVehiculeResponse } from './dashboardentretienvehicule.model';

export const fetchDashboardEntretien = createAction(
  '[DashboardEntretienVehicule] Fetch',
  props<{ annee: number; agence_id?: number; immatriculation?: string }>()
);

export const fetchDashboardEntretienSuccess = createAction(
  '[DashboardEntretienVehicule] Fetch Success',
  props<{ data: DashboardEntretienVehiculeResponse }>()
);

export const fetchDashboardEntretienFailure = createAction(
  '[DashboardEntretienVehicule] Fetch Failure',
  props<{ error: any }>()
);
