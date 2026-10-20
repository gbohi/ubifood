// src/app/store/Fonction/fonction.effects.ts

import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap, switchMap } from 'rxjs/operators';
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

/** L'ErrorInterceptor transforme déjà l'erreur HTTP en message lisible (string). */
function toMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  return (error as any)?.message || 'Une erreur est survenue.';
}

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
      switchMap(({ page, search, ordering }) =>  // dernière recherche/page gagne
        this.fonctionService.getAllFonctions(page || 1, search, ordering).pipe(
          map(response => fetchfonctionSuccess({ response })),
          catchError(error => of(fetchfonctionFailure({ error: toMessage(error) })))
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
          catchError(error => of(fetchfonctionNoPaginateFailure({ error: toMessage(error) })))
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
          catchError(error => of(addfonctionDataFailure({ error: toMessage(error) })))
        )
      )
    )
  );

  // Recharger page 1 après ajout
  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addfonctionDataSuccess),
      mergeMap(() =>
        this.fonctionService.getCurrentPageInfo().pipe(
          map(({ search }) => fetchfonctionData({ page: 1, search }))
        )
      )
    )
  );

  // ── Mettre à jour ─────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatefonctionData),
      mergeMap(({ updatedData }) =>
        this.fonctionService.updateFonction(updatedData).pipe(
          map(() => updatefonctionDataSuccess({ updatedData })),
          catchError(error => of(updatefonctionDataFailure({ error: toMessage(error) })))
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
          map(({ currentPage, search }) => fetchfonctionData({ page: currentPage, search }))
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
          catchError(error => of(deletefonctionFailure({ error: toMessage(error) })))
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
          map(({ currentPage, totalItems, itemsPerPage, search }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const page = currentPage > totalPages ? Math.max(totalPages, 1) : currentPage;
            return fetchfonctionData({ page, search });
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
          catchError(error => of(deletemultiplefonctionFailure({ error: toMessage(error) })))
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
          map(({ currentPage, totalItems, itemsPerPage, search }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const page = currentPage > totalPages ? Math.max(totalPages, 1) : currentPage;
            return fetchfonctionData({ page, search });
          }),
          catchError(() => of(fetchfonctionData({ page: 1 })))
        );
      })
    )
  );
}
