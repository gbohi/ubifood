// src/app/store/Categoriecomptable/categoriecomptable.effects.ts

import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { CategoriecomptableService } from 'src/app/core/services/categoriecomptable/categoriecomptable.service';
import {
  addcategoriecomptableData,
  addcategoriecomptableDataFailure,
  addcategoriecomptableDataSuccess,
  deletecategoriecomptableData,
  deletecategoriecomptableFailure,
  deletecategoriecomptableSuccess,
  deletemultiplecategoriecomptableData,
  deletemultiplecategoriecomptableFailure,
  deletemultiplecategoriecomptableSuccess,
  fetchcategoriecomptableData,
  fetchcategoriecomptableFailure,
  fetchcategoriecomptableSuccess,
  updatecategoriecomptableData,
  updatecategoriecomptableDataFailure,
  updatecategoriecomptableDataSuccess,
  fetchcategoriecomptableNoPaginateData,
  fetchcategoriecomptableNoPaginateSuccess,
  fetchcategoriecomptableNoPaginateFailure,
} from './categoriecomptable.action';

@Injectable()
export class CategoriecomptableEffects {

  // ── Fetch paginé ────────────────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchcategoriecomptableData),
      mergeMap(({ page }) =>
        this.categoriecomptableService.getAllCategoriecomptables(page ?? 1).pipe(
          map((response) => fetchcategoriecomptableSuccess({ response })),
          catchError((error) =>
            of(fetchcategoriecomptableFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Fetch sans pagination ───────────────────────────────────
  fetchlistNoPaginData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchcategoriecomptableNoPaginateData),
      mergeMap(() =>
        this.categoriecomptableService.getListCategoriecomptables().pipe(
          map((response) => fetchcategoriecomptableNoPaginateSuccess({ response })),
          catchError((error) =>
            of(fetchcategoriecomptableNoPaginateFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Ajouter ─────────────────────────────────────────────────
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addcategoriecomptableData),
      mergeMap(({ newData }) =>
        this.categoriecomptableService.createCategoriecomptable(newData).pipe(
          map((response) => addcategoriecomptableDataSuccess({ newData: response })),
          catchError((error) =>
            of(addcategoriecomptableDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger à la page 1 après ajout
  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addcategoriecomptableDataSuccess),
      map(() => fetchcategoriecomptableData({ page: 1 }))
    )
  );

  // ── Modifier ────────────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatecategoriecomptableData),
      mergeMap(({ updatedData }) =>
        this.categoriecomptableService.updateCategoriecomptable(updatedData).pipe(
          map(() => updatecategoriecomptableDataSuccess({ updatedData })),
          catchError((error) =>
            of(updatecategoriecomptableDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger la page courante après modification
  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatecategoriecomptableDataSuccess),
      mergeMap(() =>
        this.categoriecomptableService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchcategoriecomptableData({ page: currentPage }))
        )
      )
    )
  );

  // ── Supprimer (unitaire) ────────────────────────────────────
  deleteData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletecategoriecomptableData),
      mergeMap(({ id }) =>
        this.categoriecomptableService.deleteCategoriecomptable(id).pipe(
          map(() => deletecategoriecomptableSuccess({ id })),
          catchError((error) =>
            of(deletecategoriecomptableFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recalculer la page après suppression unitaire
  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletecategoriecomptableSuccess),
      mergeMap(() =>
        this.categoriecomptableService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchcategoriecomptableData({ page: targetPage });
          }),
          catchError(() => of(fetchcategoriecomptableData({ page: 1 })))
        )
      )
    )
  );

  // ── Supprimer (multiple) ────────────────────────────────────
  deleteMultipleData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultiplecategoriecomptableData),
      mergeMap(({ id }) => {
        if (!id || id.trim() === '') {
          return of(deletemultiplecategoriecomptableFailure({ error: 'Aucun ID valide' }));
        }

        const idArray = id
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultiplecategoriecomptableFailure({
            error: 'Aucun ID valide après conversion',
          }));
        }

        return this.categoriecomptableService.deleteMultipleCategoriecomptable(idArray).pipe(
          map(() => deletemultiplecategoriecomptableSuccess({ id })),
          catchError((error) =>
            of(deletemultiplecategoriecomptableFailure({ error: error.toString() }))
          )
        );
      })
    )
  );

  // Recalculer la page après suppression multiple
  deleteMultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultiplecategoriecomptableSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id.split(',').filter((s) => s.trim() !== '').length;

        return this.categoriecomptableService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchcategoriecomptableData({ page: targetPage });
          }),
          catchError(() => of(fetchcategoriecomptableData({ page: 1 })))
        );
      })
    )
  );

  constructor(
    private actions$: Actions,
    private categoriecomptableService: CategoriecomptableService  // ✅ CrudService supprimé
  ) {}
}
