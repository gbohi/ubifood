// src/app/store/Menu/menu.effects.ts
import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap, switchMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { MenuService } from 'src/app/core/services/menu/menu.service';
import {
  fetchmenuData,
  fetchmenuSuccess,
  fetchmenuFailure,
  fetchmenuNoPaginateData,
  fetchmenuNoPaginateSuccess,
  fetchmenuNoPaginateFailure,
  addmenuData,
  addmenuDataSuccess,
  addmenuDataFailure,
  updatemenuData,
  updatemenuDataSuccess,
  updatemenuDataFailure,
  deletemenuData,
  deletemenuSuccess,
  deletemenuFailure,
  deletemultiplemenuData,
  deletemultiplemenuSuccess,
  deletemultiplemenuFailure,
} from './menu.action';

@Injectable()
export class MenuEffects {

  // ── FETCH paginé ─────────────────────────────────────────────

  fetchList$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchmenuData),
      switchMap(({ page }) =>
        this.menuService.getAllMenus(page ?? 1).pipe(
          map((response) => fetchmenuSuccess({ response })),
          catchError((error) =>
            of(fetchmenuFailure({ error: error?.message ?? error.toString() }))
          )
        )
      )
    )
  );

  // ── FETCH sans pagination ─────────────────────────────────────

  fetchNoPaginate$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchmenuNoPaginateData),
      switchMap(() =>
        this.menuService.getListMenus().pipe(
          map((response) => fetchmenuNoPaginateSuccess({ response })),
          catchError((error) =>
            of(fetchmenuNoPaginateFailure({ error: error?.message ?? error.toString() }))
          )
        )
      )
    )
  );

  // ── CRÉATION ─────────────────────────────────────────────────

  add$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addmenuData),
      mergeMap(({ newData }) =>
        this.menuService.createMenu(newData).pipe(
          map((response) => addmenuDataSuccess({ newData: response })),
          catchError((error) =>
            of(addmenuDataFailure({ error: error?.message ?? 'Erreur inconnue' }))
          )
        )
      )
    )
  );

  // Rechargement après création
  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addmenuDataSuccess),
      switchMap(() =>
        this.menuService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchmenuData({ page: currentPage || 1 })),
          catchError(() => of(fetchmenuData({ page: 1 })))
        )
      )
    )
  );

  // ── MISE À JOUR ───────────────────────────────────────────────

  update$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatemenuData),
      mergeMap(({ updatedData }) =>
        this.menuService.updateMenu(updatedData).pipe(
          map((response) => updatemenuDataSuccess({ updatedData: response })),
          catchError((error) =>
            of(updatemenuDataFailure({ error: error?.message ?? 'Erreur inconnue' }))
          )
        )
      )
    )
  );

  // Rechargement après mise à jour
  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatemenuDataSuccess),
      switchMap(() =>
        this.menuService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchmenuData({ page: currentPage })),
          catchError(() => of(fetchmenuData({ page: 1 })))
        )
      )
    )
  );

  // ── SUPPRESSION simple ────────────────────────────────────────

  delete$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemenuData),
      mergeMap(({ id }) =>
        this.menuService.deleteMenu(id).pipe(
          map(() => deletemenuSuccess({ id })),
          catchError((error) =>
            of(deletemenuFailure({ error: error?.message ?? error.toString() }))
          )
        )
      )
    )
  );

  deleteSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemenuSuccess),
      switchMap(() =>
        this.menuService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchmenuData({ page: targetPage });
          }),
          catchError(() => of(fetchmenuData({ page: 1 })))
        )
      )
    )
  );

  // ── SUPPRESSION multiple ──────────────────────────────────────

  deleteMultiple$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultiplemenuData),
      mergeMap(({ id }) => {
        const idArray = id
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultiplemenuFailure({ error: 'Aucun ID valide fourni' }));
        }

        return this.menuService.deleteMultipleMenu(idArray).pipe(
          map(() => deletemultiplemenuSuccess({ id })),
          catchError((error) =>
            of(deletemultiplemenuFailure({ error: error?.message ?? error.toString() }))
          )
        );
      })
    )
  );

  deleteMultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultiplemenuSuccess),
      switchMap(({ id }) => {
        const deletedCount = id.split(',').filter((s) => s.trim() !== '').length;

        return this.menuService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchmenuData({ page: targetPage });
          }),
          catchError(() => of(fetchmenuData({ page: 1 })))
        );
      })
    )
  );

  constructor(
    private actions$: Actions,
    private menuService: MenuService
  ) {}
}
