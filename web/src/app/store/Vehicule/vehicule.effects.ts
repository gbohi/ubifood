// src/app/store/Vehicule/vehicule.effects.ts

import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { VehiculeService } from 'src/app/core/services/vehicule/vehicule.service';
import {
  addvehiculeData,
  addvehiculeDataFailure,
  addvehiculeDataSuccess,
  deletevehiculeData,
  deletevehiculeFailure,
  deletevehiculeSuccess,
  deletemultiplevehiculeData,
  deletemultiplevehiculeFailure,
  deletemultiplevehiculeSuccess,
  fetchvehiculeData,
  fetchvehiculeFailure,
  fetchvehiculeSuccess,
  updatevehiculeData,
  updatevehiculeDataFailure,
  updatevehiculeDataSuccess,
  fetchvehiculeNoPaginateData,
  fetchvehiculeNoPaginateSuccess,
  fetchvehiculeNoPaginateFailure,
} from './vehicule.action';

@Injectable()
export class VehiculeEffects {

  // ── Fetch paginé ────────────────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchvehiculeData),
      mergeMap(({ page }) =>
        this.vehiculeService.getAllVehicules(page ?? 1).pipe(
          map((response) => fetchvehiculeSuccess({ response })),
          catchError((error) =>
            of(fetchvehiculeFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Fetch sans pagination ───────────────────────────────────
  fetchlistNoPaginData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchvehiculeNoPaginateData),
      mergeMap(() =>
        this.vehiculeService.getListVehicules().pipe(
          map((response) => fetchvehiculeNoPaginateSuccess({ response })),
          catchError((error) =>
            of(fetchvehiculeNoPaginateFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Ajouter ─────────────────────────────────────────────────
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addvehiculeData),
      mergeMap(({ newData }) =>
        this.vehiculeService.createVehicule(newData).pipe(
          map((response) => addvehiculeDataSuccess({ newData: response })),
          catchError((error) =>
            of(addvehiculeDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger à la page 1 après ajout
  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addvehiculeDataSuccess),
      map(() => fetchvehiculeData({ page: 1 }))
    )
  );

  // ── Modifier ────────────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatevehiculeData),
      mergeMap(({ updatedData }) =>
        this.vehiculeService.updateVehicule(updatedData).pipe(
          map(() => updatevehiculeDataSuccess({ updatedData })),
          catchError((error) =>
            of(updatevehiculeDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger la page courante après modification
  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatevehiculeDataSuccess),
      mergeMap(() =>
        this.vehiculeService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchvehiculeData({ page: currentPage }))
        )
      )
    )
  );

  // ── Supprimer (unitaire) ────────────────────────────────────
  deleteData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletevehiculeData),
      mergeMap(({ id }) =>
        this.vehiculeService.deleteVehicule(id).pipe(
          map(() => deletevehiculeSuccess({ id })),
          catchError((error) =>
            of(deletevehiculeFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recalculer la page après suppression unitaire
  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletevehiculeSuccess),
      mergeMap(() =>
        this.vehiculeService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchvehiculeData({ page: targetPage });
          }),
          catchError(() => of(fetchvehiculeData({ page: 1 })))
        )
      )
    )
  );

  // ── Supprimer (multiple) ────────────────────────────────────
  deleteMultipleData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultiplevehiculeData),
      mergeMap(({ id }) => {
        if (!id || id.trim() === '') {
          return of(deletemultiplevehiculeFailure({ error: 'Aucun ID valide' }));
        }

        const idArray = id
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultiplevehiculeFailure({
            error: 'Aucun ID valide après conversion',
          }));
        }

        return this.vehiculeService.deleteMultipleVehicule(idArray).pipe(
          map(() => deletemultiplevehiculeSuccess({ id })),
          catchError((error) =>
            of(deletemultiplevehiculeFailure({ error: error.toString() }))
          )
        );
      })
    )
  );

  // Recalculer la page après suppression multiple
  deleteMultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultiplevehiculeSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id.split(',').filter((s) => s.trim() !== '').length;

        return this.vehiculeService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchvehiculeData({ page: targetPage });
          }),
          catchError(() => of(fetchvehiculeData({ page: 1 })))
        );
      })
    )
  );

  constructor(
    private actions$: Actions,
    private vehiculeService: VehiculeService  // ✅ CrudService supprimé
  ) {}
}
