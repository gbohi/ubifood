import { Injectable } from "@angular/core";
import { of } from 'rxjs';
import { catchError, map, mergeMap, tap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from "@ngrx/effects";
import { DashboardEntretienVehiculeService } from 'src/app/core/services/dashboardentretienvehicule/dashboardentretienvehicule.service';
import { 
  fetchDashboardEntretien, 
  fetchDashboardEntretienSuccess,
  fetchDashboardEntretienFailure
} from './dashboardentretienvehicule.action';


@Injectable()
export class DashboardEntretienVehiculeEffects {
 

  loadDashboard$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchDashboardEntretien),
      mergeMap(({ annee, agence_id, immatriculation }) =>
        this.DashboardEntretienVehiculeService.getDashboardEntretien(annee, agence_id, immatriculation).pipe(
          map(data => fetchDashboardEntretienSuccess({ data })),
          catchError(error => of(fetchDashboardEntretienFailure({ error })))
        )
      )
    )
  );

   constructor(
    private actions$: Actions,
    private DashboardEntretienVehiculeService: DashboardEntretienVehiculeService
  ) {}
}
