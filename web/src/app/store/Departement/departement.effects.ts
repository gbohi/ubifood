// src/app/store/Departement/departement.effects.ts

import { Injectable, inject } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap, switchMap } from 'rxjs/operators';
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
      switchMap(({ page, search }) =>
        this.departementService.getAllDepartements(page ?? 1, search).pipe(
          map(response => fetchdepartementSuccess({ response })),
          catchError(error => of(fetchdepartementFailure({ error: typeof error === 'string' ? error : "Erreur lors du chargement des données" })))
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
          catchError(error => of(fetchdepartementNoPaginateFailure({ error: typeof error === 'string' ? error : "Erreur lors du chargement des données" })))
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
          catchError(error => of(adddepartementDataFailure({ error: typeof error === 'string' ? error : "Erreur lors de l'ajout" })))
        )
      )
    )
  );

  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(adddepartementDataSuccess),
      map(() => fetchdepartementData({ page: 1, search: this.departementService.getCurrentSearch() }))
    )
  );

  // ── Mettre à jour ─────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatedepartementData),
      mergeMap(({ updatedData }) =>
        this.departementService.updateDepartement(updatedData).pipe(
          map(() => updatedepartementDataSuccess({ updatedData })),
          catchError(error => of(updatedepartementDataFailure({ error: typeof error === 'string' ? error : "Erreur lors de la mise à jour" })))
        )
      )
    )
  );

  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatedepartementDataSuccess),
      mergeMap(() =>
        this.departementService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchdepartementData({ page: currentPage, search: this.departementService.getCurrentSearch() }))
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
          catchError(error => of(deletedepartementFailure({ error: typeof error === 'string' ? error : "Erreur lors de la suppression" })))
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
            return fetchdepartementData({ page, search: this.departementService.getCurrentSearch() });
          }),
          catchError(() => of(fetchdepartementData({ page: 1, search: this.departementService.getCurrentSearch() })))
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
          catchError(error => of(deletemultipledepartementFailure({ error: typeof error === 'string' ? error : "Erreur lors de la suppression" })))
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
            return fetchdepartementData({ page, search: this.departementService.getCurrentSearch() });
          }),
          catchError(() => of(fetchdepartementData({ page: 1, search: this.departementService.getCurrentSearch() })))
        );
      })
    )
  );
}