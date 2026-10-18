// src/app/store/DashboardCantine/dashboard-cantine.effects.ts

import { Injectable, inject } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { DashboardCantineService } from 'src/app/core/services/dashboard-cantine/dashboard-cantine.service';
import { messageErreurApi } from 'src/app/core/helpers/error.interceptor';
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
      // switchMap : un nouveau filtrage annule la requête précédente
      switchMap(({ filters }) =>
        this.dashboardCantineService.getDashboard(filters).pipe(
          map(data  => fetchDashboardCantineSuccess({ data })),
          catchError(error =>
            // l'ErrorInterceptor renvoie déjà un message lisible (string)
            of(fetchDashboardCantineFailure({
              error: typeof error === 'string' ? error : messageErreurApi(error),
            }))
          )
        )
      )
    )
  );
}
