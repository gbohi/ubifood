// src/app/store/DashboardCantine/dashboard-cantine.effects.ts

import { Injectable, inject } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { DashboardCantineService } from 'src/app/core/services/dashboard-cantine/dashboard-cantine.service';
import {
  fetchDashboardCantine,
  fetchDashboardCantineSuccess,
  fetchDashboardCantineFailure,
} from './dashboard-cantine.action';

@Injectable()
export class DashboardCantineEffects {

  private actions$                = inject(Actions);
  private dashboardCantineService = inject(DashboardCantineService);

  fetch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchDashboardCantine),
      mergeMap(({ filters }) =>
        this.dashboardCantineService.getDashboard(filters).pipe(
          map(data  => fetchDashboardCantineSuccess({ data })),
          catchError(error =>
            of(fetchDashboardCantineFailure({ error: error.toString() }))
          )
        )
      )
    )
  );
}
