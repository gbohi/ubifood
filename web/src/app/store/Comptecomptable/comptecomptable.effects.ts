// src/app/store/Comptecomptable/comptecomptable.effects.ts

import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { ComptecomptableService } from 'src/app/core/services/comptecomptable/comptecomptable.service';
import {
  addcomptecomptableData,
  addcomptecomptableDataFailure,
  addcomptecomptableDataSuccess,
  deletecomptecomptableData,
  deletecomptecomptableFailure,
  deletecomptecomptableSuccess,
  deletemultiplecomptecomptableData,
  deletemultiplecomptecomptableFailure,
  deletemultiplecomptecomptableSuccess,
  fetchcomptecomptableData,
  fetchcomptecomptableFailure,
  fetchcomptecomptableSuccess,
  updatecomptecomptableData,
  updatecomptecomptableDataFailure,
  updatecomptecomptableDataSuccess,
  fetchcomptecomptableNoPaginateData,
  fetchcomptecomptableNoPaginateSuccess,
  fetchcomptecomptableNoPaginateFailure,
} from './comptecomptable.action';

@Injectable()
export class ComptecomptableEffects {

  // ── Fetch paginé ────────────────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchcomptecomptableData),
      mergeMap(({ page }) =>
        this.comptecomptableService.getAllComptecomptables(page ?? 1).pipe(
          map((response) => fetchcomptecomptableSuccess({ response })),
          catchError((error) =>
            of(fetchcomptecomptableFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Fetch sans pagination ───────────────────────────────────
  fetchlistNoPaginData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchcomptecomptableNoPaginateData),
      mergeMap(() =>
        this.comptecomptableService.getListComptecomptables().pipe(
          map((response) => fetchcomptecomptableNoPaginateSuccess({ response })),
          catchError((error) =>
            of(fetchcomptecomptableNoPaginateFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Ajouter ─────────────────────────────────────────────────
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addcomptecomptableData),
      mergeMap(({ newData }) =>
        this.comptecomptableService.createComptecomptable(newData).pipe(
          map((response) => addcomptecomptableDataSuccess({ newData: response })),
          catchError((error) =>
            of(addcomptecomptableDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger à la page 1 après ajout
  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addcomptecomptableDataSuccess),
      map(() => fetchcomptecomptableData({ page: 1 }))
    )
  );

  // ── Modifier ────────────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatecomptecomptableData),
      mergeMap(({ updatedData }) =>
        this.comptecomptableService.updateComptecomptable(updatedData).pipe(
          map(() => updatecomptecomptableDataSuccess({ updatedData })),
          catchError((error) =>
            of(updatecomptecomptableDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger la page courante après modification
  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatecomptecomptableDataSuccess),
      mergeMap(() =>
        this.comptecomptableService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchcomptecomptableData({ page: currentPage }))
        )
      )
    )
  );

  // ── Supprimer (unitaire) ────────────────────────────────────
  deleteData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletecomptecomptableData),
      mergeMap(({ id }) =>
        this.comptecomptableService.deleteComptecomptable(id).pipe(
          map(() => deletecomptecomptableSuccess({ id })),
          catchError((error) =>
            of(deletecomptecomptableFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recalculer la page après suppression unitaire
  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletecomptecomptableSuccess),
      mergeMap(() =>
        this.comptecomptableService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchcomptecomptableData({ page: targetPage });
          }),
          catchError(() => of(fetchcomptecomptableData({ page: 1 })))
        )
      )
    )
  );

  // ── Supprimer (multiple) ────────────────────────────────────
  deleteMultipleData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultiplecomptecomptableData),
      mergeMap(({ id }) => {
        if (!id || id.trim() === '') {
          return of(deletemultiplecomptecomptableFailure({ error: 'Aucun ID valide' }));
        }

        const idArray = id
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultiplecomptecomptableFailure({
            error: 'Aucun ID valide après conversion',
          }));
        }

        return this.comptecomptableService.deleteMultipleComptecomptable(idArray).pipe(
          map(() => deletemultiplecomptecomptableSuccess({ id })),
          catchError((error) =>
            of(deletemultiplecomptecomptableFailure({ error: error.toString() }))
          )
        );
      })
    )
  );

  // Recalculer la page après suppression multiple
  deleteMultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultiplecomptecomptableSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id.split(',').filter((s) => s.trim() !== '').length;

        return this.comptecomptableService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchcomptecomptableData({ page: targetPage });
          }),
          catchError(() => of(fetchcomptecomptableData({ page: 1 })))
        );
      })
    )
  );

  constructor(
    private actions$: Actions,
    private comptecomptableService: ComptecomptableService  // ✅ CrudService supprimé
  ) {}
}
