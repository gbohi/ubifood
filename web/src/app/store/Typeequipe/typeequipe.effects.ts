// src/app/store/Typeequipe/typeequipe.effects.ts

import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { TypeequipeService } from 'src/app/core/services/typeequipe/typeequipe.service';
import {
  addtypeequipeData,
  addtypeequipeDataFailure,
  addtypeequipeDataSuccess,
  deletetypeequipeData,
  deletetypeequipeFailure,
  deletetypeequipeSuccess,
  deletemultipletypeequipeData,
  deletemultipletypeequipeFailure,
  deletemultipletypeequipeSuccess,
  fetchtypeequipeData,
  fetchtypeequipeFailure,
  fetchtypeequipeSuccess,
  updatetypeequipeData,
  updatetypeequipeDataFailure,
  updatetypeequipeDataSuccess,
  fetchtypeequipeNoPaginateData,
  fetchtypeequipeNoPaginateSuccess,
  fetchtypeequipeNoPaginateFailure,
} from './typeequipe.action';

@Injectable()
export class TypeequipeEffects {

  // ── Fetch paginé ────────────────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchtypeequipeData),
      mergeMap(({ page }) =>
        this.typeequipeService.getAllTypeequipes(page ?? 1).pipe(
          map((response) => fetchtypeequipeSuccess({ response })),
          catchError((error) =>
            of(fetchtypeequipeFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Fetch sans pagination ───────────────────────────────────
  fetchlistNoPaginData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchtypeequipeNoPaginateData),
      mergeMap(() =>
        this.typeequipeService.getListTypeequipes().pipe(
          map((response) => fetchtypeequipeNoPaginateSuccess({ response })),
          catchError((error) =>
            of(fetchtypeequipeNoPaginateFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Ajouter ─────────────────────────────────────────────────
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addtypeequipeData),
      mergeMap(({ newData }) =>
        this.typeequipeService.createTypeequipe(newData).pipe(
          map((response) => addtypeequipeDataSuccess({ newData: response })),
          catchError((error) =>
            of(addtypeequipeDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger à la page 1 après ajout
  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addtypeequipeDataSuccess),
      map(() => fetchtypeequipeData({ page: 1 }))
    )
  );

  // ── Modifier ────────────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatetypeequipeData),
      mergeMap(({ updatedData }) =>
        this.typeequipeService.updateTypeequipe(updatedData).pipe(
          map(() => updatetypeequipeDataSuccess({ updatedData })),
          catchError((error) =>
            of(updatetypeequipeDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger la page courante après modification
  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatetypeequipeDataSuccess),
      mergeMap(() =>
        this.typeequipeService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchtypeequipeData({ page: currentPage }))
        )
      )
    )
  );

  // ── Supprimer (unitaire) ────────────────────────────────────
  deleteData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletetypeequipeData),
      mergeMap(({ id }) =>
        this.typeequipeService.deleteTypeequipe(id).pipe(
          map(() => deletetypeequipeSuccess({ id })),
          catchError((error) =>
            of(deletetypeequipeFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recalculer la page après suppression unitaire
  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletetypeequipeSuccess),
      mergeMap(() =>
        this.typeequipeService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchtypeequipeData({ page: targetPage });
          }),
          catchError(() => of(fetchtypeequipeData({ page: 1 })))
        )
      )
    )
  );

  // ── Supprimer (multiple) ────────────────────────────────────
  deleteMultipleData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipletypeequipeData),
      mergeMap(({ id }) => {
        if (!id || id.trim() === '') {
          return of(deletemultipletypeequipeFailure({ error: 'Aucun ID valide' }));
        }

        const idArray = id
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultipletypeequipeFailure({
            error: 'Aucun ID valide après conversion',
          }));
        }

        return this.typeequipeService.deleteMultipleTypeequipe(idArray).pipe(
          map(() => deletemultipletypeequipeSuccess({ id })),
          catchError((error) =>
            of(deletemultipletypeequipeFailure({ error: error.toString() }))
          )
        );
      })
    )
  );

  // Recalculer la page après suppression multiple
  deleteMultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipletypeequipeSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id.split(',').filter((s) => s.trim() !== '').length;

        return this.typeequipeService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchtypeequipeData({ page: targetPage });
          }),
          catchError(() => of(fetchtypeequipeData({ page: 1 })))
        );
      })
    )
  );

  constructor(
    private actions$: Actions,
    private typeequipeService: TypeequipeService  // ✅ CrudService supprimé
  ) {}
}
