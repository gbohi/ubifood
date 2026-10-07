// src/app/store/Classecomptable/classecomptable.effects.ts

import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { ClassecomptableService } from 'src/app/core/services/classecomptable/classecomptable.service';
import {
  addclassecomptableData,
  addclassecomptableDataFailure,
  addclassecomptableDataSuccess,
  deleteclassecomptableData,
  deleteclassecomptableFailure,
  deleteclassecomptableSuccess,
  deletemultipleclassecomptableData,
  deletemultipleclassecomptableFailure,
  deletemultipleclassecomptableSuccess,
  fetchclassecomptableData,
  fetchclassecomptableFailure,
  fetchclassecomptableSuccess,
  updateclassecomptableData,
  updateclassecomptableDataFailure,
  updateclassecomptableDataSuccess,
  fetchclassecomptableNoPaginateData,
  fetchclassecomptableNoPaginateSuccess,
  fetchclassecomptableNoPaginateFailure,
} from './classecomptable.action';

@Injectable()
export class ClassecomptableEffects {

  // ── Fetch paginé ────────────────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchclassecomptableData),
      mergeMap(({ page }) =>
        this.classecomptableService.getAllClassecomptables(page ?? 1).pipe(
          map((response) => fetchclassecomptableSuccess({ response })),
          catchError((error) =>
            of(fetchclassecomptableFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Fetch sans pagination ───────────────────────────────────
  fetchlistNoPaginData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchclassecomptableNoPaginateData),
      mergeMap(() =>
        this.classecomptableService.getListClassecomptables().pipe(
          map((response) => fetchclassecomptableNoPaginateSuccess({ response })),
          catchError((error) =>
            of(fetchclassecomptableNoPaginateFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Ajouter ─────────────────────────────────────────────────
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addclassecomptableData),
      mergeMap(({ newData }) =>
        this.classecomptableService.createClassecomptable(newData).pipe(
          map((response) => addclassecomptableDataSuccess({ newData: response })),
          catchError((error) =>
            of(addclassecomptableDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger à la page 1 après ajout
  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addclassecomptableDataSuccess),
      map(() => fetchclassecomptableData({ page: 1 }))
    )
  );

  // ── Modifier ────────────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updateclassecomptableData),
      mergeMap(({ updatedData }) =>
        this.classecomptableService.updateClassecomptable(updatedData).pipe(
          map(() => updateclassecomptableDataSuccess({ updatedData })),
          catchError((error) =>
            of(updateclassecomptableDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger la page courante après modification
  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updateclassecomptableDataSuccess),
      mergeMap(() =>
        this.classecomptableService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchclassecomptableData({ page: currentPage }))
        )
      )
    )
  );

  // ── Supprimer (unitaire) ────────────────────────────────────
  deleteData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteclassecomptableData),
      mergeMap(({ id }) =>
        this.classecomptableService.deleteClassecomptable(id).pipe(
          map(() => deleteclassecomptableSuccess({ id })),
          catchError((error) =>
            of(deleteclassecomptableFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recalculer la page après suppression unitaire
  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteclassecomptableSuccess),
      mergeMap(() =>
        this.classecomptableService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchclassecomptableData({ page: targetPage });
          }),
          catchError(() => of(fetchclassecomptableData({ page: 1 })))
        )
      )
    )
  );

  // ── Supprimer (multiple) ────────────────────────────────────
  deleteMultipleData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipleclassecomptableData),
      mergeMap(({ id }) => {
        if (!id || id.trim() === '') {
          return of(deletemultipleclassecomptableFailure({ error: 'Aucun ID valide' }));
        }

        const idArray = id
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultipleclassecomptableFailure({
            error: 'Aucun ID valide après conversion',
          }));
        }

        return this.classecomptableService.deleteMultipleClassecomptable(idArray).pipe(
          map(() => deletemultipleclassecomptableSuccess({ id })),
          catchError((error) =>
            of(deletemultipleclassecomptableFailure({ error: error.toString() }))
          )
        );
      })
    )
  );

  // Recalculer la page après suppression multiple
  deleteMultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipleclassecomptableSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id.split(',').filter((s) => s.trim() !== '').length;

        return this.classecomptableService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchclassecomptableData({ page: targetPage });
          }),
          catchError(() => of(fetchclassecomptableData({ page: 1 })))
        );
      })
    )
  );

  constructor(
    private actions$: Actions,
    private classecomptableService: ClassecomptableService  // ✅ CrudService supprimé
  ) {}
}
