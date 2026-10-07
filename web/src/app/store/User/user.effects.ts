// src/app/store/User/user.effects.ts

import { Injectable, inject } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { UserService } from 'src/app/core/services/user/user.service';
import {
  fetchuserData, fetchuserSuccess, fetchuserFailure,
  fetchuserNoPaginateData, fetchuserNoPaginateSuccess, fetchuserNoPaginateFailure,
  adduserData, adduserDataSuccess, adduserDataFailure,
  updateuserData, updateuserDataSuccess, updateuserDataFailure,
  deleteuserData, deleteuserSuccess, deleteuserFailure,
  deletemultipleuserData, deletemultipleuserSuccess, deletemultipleuserFailure,
  activerUser, activerUserSuccess, activerUserFailure,
  desactiverUser, desactiverUserSuccess, desactiverUserFailure,
  activerMultipleUsers, activerMultipleUsersSuccess, activerMultipleUsersFailure,
  desactiverMultipleUsers, desactiverMultipleUsersSuccess, desactiverMultipleUsersFailure,
  changerMotDePasse, changerMotDePasseSuccess, changerMotDePasseFailure,
} from './user.action';

@Injectable()
export class UserEffects {

  private actions$    = inject(Actions);
  private userService = inject(UserService);

  // ── Fetch paginé ─────────────────────────────────────────────
  fetch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchuserData),
      mergeMap(({ page }) =>
        this.userService.getAllUsers(page ?? 1).pipe(
          map(response => fetchuserSuccess({ response })),
          catchError(error => of(fetchuserFailure({ error: error.toString() })))
        )
      )
    )
  );

  // ── ✅ Fetch sans pagination (pour les selects) ───────────────
  fetchNoPaginate$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchuserNoPaginateData),
      mergeMap(() =>
        this.userService.getListUsers().pipe(
          map(response => fetchuserNoPaginateSuccess({ response })),
          catchError(error => of(fetchuserNoPaginateFailure({ error: error.toString() })))
        )
      )
    )
  );

  // ── Ajouter ──────────────────────────────────────────────────
  add$ = createEffect(() =>
    this.actions$.pipe(
      ofType(adduserData),
      mergeMap(({ newData }) =>
        this.userService.createUser(newData).pipe(
          map(response => adduserDataSuccess({ newData: response })),
          catchError(error => of(adduserDataFailure({ error: error.toString() })))
        )
      )
    )
  );

  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(adduserDataSuccess),
      map(() => fetchuserData({ page: 1 }))
    )
  );

  // ── Modifier ─────────────────────────────────────────────────
  update$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updateuserData),
      mergeMap(({ updatedData }) =>
        this.userService.updateUser(updatedData).pipe(
          map(() => updateuserDataSuccess({ updatedData })),
          catchError(error => of(updateuserDataFailure({ error: error.toString() })))
        )
      )
    )
  );

  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updateuserDataSuccess),
      mergeMap(() =>
        this.userService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchuserData({ page: currentPage }))
        )
      )
    )
  );

  // ── Supprimer (unitaire) ──────────────────────────────────────
  delete$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteuserData),
      mergeMap(({ id }) =>
        this.userService.deleteUser(id).pipe(
          map(() => deleteuserSuccess({ id })),
          catchError(error => of(deleteuserFailure({ error: error.toString() })))
        )
      )
    )
  );

  deleteSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteuserSuccess),
      mergeMap(() =>
        this.userService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const page = currentPage > totalPages ? Math.max(totalPages, 1) : currentPage;
            return fetchuserData({ page });
          }),
          catchError(() => of(fetchuserData({ page: 1 })))
        )
      )
    )
  );

  // ── Supprimer (multiple) ──────────────────────────────────────
  deleteMultiple$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipleuserData),
      mergeMap(({ id }) => {
        const idArray = id.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
        if (idArray.length === 0) {
          return of(deletemultipleuserFailure({ error: 'Aucun ID valide' }));
        }
        return this.userService.deleteMultipleUser(idArray).pipe(
          map(() => deletemultipleuserSuccess({ id })),
          catchError(error => of(deletemultipleuserFailure({ error: error.toString() })))
        );
      })
    )
  );

  deleteMultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipleuserSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id.split(',').filter(s => s.trim() !== '').length;
        return this.userService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const page = currentPage > totalPages ? Math.max(totalPages, 1) : currentPage;
            return fetchuserData({ page });
          }),
          catchError(() => of(fetchuserData({ page: 1 })))
        );
      })
    )
  );

  // ── Activer / Désactiver ──────────────────────────────────────
  activer$ = createEffect(() =>
    this.actions$.pipe(
      ofType(activerUser),
      mergeMap(({ id }) =>
        this.userService.activerUser(id).pipe(
          map(() => activerUserSuccess({ id })),
          catchError(error => of(activerUserFailure({ error: error.toString() })))
        )
      )
    )
  );

  activerSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(activerUserSuccess),
      mergeMap(() =>
        this.userService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchuserData({ page: currentPage }))
        )
      )
    )
  );

  desactiver$ = createEffect(() =>
    this.actions$.pipe(
      ofType(desactiverUser),
      mergeMap(({ id }) =>
        this.userService.desactiverUser(id).pipe(
          map(() => desactiverUserSuccess({ id })),
          catchError(error => of(desactiverUserFailure({ error: error.toString() })))
        )
      )
    )
  );

  desactiverSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(desactiverUserSuccess),
      mergeMap(() =>
        this.userService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchuserData({ page: currentPage }))
        )
      )
    )
  );

  // ── Activer / Désactiver multiple ────────────────────────────
  activerMultiple$ = createEffect(() =>
    this.actions$.pipe(
      ofType(activerMultipleUsers),
      mergeMap(({ ids }) =>
        this.userService.activerMultipleUsers(ids).pipe(
          map(() => activerMultipleUsersSuccess({ ids })),
          catchError(error => of(activerMultipleUsersFailure({ error: error.toString() })))
        )
      )
    )
  );

  activerMultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(activerMultipleUsersSuccess),
      mergeMap(() =>
        this.userService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchuserData({ page: currentPage }))
        )
      )
    )
  );

  desactiverMultiple$ = createEffect(() =>
    this.actions$.pipe(
      ofType(desactiverMultipleUsers),
      mergeMap(({ ids }) =>
        this.userService.desactiverMultipleUsers(ids).pipe(
          map(() => desactiverMultipleUsersSuccess({ ids })),
          catchError(error => of(desactiverMultipleUsersFailure({ error: error.toString() })))
        )
      )
    )
  );

  desactiverMultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(desactiverMultipleUsersSuccess),
      mergeMap(() =>
        this.userService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchuserData({ page: currentPage }))
        )
      )
    )
  );

  // ── Changer mot de passe ──────────────────────────────────────
  changerMotDePasse$ = createEffect(() =>
    this.actions$.pipe(
      ofType(changerMotDePasse),
      mergeMap(({ id, password }) =>
        this.userService.changerMotDePasse(id, password).pipe(
          map(() => changerMotDePasseSuccess()),
          catchError(error => of(changerMotDePasseFailure({ error: error.toString() })))
        )
      )
    )
  );
}
