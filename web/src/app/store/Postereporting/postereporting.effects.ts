// src/app/store/Postereporting/postereporting.effects.ts

import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { PostereportingService } from 'src/app/core/services/postereporting/postereporting.service';
import {
  addpostereportingData,
  addpostereportingDataFailure,
  addpostereportingDataSuccess,
  deletepostereportingData,
  deletepostereportingFailure,
  deletepostereportingSuccess,
  deletemultiplepostereportingData,
  deletemultiplepostereportingFailure,
  deletemultiplepostereportingSuccess,
  fetchpostereportingData,
  fetchpostereportingFailure,
  fetchpostereportingSuccess,
  updatepostereportingData,
  updatepostereportingDataFailure,
  updatepostereportingDataSuccess,
  fetchpostereportingNoPaginateData,
  fetchpostereportingNoPaginateSuccess,
  fetchpostereportingNoPaginateFailure,
} from './postereporting.action';

@Injectable()
export class PostereportingEffects {

  // ── Fetch paginé ────────────────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchpostereportingData),
      mergeMap(({ page }) =>
        this.postereportingService.getAllPostereportings(page ?? 1).pipe(
          map((response) => fetchpostereportingSuccess({ response })),
          catchError((error) =>
            of(fetchpostereportingFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Fetch sans pagination ───────────────────────────────────
  fetchlistNoPaginData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchpostereportingNoPaginateData),
      mergeMap(() =>
        this.postereportingService.getListPostereportings().pipe(
          map((response) => fetchpostereportingNoPaginateSuccess({ response })),
          catchError((error) =>
            of(fetchpostereportingNoPaginateFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Ajouter ─────────────────────────────────────────────────
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addpostereportingData),
      mergeMap(({ newData }) =>
        this.postereportingService.createPostereporting(newData).pipe(
          map((response) => addpostereportingDataSuccess({ newData: response })),
          catchError((error) =>
            of(addpostereportingDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger à la page 1 après ajout
  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addpostereportingDataSuccess),
      map(() => fetchpostereportingData({ page: 1 }))
    )
  );

  // ── Modifier ────────────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatepostereportingData),
      mergeMap(({ updatedData }) =>
        this.postereportingService.updatePostereporting(updatedData).pipe(
          map(() => updatepostereportingDataSuccess({ updatedData })),
          catchError((error) =>
            of(updatepostereportingDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger la page courante après modification
  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatepostereportingDataSuccess),
      mergeMap(() =>
        this.postereportingService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchpostereportingData({ page: currentPage }))
        )
      )
    )
  );

  // ── Supprimer (unitaire) ────────────────────────────────────
  deleteData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletepostereportingData),
      mergeMap(({ id }) =>
        this.postereportingService.deletePostereporting(id).pipe(
          map(() => deletepostereportingSuccess({ id })),
          catchError((error) =>
            of(deletepostereportingFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recalculer la page après suppression unitaire
  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletepostereportingSuccess),
      mergeMap(() =>
        this.postereportingService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchpostereportingData({ page: targetPage });
          }),
          catchError(() => of(fetchpostereportingData({ page: 1 })))
        )
      )
    )
  );

  // ── Supprimer (multiple) ────────────────────────────────────
  deleteMultipleData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultiplepostereportingData),
      mergeMap(({ id }) => {
        if (!id || id.trim() === '') {
          return of(deletemultiplepostereportingFailure({ error: 'Aucun ID valide' }));
        }

        const idArray = id
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultiplepostereportingFailure({
            error: 'Aucun ID valide après conversion',
          }));
        }

        return this.postereportingService.deleteMultiplePostereporting(idArray).pipe(
          map(() => deletemultiplepostereportingSuccess({ id })),
          catchError((error) =>
            of(deletemultiplepostereportingFailure({ error: error.toString() }))
          )
        );
      })
    )
  );

  // Recalculer la page après suppression multiple
  deleteMultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultiplepostereportingSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id.split(',').filter((s) => s.trim() !== '').length;

        return this.postereportingService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchpostereportingData({ page: targetPage });
          }),
          catchError(() => of(fetchpostereportingData({ page: 1 })))
        );
      })
    )
  );

  constructor(
    private actions$: Actions,
    private postereportingService: PostereportingService  // ✅ CrudService supprimé
  ) {}
}
