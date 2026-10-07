// src/app/store/DashboardCantine/dashboard-cantine.action.ts

import { createAction, props } from '@ngrx/store';
import { DashboardCantineData, DashboardCantineFilters } from './dashboard-cantine.model';

export const fetchDashboardCantine = createAction(
  '[DashboardCantine] Fetch',
  props<{ filters: DashboardCantineFilters }>()
);

export const fetchDashboardCantineSuccess = createAction(
  '[DashboardCantine] Fetch Success',
  props<{ data: DashboardCantineData }>()
);

export const fetchDashboardCantineFailure = createAction(
  '[DashboardCantine] Fetch Failure',
  props<{ error: string }>()
);
