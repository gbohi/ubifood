// src/app/store/Typeplat/typeplat.effects.ts

import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { TypeplatService } from 'src/app/core/services/typeplat/typeplat.service';
import {
  addtypeplatData,
  addtypeplatDataFailure,
  addtypeplatDataSuccess,
  deletetypeplatData,
  deletetypeplatFailure,
  deletetypeplatSuccess,
  deletemultipletypeplatData,
  deletemultipletypeplatFailure,
  deletemultipletypeplatSuccess,
  fetchtypeplatData,
  fetchtypeplatFailure,
  fetchtypeplatSuccess,
  updatetypeplatData,
  updatetypeplatDataFailure,
  updatetypeplatDataSuccess,
  fetchtypeplatNoPaginateData,
  fetchtypeplatNoPaginateSuccess,
  fetchtypeplatNoPaginateFailure,
} from './typeplat.action';

@Injectable()
export class TypeplatEffects {

  // ── Fetch paginé ────────────────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchtypeplatData),
      mergeMap(({ page }) =>
        this.typeplatService.getAllTypeplats(page ?? 1).pipe(
          map((response) => fetchtypeplatSuccess({ response })),
          catchError((error) =>
            of(fetchtypeplatFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Fetch sans pagination ───────────────────────────────────
  fetchlistNoPaginData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchtypeplatNoPaginateData),
      mergeMap(() =>
        this.typeplatService.getListTypeplats().pipe(
          map((response) => fetchtypeplatNoPaginateSuccess({ response })),
          catchError((error) =>
            of(fetchtypeplatNoPaginateFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Ajouter ─────────────────────────────────────────────────
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addtypeplatData),
      mergeMap(({ newData }) =>
        this.typeplatService.createTypeplat(newData).pipe(
          map((response) => addtypeplatDataSuccess({ newData: response })),
          catchError((error) =>
            of(addtypeplatDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger à la page 1 après ajout
  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addtypeplatDataSuccess),
      map(() => fetchtypeplatData({ page: 1 }))
    )
  );

  // ── Modifier ────────────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatetypeplatData),
      mergeMap(({ updatedData }) =>
        this.typeplatService.updateTypeplat(updatedData).pipe(
          map(() => updatetypeplatDataSuccess({ updatedData })),
          catchError((error) =>
            of(updatetypeplatDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger la page courante après modification
  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatetypeplatDataSuccess),
      mergeMap(() =>
        this.typeplatService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchtypeplatData({ page: currentPage }))
        )
      )
    )
  );

  // ── Supprimer (unitaire) ────────────────────────────────────
  deleteData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletetypeplatData),
      mergeMap(({ id }) =>
        this.typeplatService.deleteTypeplat(id).pipe(
          map(() => deletetypeplatSuccess({ id })),
          catchError((error) =>
            of(deletetypeplatFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recalculer la page après suppression unitaire
  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletetypeplatSuccess),
      mergeMap(() =>
        this.typeplatService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchtypeplatData({ page: targetPage });
          }),
          catchError(() => of(fetchtypeplatData({ page: 1 })))
        )
      )
    )
  );

  // ── Supprimer (multiple) ────────────────────────────────────
  deleteMultipleData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipletypeplatData),
      mergeMap(({ id }) => {
        if (!id || id.trim() === '') {
          return of(deletemultipletypeplatFailure({ error: 'Aucun ID valide' }));
        }

        const idArray = id
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultipletypeplatFailure({
            error: 'Aucun ID valide après conversion',
          }));
        }

        return this.typeplatService.deleteMultipleTypeplat(idArray).pipe(
          map(() => deletemultipletypeplatSuccess({ id })),
          catchError((error) =>
            of(deletemultipletypeplatFailure({ error: error.toString() }))
          )
        );
      })
    )
  );

  // Recalculer la page après suppression multiple
  deleteMultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipletypeplatSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id.split(',').filter((s) => s.trim() !== '').length;

        return this.typeplatService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchtypeplatData({ page: targetPage });
          }),
          catchError(() => of(fetchtypeplatData({ page: 1 })))
        );
      })
    )
  );

  constructor(
    private actions$: Actions,
    private typeplatService: TypeplatService  // ✅ CrudService supprimé
  ) {}
}
