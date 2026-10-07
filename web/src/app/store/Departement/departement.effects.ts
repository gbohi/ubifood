// src/app/store/Departement/departement.effects.ts

import { Injectable, inject } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { DepartementService } from 'src/app/core/services/departement/departement.service';

import {
  adddepartementData,
  adddepartementDataFailure,
  adddepartementDataSuccess,
  deletedepartementData,
  deletedepartementFailure,
  deletedepartementSuccess,
  deletemultipledepartementData,
  deletemultipledepartementSuccess,
  deletemultipledepartementFailure,
  fetchdepartementData,
  fetchdepartementFailure,
  fetchdepartementSuccess,
  updatedepartementData,
  updatedepartementDataFailure,
  updatedepartementDataSuccess,
  fetchdepartementNoPaginateData,
  fetchdepartementNoPaginateSuccess,
  fetchdepartementNoPaginateFailure,
} from './departement.action';

@Injectable()
export class DepartementEffects {

  private actions$           = inject(Actions);
  private departementService = inject(DepartementService);

  // ── Charger liste paginée ─────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchdepartementData),
      mergeMap(({ page }) =>
        this.departementService.getAllDepartements(page || 1).pipe(
          map(response => fetchdepartementSuccess({ response })),
          catchError(error => of(fetchdepartementFailure({ error: error.toString() })))
        )
      )
    )
  );

  // ── Charger liste sans pagination ─────────────────────────
  fetchlistNoPaginData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchdepartementNoPaginateData),
      mergeMap(() =>
        this.departementService.getListDepartements().pipe(
          map(response => fetchdepartementNoPaginateSuccess({ response })),
          catchError(error => of(fetchdepartementNoPaginateFailure({ error: error.toString() })))
        )
      )
    )
  );

  // ── Ajouter ───────────────────────────────────────────────
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(adddepartementData),
      mergeMap(({ newData }) =>
        this.departementService.createDepartement(newData).pipe(
          map(response => adddepartementDataSuccess({ newData: response })),
          catchError(error => of(adddepartementDataFailure({ error: error.toString() })))
        )
      )
    )
  );

  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(adddepartementDataSuccess),
      map(() => fetchdepartementData({ page: 1 }))
    )
  );

  // ── Mettre à jour ─────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatedepartementData),
      mergeMap(({ updatedData }) =>
        this.departementService.updateDepartement(updatedData).pipe(
          map(() => updatedepartementDataSuccess({ updatedData })),
          catchError(error => of(updatedepartementDataFailure({ error: error.toString() })))
        )
      )
    )
  );

  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatedepartementDataSuccess),
      mergeMap(() =>
        this.departementService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchdepartementData({ page: currentPage }))
        )
      )
    )
  );

  // ── Supprimer un élément ──────────────────────────────────
  deleteData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletedepartementData),
      mergeMap(({ id }) =>
        this.departementService.deleteDepartement(id).pipe(
          map(() => deletedepartementSuccess({ id })),
          catchError(error => of(deletedepartementFailure({ error: error.toString() })))
        )
      )
    )
  );

  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletedepartementSuccess),
      mergeMap(() =>
        this.departementService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const page = currentPage > totalPages ? Math.max(totalPages, 1) : currentPage;
            return fetchdepartementData({ page });
          }),
          catchError(() => of(fetchdepartementData({ page: 1 })))
        )
      )
    )
  );

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipledepartementData),
      mergeMap(({ id }) => {
        const idArray = id
          .split(',')
          .map(s => parseInt(s.trim()))
          .filter(n => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultipledepartementFailure({ error: 'Aucun ID valide' }));
        }

        return this.departementService.deleteMultipleDepartement(idArray).pipe(
          map(() => deletemultipledepartementSuccess({ id })),
          catchError(error => of(deletemultipledepartementFailure({ error: error.toString() })))
        );
      })
    )
  );

  deletemultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipledepartementSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id.split(',').filter(s => s.trim() !== '').length;
        return this.departementService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const page = currentPage > totalPages ? Math.max(totalPages, 1) : currentPage;
            return fetchdepartementData({ page });
          }),
          catchError(() => of(fetchdepartementData({ page: 1 })))
        );
      })
    )
  );
}