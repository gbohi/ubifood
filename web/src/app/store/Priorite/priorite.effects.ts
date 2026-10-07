// src/app/store/Priorite/priorite.effects.ts

import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { PrioriteService } from 'src/app/core/services/priorite/priorite.service';
import {
  addprioriteData,
  addprioriteDataFailure,
  addprioriteDataSuccess,
  deleteprioriteData,
  deleteprioriteFailure,
  deleteprioriteSuccess,
  deletemultipleprioriteData,
  deletemultipleprioriteFailure,
  deletemultipleprioriteSuccess,
  fetchprioriteData,
  fetchprioriteFailure,
  fetchprioriteSuccess,
  updateprioriteData,
  updateprioriteDataFailure,
  updateprioriteDataSuccess,
  fetchprioriteNoPaginateData,
  fetchprioriteNoPaginateSuccess,
  fetchprioriteNoPaginateFailure,
} from './priorite.action';

@Injectable()
export class PrioriteEffects {

  // ── Fetch paginé ────────────────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchprioriteData),
      mergeMap(({ page }) =>
        this.prioriteService.getAllPriorites(page ?? 1).pipe(
          map((response) => fetchprioriteSuccess({ response })),
          catchError((error) =>
            of(fetchprioriteFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Fetch sans pagination ───────────────────────────────────
  fetchlistNoPaginData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchprioriteNoPaginateData),
      mergeMap(() =>
        this.prioriteService.getListPriorites().pipe(
          map((response) => fetchprioriteNoPaginateSuccess({ response })),
          catchError((error) =>
            of(fetchprioriteNoPaginateFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Ajouter ─────────────────────────────────────────────────
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addprioriteData),
      mergeMap(({ newData }) =>
        this.prioriteService.createPriorite(newData).pipe(
          map((response) => addprioriteDataSuccess({ newData: response })),
          catchError((error) =>
            of(addprioriteDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger à la page 1 après ajout
  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addprioriteDataSuccess),
      map(() => fetchprioriteData({ page: 1 }))
    )
  );

  // ── Modifier ────────────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updateprioriteData),
      mergeMap(({ updatedData }) =>
        this.prioriteService.updatePriorite(updatedData).pipe(
          map(() => updateprioriteDataSuccess({ updatedData })),
          catchError((error) =>
            of(updateprioriteDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger la page courante après modification
  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updateprioriteDataSuccess),
      mergeMap(() =>
        this.prioriteService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchprioriteData({ page: currentPage }))
        )
      )
    )
  );

  // ── Supprimer (unitaire) ────────────────────────────────────
  deleteData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteprioriteData),
      mergeMap(({ id }) =>
        this.prioriteService.deletePriorite(id).pipe(
          map(() => deleteprioriteSuccess({ id })),
          catchError((error) =>
            of(deleteprioriteFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recalculer la page après suppression unitaire
  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteprioriteSuccess),
      mergeMap(() =>
        this.prioriteService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchprioriteData({ page: targetPage });
          }),
          catchError(() => of(fetchprioriteData({ page: 1 })))
        )
      )
    )
  );

  // ── Supprimer (multiple) ────────────────────────────────────
  deleteMultipleData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipleprioriteData),
      mergeMap(({ id }) => {
        if (!id || id.trim() === '') {
          return of(deletemultipleprioriteFailure({ error: 'Aucun ID valide' }));
        }

        const idArray = id
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultipleprioriteFailure({
            error: 'Aucun ID valide après conversion',
          }));
        }

        return this.prioriteService.deleteMultiplePriorite(idArray).pipe(
          map(() => deletemultipleprioriteSuccess({ id })),
          catchError((error) =>
            of(deletemultipleprioriteFailure({ error: error.toString() }))
          )
        );
      })
    )
  );

  // Recalculer la page après suppression multiple
  deleteMultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipleprioriteSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id.split(',').filter((s) => s.trim() !== '').length;

        return this.prioriteService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchprioriteData({ page: targetPage });
          }),
          catchError(() => of(fetchprioriteData({ page: 1 })))
        );
      })
    )
  );

  constructor(
    private actions$: Actions,
    private prioriteService: PrioriteService  // ✅ CrudService supprimé
  ) {}
}
