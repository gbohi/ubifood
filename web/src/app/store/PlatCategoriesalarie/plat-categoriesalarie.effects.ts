// src/app/store/PlatCategoriesalarie/plat-categoriesalarie.effects.ts

import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of, forkJoin } from 'rxjs';
import { catchError, map, mergeMap, switchMap } from 'rxjs/operators';
import { PlatCategoriesalarieService } from 'src/app/core/services/plat-categoriesalarie/plat-categoriesalarie.service';
import * as PlatCategoriesalarieActions from './plat-categoriesalarie.action';

@Injectable()
export class PlatCategoriesalarieEffects {

  // ✅ inject() au lieu du constructeur — évite l'erreur TS -992003
  private actions$                    = inject(Actions);
  private platCategoriesalarieService = inject(PlatCategoriesalarieService);

  // ── Charger les tarifs d'une catégorie ────────────────────
  fetch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(PlatCategoriesalarieActions.fetchPlatCategoriesalarie),
      switchMap(({ categoriesalarieId }) =>
        this.platCategoriesalarieService.getByCategoriesalarie(categoriesalarieId).pipe(
          map(tarifs => PlatCategoriesalarieActions.fetchPlatCategoriesalarieSuccess({ tarifs })),
          catchError(err => of(PlatCategoriesalarieActions.fetchPlatCategoriesalarieFailure({
            error: err?.error?.detail || 'Erreur lors du chargement des tarifs.'
          })))
        )
      )
    )
  );

  // ── Créer un tarif ────────────────────────────────────────
  create$ = createEffect(() =>
    this.actions$.pipe(
      ofType(PlatCategoriesalarieActions.createPlatCategoriesalarie),
      mergeMap(({ data }) =>
        this.platCategoriesalarieService.create(data).pipe(
          map(tarif => PlatCategoriesalarieActions.createPlatCategoriesalarieSuccess({ tarif })),
          catchError(err => of(PlatCategoriesalarieActions.createPlatCategoriesalarieFailure({
            error: err?.error?.detail || 'Erreur lors de la création du tarif.'
          })))
        )
      )
    )
  );

  // ── Mettre à jour un tarif ────────────────────────────────
  update$ = createEffect(() =>
    this.actions$.pipe(
      ofType(PlatCategoriesalarieActions.updatePlatCategoriesalarie),
      mergeMap(({ id, data }) =>
        this.platCategoriesalarieService.update(id, data).pipe(
          map(tarif => PlatCategoriesalarieActions.updatePlatCategoriesalarieSuccess({ tarif })),
          catchError(err => of(PlatCategoriesalarieActions.updatePlatCategoriesalarieFailure({
            error: err?.error?.detail || 'Erreur lors de la mise à jour du tarif.'
          })))
        )
      )
    )
  );

  // ── Supprimer un tarif ────────────────────────────────────
  delete$ = createEffect(() =>
    this.actions$.pipe(
      ofType(PlatCategoriesalarieActions.deletePlatCategoriesalarie),
      mergeMap(({ id }) =>
        this.platCategoriesalarieService.delete(id).pipe(
          map(() => PlatCategoriesalarieActions.deletePlatCategoriesalarieSuccess({ id })),
          catchError(err => of(PlatCategoriesalarieActions.deletePlatCategoriesalarieFailure({
            error: err?.error?.detail || 'Erreur lors de la suppression du tarif.'
          })))
        )
      )
    )
  );

  // ── Sauvegarder en batch (création catégorie) ─────────────
  saveBatch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(PlatCategoriesalarieActions.savePlatCategoriesalariesBatch),
      mergeMap(({ categoriesalarieId, tarifs }) => {
        if (tarifs.length === 0) {
          return of(PlatCategoriesalarieActions.savePlatCategoriesalariesBatchSuccess({
            categoriesalarieId
          }));
        }

        const requests = tarifs.map(t =>
          this.platCategoriesalarieService.create({
            ...t,
            categoriesalarie: categoriesalarieId,
          })
        );

        return forkJoin(requests).pipe(
          map(() => PlatCategoriesalarieActions.savePlatCategoriesalariesBatchSuccess({
            categoriesalarieId
          })),
          catchError(err => of(PlatCategoriesalarieActions.savePlatCategoriesalariesBatchFailure({
            error: err?.error?.detail || 'Erreur lors de la sauvegarde des tarifs.'
          })))
        );
      })
    )
  );

  // Recharger les tarifs après batch success
  saveBatchSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(PlatCategoriesalarieActions.savePlatCategoriesalariesBatchSuccess),
      map(({ categoriesalarieId }) =>
        PlatCategoriesalarieActions.fetchPlatCategoriesalarie({ categoriesalarieId })
      )
    )
  );
}
