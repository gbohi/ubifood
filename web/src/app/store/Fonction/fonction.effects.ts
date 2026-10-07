// src/app/store/Fonction/fonction.effects.ts

import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { FonctionService } from 'src/app/core/services/fonction/fonction.service';

import {
  addfonctionData,
  addfonctionDataFailure,
  addfonctionDataSuccess,

  deletefonctionData,
  deletefonctionFailure,
  deletefonctionSuccess,

  deletemultiplefonctionData,
  deletemultiplefonctionSuccess,
  deletemultiplefonctionFailure,

  fetchfonctionData,
  fetchfonctionFailure,
  fetchfonctionSuccess,

  updatefonctionData,
  updatefonctionDataFailure,
  updatefonctionDataSuccess,

  fetchfonctionNoPaginateData,
  fetchfonctionNoPaginateSuccess,
  fetchfonctionNoPaginateFailure,
} from './fonction.action';

@Injectable()
export class FonctionEffects {

  constructor(
    private actions$: Actions,
    private fonctionService: FonctionService,
  ) {}

  // ── Charger liste paginée ─────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchfonctionData),
      mergeMap(({ page }) =>
        this.fonctionService.getAllFonctions(page || 1).pipe(
          map(response => fetchfonctionSuccess({ response })),
          catchError(error => of(fetchfonctionFailure({ error: error.toString() })))
        )
      )
    )
  );

  // ── Charger liste sans pagination ─────────────────────────
  fetchlistNoPaginData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchfonctionNoPaginateData),
      mergeMap(() =>
        this.fonctionService.getListFonctions().pipe(
          map(response => fetchfonctionNoPaginateSuccess({ response })),
          catchError(error => of(fetchfonctionNoPaginateFailure({ error: error.toString() })))
        )
      )
    )
  );

  // ── Ajouter ───────────────────────────────────────────────
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addfonctionData),
      mergeMap(({ newData }) =>
        this.fonctionService.createFonction(newData).pipe(
          map(response => addfonctionDataSuccess({ newData: response })),
          catchError(error => of(addfonctionDataFailure({ error: error.toString() })))
        )
      )
    )
  );

  // Recharger page 1 après ajout
  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addfonctionDataSuccess),
      map(() => fetchfonctionData({ page: 1 }))
    )
  );

  // ── Mettre à jour ─────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatefonctionData),
      mergeMap(({ updatedData }) =>
        this.fonctionService.updateFonction(updatedData).pipe(
          map(() => updatefonctionDataSuccess({ updatedData })),
          catchError(error => of(updatefonctionDataFailure({ error: error.toString() })))
        )
      )
    )
  );

  // Recharger page courante après mise à jour
  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatefonctionDataSuccess),
      mergeMap(() =>
        this.fonctionService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchfonctionData({ page: currentPage }))
        )
      )
    )
  );

  // ── Supprimer un élément ──────────────────────────────────
  deleteData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletefonctionData),
      mergeMap(({ id }) =>
        this.fonctionService.deleteFonction(id).pipe(
          map(() => deletefonctionSuccess({ id })),
          catchError(error => of(deletefonctionFailure({ error: error.toString() })))
        )
      )
    )
  );

  // Recharger après suppression simple
  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletefonctionSuccess),
      mergeMap(() =>
        this.fonctionService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const page = currentPage > totalPages ? Math.max(totalPages, 1) : currentPage;
            return fetchfonctionData({ page });
          }),
          catchError(() => of(fetchfonctionData({ page: 1 })))
        )
      )
    )
  );

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultiplefonctionData),
      mergeMap(({ id }) => {
        const idArray = id
          .split(',')
          .map(s => parseInt(s.trim()))
          .filter(n => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultiplefonctionFailure({ error: 'Aucun ID valide' }));
        }

        return this.fonctionService.deleteMultipleFonction(idArray).pipe(
          map(() => deletemultiplefonctionSuccess({ id })),
          catchError(error => of(deletemultiplefonctionFailure({ error: error.toString() })))
        );
      })
    )
  );

  // Recharger après suppression multiple
  deletemultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultiplefonctionSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id.split(',').filter(s => s.trim() !== '').length;
        return this.fonctionService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const page = currentPage > totalPages ? Math.max(totalPages, 1) : currentPage;
            return fetchfonctionData({ page });
          }),
          catchError(() => of(fetchfonctionData({ page: 1 })))
        );
      })
    )
  );
}
