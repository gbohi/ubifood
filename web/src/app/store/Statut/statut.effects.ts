// src/app/store/Statut/statut.effects.ts

import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { StatutService } from 'src/app/core/services/statut/statut.service';
import {
  addstatutData,
  addstatutDataFailure,
  addstatutDataSuccess,
  deletestatutData,
  deletestatutFailure,
  deletestatutSuccess,
  deletemultiplestatutData,
  deletemultiplestatutFailure,
  deletemultiplestatutSuccess,
  fetchstatutData,
  fetchstatutFailure,
  fetchstatutSuccess,
  updatestatutData,
  updatestatutDataFailure,
  updatestatutDataSuccess,
  fetchstatutNoPaginateData,
  fetchstatutNoPaginateSuccess,
  fetchstatutNoPaginateFailure,
} from './statut.action';

@Injectable()
export class StatutEffects {

  // ── Fetch paginé ────────────────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchstatutData),
      mergeMap(({ page }) =>
        this.statutService.getAllStatuts(page ?? 1).pipe(
          map((response) => fetchstatutSuccess({ response })),
          catchError((error) =>
            of(fetchstatutFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Fetch sans pagination ───────────────────────────────────
  fetchlistNoPaginData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchstatutNoPaginateData),
      mergeMap(() =>
        this.statutService.getListStatut().pipe(
          map((response) => fetchstatutNoPaginateSuccess({ response })),
          catchError((error) =>
            of(fetchstatutNoPaginateFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Ajouter ─────────────────────────────────────────────────
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addstatutData),
      mergeMap(({ newData }) =>
        this.statutService.createStatut(newData).pipe(
          map((response) => addstatutDataSuccess({ newData: response })),
          catchError((error) =>
            of(addstatutDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger à la page 1 après ajout
  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addstatutDataSuccess),
      map(() => fetchstatutData({ page: 1 }))
    )
  );

  // ── Modifier ────────────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatestatutData),
      mergeMap(({ updatedData }) =>
        this.statutService.updateStatut(updatedData).pipe(
          map(() => updatestatutDataSuccess({ updatedData })),
          catchError((error) =>
            of(updatestatutDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger la page courante après modification
  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatestatutDataSuccess),
      mergeMap(() =>
        this.statutService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchstatutData({ page: currentPage }))
        )
      )
    )
  );

  // ── Supprimer (unitaire) ────────────────────────────────────
  deleteData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletestatutData),
      mergeMap(({ id }) =>
        this.statutService.deleteStatut(id).pipe(
          map(() => deletestatutSuccess({ id })),
          catchError((error) =>
            of(deletestatutFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recalculer la page après suppression unitaire
  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletestatutSuccess),
      mergeMap(() =>
        this.statutService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchstatutData({ page: targetPage });
          }),
          catchError(() => of(fetchstatutData({ page: 1 })))
        )
      )
    )
  );

  // ── Supprimer (multiple) ────────────────────────────────────
  deleteMultipleData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultiplestatutData),
      mergeMap(({ id }) => {
        if (!id || id.trim() === '') {
          return of(deletemultiplestatutFailure({ error: 'Aucun ID valide' }));
        }

        const idArray = id
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultiplestatutFailure({
            error: 'Aucun ID valide après conversion',
          }));
        }

        return this.statutService.deleteMultipleStatut(idArray).pipe(
          map(() => deletemultiplestatutSuccess({ id })),
          catchError((error) =>
            of(deletemultiplestatutFailure({ error: error.toString() }))
          )
        );
      })
    )
  );

  // Recalculer la page après suppression multiple
  deleteMultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultiplestatutSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id.split(',').filter((s) => s.trim() !== '').length;

        return this.statutService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchstatutData({ page: targetPage });
          }),
          catchError(() => of(fetchstatutData({ page: 1 })))
        );
      })
    )
  );

  constructor(
    private actions$: Actions,
    private statutService: StatutService  // ✅ CrudService supprimé
  ) {}
}
