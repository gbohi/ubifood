import { createReducer, on } from '@ngrx/store';
import { 
  fetchDashboardEntretien, 
  fetchDashboardEntretienSuccess,
  fetchDashboardEntretienFailure
} from './dashboardentretienvehicule.action';
import { DashboardEntretienVehiculeResponse } from './dashboardentretienvehicule.model';

export interface DashboardEntretienVehiculeState {
  data: DashboardEntretienVehiculeResponse | null;
  loading: boolean;
  error: any;
}

export const initialState: DashboardEntretienVehiculeState = {
  data: null,
  loading: false,
  error: null,
};

export const dashboardentretienvehiculeReducer = createReducer(
  initialState,

  // Début du fetch
  on(fetchDashboardEntretien, state => ({
    ...state,
    loading: true,
    error: null
  })),

  // Succès : on stocke tout l'objet data
  on(fetchDashboardEntretienSuccess, (state, { data }) => ({
    ...state,
    data,
    loading: false,
  })),

  // Échec : on stocke l'erreur
  on(fetchDashboardEntretienFailure, (state, { error }) => ({
    ...state,
    error,
    loading: false,
  }))
);
