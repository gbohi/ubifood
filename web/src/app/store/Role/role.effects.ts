// src/app/store/Role/role.effects.ts

import { Injectable, inject } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { RoleService } from 'src/app/core/services/role/role.service';
import {
  addroleData, addroleDataSuccess, addroleDataFailure,
  updateroleData, updateroleDataSuccess, updateroleDataFailure,
  deleteroleData, deleteroleSuccess, deleteroleFailure,
  deletemultipleroleData, deletemultipleroleSuccess, deletemultipleroleFailure,
  fetchroleData, fetchroleSuccess, fetchroleFailure,
} from './role.action';

@Injectable()
export class RoleEffects {

  private actions$    = inject(Actions);
  private roleService = inject(RoleService);

  // ── Fetch ─────────────────────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchroleData),
      mergeMap(({ page }) =>
        this.roleService.getAllRoles(page || 1).pipe(
          map(response => fetchroleSuccess({ response })),
          catchError(error => of(fetchroleFailure({ error: error.toString() })))
        )
      )
    )
  );

  // ── Ajouter ───────────────────────────────────────────────
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addroleData),
      mergeMap(({ newData }) =>
        this.roleService.createRole(newData).pipe(
          map(response => addroleDataSuccess({ newData: response })),
          catchError(error => of(addroleDataFailure({ error: error.toString() })))
        )
      )
    )
  );

  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addroleDataSuccess),
      map(() => fetchroleData({ page: 1 }))
    )
  );

  // ── Mettre à jour ─────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updateroleData),
      mergeMap(({ updatedData }) =>
        this.roleService.updateRole(updatedData).pipe(
          map(() => updateroleDataSuccess({ updatedData })),
          catchError(error => of(updateroleDataFailure({ error: error.toString() })))
        )
      )
    )
  );

  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updateroleDataSuccess),
      mergeMap(() =>
        this.roleService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchroleData({ page: currentPage }))
        )
      )
    )
  );

  // ── Supprimer un élément ──────────────────────────────────
  deleteData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteroleData),
      mergeMap(({ id }) =>
        this.roleService.deleteRole(id).pipe(
          map(() => deleteroleSuccess({ id })),
          catchError(error => of(deleteroleFailure({ error: error.toString() })))
        )
      )
    )
  );

  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteroleSuccess),
      mergeMap(() =>
        this.roleService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const page = currentPage > totalPages ? Math.max(totalPages, 1) : currentPage;
            return fetchroleData({ page });
          }),
          catchError(() => of(fetchroleData({ page: 1 })))
        )
      )
    )
  );

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipleroleData),
      mergeMap(({ id }) => {
        const idArray = id.split(',')
          .map(s => parseInt(s.trim()))
          .filter(n => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultipleroleFailure({ error: 'Aucun ID valide' }));
        }

        return this.roleService.deleteMultipleRole(idArray).pipe(
          map(() => deletemultipleroleSuccess({ id })),
          catchError(error => of(deletemultipleroleFailure({ error: error.toString() })))
        );
      })
    )
  );

  deleteMultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipleroleSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id.split(',').filter(s => s.trim() !== '').length;
        return this.roleService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const page = currentPage > totalPages ? Math.max(totalPages, 1) : currentPage;
            return fetchroleData({ page });
          }),
          catchError(() => of(fetchroleData({ page: 1 })))
        );
      })
    )
  );
}
