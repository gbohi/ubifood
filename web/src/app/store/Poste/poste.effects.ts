// src/app/store/Poste/poste.effects.ts

import { Injectable, inject } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { PosteService } from 'src/app/core/services/poste/poste.service';

import {
  addposteData,
  addposteDataFailure,
  addposteDataSuccess,
  deleteposteData,
  deleteposteFailure,
  deleteposteSuccess,
  deletemultipleposteData,
  deletemultipleposteSuccess,
  deletemultipleposteFailure,
  fetchposteData,
  fetchposteFailure,
  fetchposteSuccess,
  updateposteData,
  updateposteDataFailure,
  updateposteDataSuccess,
  fetchposteNoPaginateData,
  fetchposteNoPaginateSuccess,
  fetchposteNoPaginateFailure,
} from './poste.action';

@Injectable()
export class PosteEffects {

  // ✅ inject() au lieu du constructeur — évite l'erreur TS -992003
  private actions$     = inject(Actions);
  private posteService = inject(PosteService);

  // ── Charger liste paginée ─────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchposteData),
      mergeMap(({ page }) =>
        this.posteService.getAllPostes(page || 1).pipe(
          map(response => fetchposteSuccess({ response })),
          catchError(error => of(fetchposteFailure({ error: error.toString() })))
        )
      )
    )
  );

  // ── Charger liste sans pagination ─────────────────────────
  fetchlistNoPaginData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchposteNoPaginateData),
      mergeMap(() =>
        this.posteService.getListPostes().pipe(
          map(response => fetchposteNoPaginateSuccess({ response })),
          catchError(error => of(fetchposteNoPaginateFailure({ error: error.toString() })))
        )
      )
    )
  );

  // ── Ajouter ───────────────────────────────────────────────
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addposteData),
      mergeMap(({ newData }) =>
        this.posteService.createPoste(newData).pipe(
          map(response => addposteDataSuccess({ newData: response })),
          catchError(error => of(addposteDataFailure({ error: error.toString() })))
        )
      )
    )
  );

  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addposteDataSuccess),
      map(() => fetchposteData({ page: 1 }))
    )
  );

  // ── Mettre à jour ─────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updateposteData),
      mergeMap(({ updatedData }) =>
        this.posteService.updatePoste(updatedData).pipe(
          map(() => updateposteDataSuccess({ updatedData })),
          catchError(error => of(updateposteDataFailure({ error: error.toString() })))
        )
      )
    )
  );

  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updateposteDataSuccess),
      mergeMap(() =>
        this.posteService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchposteData({ page: currentPage }))
        )
      )
    )
  );

  // ── Supprimer un élément ──────────────────────────────────
  deleteData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteposteData),
      mergeMap(({ id }) =>
        this.posteService.deletePoste(id).pipe(
          map(() => deleteposteSuccess({ id })),
          catchError(error => of(deleteposteFailure({ error: error.toString() })))
        )
      )
    )
  );

  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteposteSuccess),
      mergeMap(() =>
        this.posteService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const page = currentPage > totalPages ? Math.max(totalPages, 1) : currentPage;
            return fetchposteData({ page });
          }),
          catchError(() => of(fetchposteData({ page: 1 })))
        )
      )
    )
  );

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipleposteData),
      mergeMap(({ id }) => {
        const idArray = id
          .split(',')
          .map(s => parseInt(s.trim()))
          .filter(n => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultipleposteFailure({ error: 'Aucun ID valide' }));
        }

        return this.posteService.deleteMultiplePoste(idArray).pipe(
          map(() => deletemultipleposteSuccess({ id })),
          catchError(error => of(deletemultipleposteFailure({ error: error.toString() })))
        );
      })
    )
  );

  deletemultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipleposteSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id.split(',').filter(s => s.trim() !== '').length;
        return this.posteService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const page = currentPage > totalPages ? Math.max(totalPages, 1) : currentPage;
            return fetchposteData({ page });
          }),
          catchError(() => of(fetchposteData({ page: 1 })))
        );
      })
    )
  );
}
