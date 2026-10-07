import { Injectable } from "@angular/core";
import { of } from 'rxjs';
import { catchError, map, mergeMap, tap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from "@ngrx/effects";
import { DashboardsimulationService } from 'src/app/core/services/dashboardsimulation/dashboardsimulation.service';
import { 
  fetchDashboardSimulation, 
  fetchDashboardSimulationSuccess,
  fetchDashboardSimulationFailure
} from './dashboardsimulation.action';


@Injectable()
export class DashboardSimulationEffects {
 

  loadDashboard$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchDashboardSimulation),
      mergeMap(({ annee_debut, annee_fin, salaire_min, salaire_max }) =>
        this.DashboardsimulationService.getDashboardSimulation(annee_debut, annee_fin, salaire_min, salaire_max).pipe(
          map(data => fetchDashboardSimulationSuccess({ data })),
          catchError(error => of(fetchDashboardSimulationFailure({ error })))
        )
      )
    )
  );
  

   constructor(
    private actions$: Actions,
    private DashboardsimulationService: DashboardsimulationService
  ) {}
}
