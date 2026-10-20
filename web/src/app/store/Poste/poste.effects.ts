// src/app/store/Poste/poste.effects.ts

import { Injectable, inject } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap, switchMap } from 'rxjs/operators';
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

/** L'ErrorInterceptor transforme déjà l'erreur HTTP en message lisible (string). */
function toMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  return (error as any)?.message || 'Une erreur est survenue.';
}

@Injectable()
export class PosteEffects {

  // ✅ inject() au lieu du constructeur — évite l'erreur TS -992003
  private actions$     = inject(Actions);
  private posteService = inject(PosteService);

  // ── Charger liste paginée ─────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchposteData),
      switchMap(({ page, search, ordering }) =>  // dernière recherche/page gagne
        this.posteService.getAllPostes(page || 1, search, ordering).pipe(
          map(response => fetchposteSuccess({ response })),
          catchError(error => of(fetchposteFailure({ error: toMessage(error) })))
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
          catchError(error => of(fetchposteNoPaginateFailure({ error: toMessage(error) })))
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
          catchError(error => of(addposteDataFailure({ error: toMessage(error) })))
        )
      )
    )
  );

  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addposteDataSuccess),
      mergeMap(() =>
        this.posteService.getCurrentPageInfo().pipe(
          map(({ search }) => fetchposteData({ page: 1, search }))
        )
      )
    )
  );

  // ── Mettre à jour ─────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updateposteData),
      mergeMap(({ updatedData }) =>
        this.posteService.updatePoste(updatedData).pipe(
          map(() => updateposteDataSuccess({ updatedData })),
          catchError(error => of(updateposteDataFailure({ error: toMessage(error) })))
        )
      )
    )
  );

  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updateposteDataSuccess),
      mergeMap(() =>
        this.posteService.getCurrentPageInfo().pipe(
          map(({ currentPage, search }) => fetchposteData({ page: currentPage, search }))
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
          catchError(error => of(deleteposteFailure({ error: toMessage(error) })))
        )
      )
    )
  );

  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteposteSuccess),
      mergeMap(() =>
        this.posteService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage, search }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const page = currentPage > totalPages ? Math.max(totalPages, 1) : currentPage;
            return fetchposteData({ page, search });
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
          catchError(error => of(deletemultipleposteFailure({ error: toMessage(error) })))
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
          map(({ currentPage, totalItems, itemsPerPage, search }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const page = currentPage > totalPages ? Math.max(totalPages, 1) : currentPage;
            return fetchposteData({ page, search });
          }),
          catchError(() => of(fetchposteData({ page: 1 })))
        );
      })
    )
  );
}
