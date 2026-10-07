// src/app/store/Typebesoin/typebesoin.effects.ts

import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { TypebesoinService } from 'src/app/core/services/typebesoin/typebesoin.service';
import {
  addtypebesoinData,
  addtypebesoinDataFailure,
  addtypebesoinDataSuccess,
  deletetypebesoinData,
  deletetypebesoinFailure,
  deletetypebesoinSuccess,
  deletemultipletypebesoinData,
  deletemultipletypebesoinFailure,
  deletemultipletypebesoinSuccess,
  fetchtypebesoinData,
  fetchtypebesoinFailure,
  fetchtypebesoinSuccess,
  updatetypebesoinData,
  updatetypebesoinDataFailure,
  updatetypebesoinDataSuccess,
  fetchtypebesoinNoPaginateData,
  fetchtypebesoinNoPaginateSuccess,
  fetchtypebesoinNoPaginateFailure,
} from './typebesoin.action';

@Injectable()
export class TypebesoinEffects {

  // ── Fetch paginé ────────────────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchtypebesoinData),
      mergeMap(({ page }) =>
        this.typebesoinService.getAllTypebesoins(page ?? 1).pipe(
          map((response) => fetchtypebesoinSuccess({ response })),
          catchError((error) =>
            of(fetchtypebesoinFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Fetch sans pagination ───────────────────────────────────
  fetchlistNoPaginData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchtypebesoinNoPaginateData),
      mergeMap(() =>
        this.typebesoinService.getListTypebesoins().pipe(
          map((response) => fetchtypebesoinNoPaginateSuccess({ response })),
          catchError((error) =>
            of(fetchtypebesoinNoPaginateFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Ajouter ─────────────────────────────────────────────────
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addtypebesoinData),
      mergeMap(({ newData }) =>
        this.typebesoinService.createTypebesoin(newData).pipe(
          map((response) => addtypebesoinDataSuccess({ newData: response })),
          catchError((error) =>
            of(addtypebesoinDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger à la page 1 après ajout
  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addtypebesoinDataSuccess),
      map(() => fetchtypebesoinData({ page: 1 }))
    )
  );

  // ── Modifier ────────────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatetypebesoinData),
      mergeMap(({ updatedData }) =>
        this.typebesoinService.updateTypebesoin(updatedData).pipe(
          map(() => updatetypebesoinDataSuccess({ updatedData })),
          catchError((error) =>
            of(updatetypebesoinDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger la page courante après modification
  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatetypebesoinDataSuccess),
      mergeMap(() =>
        this.typebesoinService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchtypebesoinData({ page: currentPage }))
        )
      )
    )
  );

  // ── Supprimer (unitaire) ────────────────────────────────────
  deleteData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletetypebesoinData),
      mergeMap(({ id }) =>
        this.typebesoinService.deleteTypebesoin(id).pipe(
          map(() => deletetypebesoinSuccess({ id })),
          catchError((error) =>
            of(deletetypebesoinFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recalculer la page après suppression unitaire
  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletetypebesoinSuccess),
      mergeMap(() =>
        this.typebesoinService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchtypebesoinData({ page: targetPage });
          }),
          catchError(() => of(fetchtypebesoinData({ page: 1 })))
        )
      )
    )
  );

  // ── Supprimer (multiple) ────────────────────────────────────
  deleteMultipleData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipletypebesoinData),
      mergeMap(({ id }) => {
        if (!id || id.trim() === '') {
          return of(deletemultipletypebesoinFailure({ error: 'Aucun ID valide' }));
        }

        const idArray = id
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultipletypebesoinFailure({
            error: 'Aucun ID valide après conversion',
          }));
        }

        return this.typebesoinService.deleteMultipleTypebesoin(idArray).pipe(
          map(() => deletemultipletypebesoinSuccess({ id })),
          catchError((error) =>
            of(deletemultipletypebesoinFailure({ error: error.toString() }))
          )
        );
      })
    )
  );

  // Recalculer la page après suppression multiple
  deleteMultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipletypebesoinSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id.split(',').filter((s) => s.trim() !== '').length;

        return this.typebesoinService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchtypebesoinData({ page: targetPage });
          }),
          catchError(() => of(fetchtypebesoinData({ page: 1 })))
        );
      })
    )
  );

  constructor(
    private actions$: Actions,
    private typebesoinService: TypebesoinService  // ✅ CrudService supprimé
  ) {}
}
