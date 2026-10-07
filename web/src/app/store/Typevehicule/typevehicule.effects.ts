// src/app/store/Typevehicule/typevehicule.effects.ts

import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { TypevehiculeService } from 'src/app/core/services/typevehicule/typevehicule.service';
import {
  addtypevehiculeData,
  addtypevehiculeDataFailure,
  addtypevehiculeDataSuccess,
  deletetypevehiculeData,
  deletetypevehiculeFailure,
  deletetypevehiculeSuccess,
  deletemultipletypevehiculeData,
  deletemultipletypevehiculeFailure,
  deletemultipletypevehiculeSuccess,
  fetchtypevehiculeData,
  fetchtypevehiculeFailure,
  fetchtypevehiculeSuccess,
  updatetypevehiculeData,
  updatetypevehiculeDataFailure,
  updatetypevehiculeDataSuccess,
  fetchtypevehiculeNoPaginateData,
  fetchtypevehiculeNoPaginateSuccess,
  fetchtypevehiculeNoPaginateFailure,
} from './typevehicule.action';

@Injectable()
export class TypevehiculeEffects {

  // ── Fetch paginé ────────────────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchtypevehiculeData),
      mergeMap(({ page }) =>
        this.typevehiculeService.getAllTypevehicules(page ?? 1).pipe(
          map((response) => fetchtypevehiculeSuccess({ response })),
          catchError((error) =>
            of(fetchtypevehiculeFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Fetch sans pagination ───────────────────────────────────
  fetchlistNoPaginData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchtypevehiculeNoPaginateData),
      mergeMap(() =>
        this.typevehiculeService.getListTypevehicules().pipe(
          map((response) => fetchtypevehiculeNoPaginateSuccess({ response })),
          catchError((error) =>
            of(fetchtypevehiculeNoPaginateFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Ajouter ─────────────────────────────────────────────────
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addtypevehiculeData),
      mergeMap(({ newData }) =>
        this.typevehiculeService.createTypevehicule(newData).pipe(
          map((response) => addtypevehiculeDataSuccess({ newData: response })),
          catchError((error) =>
            of(addtypevehiculeDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger à la page 1 après ajout
  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addtypevehiculeDataSuccess),
      map(() => fetchtypevehiculeData({ page: 1 }))
    )
  );

  // ── Modifier ────────────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatetypevehiculeData),
      mergeMap(({ updatedData }) =>
        this.typevehiculeService.updateTypevehicule(updatedData).pipe(
          map(() => updatetypevehiculeDataSuccess({ updatedData })),
          catchError((error) =>
            of(updatetypevehiculeDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger la page courante après modification
  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatetypevehiculeDataSuccess),
      mergeMap(() =>
        this.typevehiculeService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchtypevehiculeData({ page: currentPage }))
        )
      )
    )
  );

  // ── Supprimer (unitaire) ────────────────────────────────────
  deleteData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletetypevehiculeData),
      mergeMap(({ id }) =>
        this.typevehiculeService.deleteTypevehicule(id).pipe(
          map(() => deletetypevehiculeSuccess({ id })),
          catchError((error) =>
            of(deletetypevehiculeFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recalculer la page après suppression unitaire
  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletetypevehiculeSuccess),
      mergeMap(() =>
        this.typevehiculeService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchtypevehiculeData({ page: targetPage });
          }),
          catchError(() => of(fetchtypevehiculeData({ page: 1 })))
        )
      )
    )
  );

  // ── Supprimer (multiple) ────────────────────────────────────
  deleteMultipleData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipletypevehiculeData),
      mergeMap(({ id }) => {
        if (!id || id.trim() === '') {
          return of(deletemultipletypevehiculeFailure({ error: 'Aucun ID valide' }));
        }

        const idArray = id
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultipletypevehiculeFailure({
            error: 'Aucun ID valide après conversion',
          }));
        }

        return this.typevehiculeService.deleteMultipleTypevehicule(idArray).pipe(
          map(() => deletemultipletypevehiculeSuccess({ id })),
          catchError((error) =>
            of(deletemultipletypevehiculeFailure({ error: error.toString() }))
          )
        );
      })
    )
  );

  // Recalculer la page après suppression multiple
  deleteMultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipletypevehiculeSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id.split(',').filter((s) => s.trim() !== '').length;

        return this.typevehiculeService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchtypevehiculeData({ page: targetPage });
          }),
          catchError(() => of(fetchtypevehiculeData({ page: 1 })))
        );
      })
    )
  );

  constructor(
    private actions$: Actions,
    private typevehiculeService: TypevehiculeService  // ✅ CrudService supprimé
  ) {}
}
