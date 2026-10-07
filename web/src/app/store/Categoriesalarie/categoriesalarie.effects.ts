// src/app/store/Categoriesalarie/categoriesalarie.effects.ts

import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { CategoriesalarieService } from 'src/app/core/services/categoriesalarie/categoriesalarie.service';

import {
  addcategoriesalarieData,
  addcategoriesalarieDataFailure,
  addcategoriesalarieDataSuccess,

  deletecategoriesalarieData,
  deletecategoriesalarieFailure,
  deletecategoriesalarieSuccess,

  deletemultiplecategoriesalarieData,
  deletemultiplecategoriesalarieSuccess,
  deletemultiplecategoriesalarieFailure,

  fetchcategoriesalarieData,
  fetchcategoriesalarieFailure,
  fetchcategoriesalarieSuccess,

  updatecategoriesalarieData,
  updatecategoriesalarieDataFailure,
  updatecategoriesalarieDataSuccess,

  fetchcategoriesalarieNoPaginateData,
  fetchcategoriesalarieNoPaginateSuccess,
  fetchcategoriesalarieNoPaginateFailure,
} from './categoriesalarie.action';

@Injectable()
export class CategoriesalarieEffects {

  constructor(
    private actions$: Actions,
    private CategoriesalarieService: CategoriesalarieService,
  ) {}

  // ── Charger liste paginée ─────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchcategoriesalarieData),
      mergeMap(({ page }) =>
        this.CategoriesalarieService.getAllCategoriesalaries(page || 1).pipe(
          map(response => fetchcategoriesalarieSuccess({ response })),
          catchError(error => of(fetchcategoriesalarieFailure({ error: error.toString() })))
        )
      )
    )
  );

  // ── Charger liste sans pagination ─────────────────────────
  fetchlistNoPaginData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchcategoriesalarieNoPaginateData),
      mergeMap(() =>
        this.CategoriesalarieService.getListCategoriesalaries().pipe(
          map(response => fetchcategoriesalarieNoPaginateSuccess({ response })),
          catchError(error => of(fetchcategoriesalarieNoPaginateFailure({ error: error.toString() })))
        )
      )
    )
  );

  // ── Ajouter ───────────────────────────────────────────────
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addcategoriesalarieData),
      mergeMap(({ newData }) =>
        this.CategoriesalarieService.createCategoriesalarie(newData).pipe(
          map(response => addcategoriesalarieDataSuccess({ newData: response })),
          catchError(error => of(addcategoriesalarieDataFailure({ error: error.toString() })))
        )
      )
    )
  );

  // Recharger page 1 après ajout
  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addcategoriesalarieDataSuccess),
      map(() => fetchcategoriesalarieData({ page: 1 }))
    )
  );

  // ── Mettre à jour ─────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatecategoriesalarieData),
      mergeMap(({ updatedData }) =>
        this.CategoriesalarieService.updateCategoriesalarie(updatedData).pipe(
          map(() => updatecategoriesalarieDataSuccess({ updatedData })),
          catchError(error => of(updatecategoriesalarieDataFailure({ error: error.toString() })))
        )
      )
    )
  );

  // Recharger page courante après mise à jour
  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatecategoriesalarieDataSuccess),
      mergeMap(() =>
        this.CategoriesalarieService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchcategoriesalarieData({ page: currentPage }))
        )
      )
    )
  );

  // ── Supprimer un élément ──────────────────────────────────
  deleteData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletecategoriesalarieData),
      mergeMap(({ id }) =>
        this.CategoriesalarieService.deleteCategoriesalarie(id).pipe(
          map(() => deletecategoriesalarieSuccess({ id })),
          catchError(error => of(deletecategoriesalarieFailure({ error: error.toString() })))
        )
      )
    )
  );

  // Recharger après suppression simple
  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletecategoriesalarieSuccess),
      mergeMap(() =>
        this.CategoriesalarieService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const page = currentPage > totalPages ? Math.max(totalPages, 1) : currentPage;
            return fetchcategoriesalarieData({ page });
          }),
          catchError(() => of(fetchcategoriesalarieData({ page: 1 })))
        )
      )
    )
  );

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultiplecategoriesalarieData),
      mergeMap(({ id }) => {
        const idArray = id
          .split(',')
          .map(s => parseInt(s.trim()))
          .filter(n => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultiplecategoriesalarieFailure({ error: 'Aucun ID valide' }));
        }

        return this.CategoriesalarieService.deleteMultipleCategoriesalarie(idArray).pipe(
          map(() => deletemultiplecategoriesalarieSuccess({ id })),
          catchError(error => of(deletemultiplecategoriesalarieFailure({ error: error.toString() })))
        );
      })
    )
  );

  // Recharger après suppression multiple
  deletemultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultiplecategoriesalarieSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id.split(',').filter(s => s.trim() !== '').length;
        return this.CategoriesalarieService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const page = currentPage > totalPages ? Math.max(totalPages, 1) : currentPage;
            return fetchcategoriesalarieData({ page });
          }),
          catchError(() => of(fetchcategoriesalarieData({ page: 1 })))
        );
      })
    )
  );
}
