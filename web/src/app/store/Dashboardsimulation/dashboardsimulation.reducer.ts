import { createReducer, on } from '@ngrx/store';
import { 
  fetchDashboardSimulation, 
  fetchDashboardSimulationSuccess,
  fetchDashboardSimulationFailure
} from './dashboardsimulation.action';
import { SimulationListResponse } from './dashboardsimulation.model';

export interface DashboardSimulationState {
  data: SimulationListResponse | null;
  loading: boolean;
  error: any;
}

export const initialState: DashboardSimulationState = {
  data: null,
  loading: false,
  error: null,
};

export const DashboardSimulationReducer = createReducer(
  initialState,

  // Début du fetch
  on(fetchDashboardSimulation, state => ({
    ...state,
    loading: true,
    error: null
  })),

  // Succès : on stocke tout l'objet data
  on(fetchDashboardSimulationSuccess, (state, { data }) => ({
    ...state,
    data,
    loading: false,
  })),

  // Échec : on stocke l'erreur
  on(fetchDashboardSimulationFailure, (state, { error }) => ({
    ...state,
    error,
    loading: false,
  }))
);
