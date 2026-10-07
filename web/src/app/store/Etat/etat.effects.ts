// src/app/store/Etat/etat.effects.ts

import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { EtatService } from 'src/app/core/services/etat/etat.service';

import {
  addetatData,
  addetatDataFailure,
  addetatDataSuccess,

  deleteetatData,
  deleteetatFailure,
  deleteetatSuccess,

  deletemultipleetatData,
  deletemultipleetatSuccess,
  deletemultipleetatFailure,

  fetchetatData,
  fetchetatFailure,
  fetchetatSuccess,

  updateetatData,
  updateetatDataFailure,
  updateetatDataSuccess,

  fetchetatNoPaginateData,
  fetchetatNoPaginateSuccess,
  fetchetatNoPaginateFailure,
} from './etat.action';

@Injectable()
export class EtatEffects {

  constructor(
    private actions$: Actions,
    private etatService: EtatService,
  ) {}

  // ── Charger liste paginée ─────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchetatData),
      mergeMap(({ page }) =>
        this.etatService.getAllEtats(page || 1).pipe(
          map(response => fetchetatSuccess({ response })),
          catchError(error => of(fetchetatFailure({ error: error.toString() })))
        )
      )
    )
  );

  // ── Charger liste sans pagination ─────────────────────────
  fetchlistNoPaginData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchetatNoPaginateData),
      mergeMap(() =>
        this.etatService.getListEtat().pipe(
          map(response => fetchetatNoPaginateSuccess({ response })),
          catchError(error => of(fetchetatNoPaginateFailure({ error: error.toString() })))
        )
      )
    )
  );

  // ── Ajouter ───────────────────────────────────────────────
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addetatData),
      mergeMap(({ newData }) =>
        this.etatService.createEtat(newData).pipe(
          map(response => addetatDataSuccess({ newData: response })),
          catchError(error => of(addetatDataFailure({ error: error.toString() })))
        )
      )
    )
  );

  // Recharger page 1 après ajout
  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addetatDataSuccess),
      map(() => fetchetatData({ page: 1 }))
    )
  );

  // ── Mettre à jour ─────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updateetatData),
      mergeMap(({ updatedData }) =>
        this.etatService.updateEtat(updatedData).pipe(
          map(() => updateetatDataSuccess({ updatedData })),
          catchError(error => of(updateetatDataFailure({ error: error.toString() })))
        )
      )
    )
  );

  // Recharger page courante après mise à jour
  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updateetatDataSuccess),
      mergeMap(() =>
        this.etatService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchetatData({ page: currentPage }))
        )
      )
    )
  );

  // ── Supprimer un élément ──────────────────────────────────
  deleteData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteetatData),
      mergeMap(({ id }) =>
        this.etatService.deleteEtat(id).pipe(
          map(() => deleteetatSuccess({ id })),
          catchError(error => of(deleteetatFailure({ error: error.toString() })))
        )
      )
    )
  );

  // Recharger après suppression simple
  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteetatSuccess),
      mergeMap(() =>
        this.etatService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const page = currentPage > totalPages ? Math.max(totalPages, 1) : currentPage;
            return fetchetatData({ page });
          }),
          catchError(() => of(fetchetatData({ page: 1 })))
        )
      )
    )
  );

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipleetatData),
      mergeMap(({ id }) => {
        const idArray = id
          .split(',')
          .map(s => parseInt(s.trim()))
          .filter(n => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultipleetatFailure({ error: 'Aucun ID valide' }));
        }

        return this.etatService.deleteMultipleEtat(idArray).pipe(
          map(() => deletemultipleetatSuccess({ id })),
          catchError(error => of(deletemultipleetatFailure({ error: error.toString() })))
        );
      })
    )
  );

  // Recharger après suppression multiple
  deletemultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipleetatSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id.split(',').filter(s => s.trim() !== '').length;
        return this.etatService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const page = currentPage > totalPages ? Math.max(totalPages, 1) : currentPage;
            return fetchetatData({ page });
          }),
          catchError(() => of(fetchetatData({ page: 1 })))
        );
      })
    )
  );
}
