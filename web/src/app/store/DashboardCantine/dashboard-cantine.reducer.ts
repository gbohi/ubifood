// src/app/store/DashboardCantine/dashboard-cantine.reducer.ts

import { Action, createReducer, on } from '@ngrx/store';
import { DashboardCantineData } from './dashboard-cantine.model';
import {
  fetchDashboardCantine,
  fetchDashboardCantineSuccess,
  fetchDashboardCantineFailure,
} from './dashboard-cantine.action';

export interface DashboardCantineState {
  data:    DashboardCantineData | null;
  loading: boolean;
  error:   string | null;
}

export const initialState: DashboardCantineState = {
  data:    null,
  loading: false,
  error:   null,
};

export const DashboardCantineReducer = createReducer(
  initialState,
  on(fetchDashboardCantine, state => ({
    ...state, loading: true, error: null,
  })),
  on(fetchDashboardCantineSuccess, (state, { data }) => ({
    ...state, data, loading: false,
  })),
  on(fetchDashboardCantineFailure, (state, { error }) => ({
    ...state, error, loading: false,
  })),
);

export function reducer(state: DashboardCantineState | undefined, action: Action) {
  return DashboardCantineReducer(state, action);
}
