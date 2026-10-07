// src/app/store/UserAgence/user-agence.effects.ts

import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of, forkJoin } from 'rxjs';
import { catchError, map, mergeMap, switchMap } from 'rxjs/operators';
import { UserAgenceService } from 'src/app/core/services/user-agence/user-agence.service';
import * as A from './user-agence.action';

@Injectable()
export class UserAgenceEffects {
  private actions$          = inject(Actions);
  private userAgenceService = inject(UserAgenceService);

  fetch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.fetchUserAgences),
      switchMap(({ userId }) =>
        this.userAgenceService.getByUser(userId).pipe(
          map(items => A.fetchUserAgencesSuccess({ items })),
          catchError(err => of(A.fetchUserAgencesFailure({ error: err?.error?.detail || 'Erreur chargement.' })))
        )
      )
    )
  );

  create$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.createUserAgence),
      mergeMap(({ data }) =>
        this.userAgenceService.create(data).pipe(
          map(item => A.createUserAgenceSuccess({ item })),
          catchError(err => of(A.createUserAgenceFailure({ error: err?.error?.detail || 'Erreur création.' })))
        )
      )
    )
  );

  update$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.updateUserAgence),
      mergeMap(({ id, data }) =>
        this.userAgenceService.update(id, data).pipe(
          map(item => A.updateUserAgenceSuccess({ item })),
          catchError(err => of(A.updateUserAgenceFailure({ error: err?.error?.detail || 'Erreur mise à jour.' })))
        )
      )
    )
  );

  delete$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.deleteUserAgence),
      mergeMap(({ id }) =>
        this.userAgenceService.delete(id).pipe(
          map(() => A.deleteUserAgenceSuccess({ id })),
          catchError(err => of(A.deleteUserAgenceFailure({ error: err?.error?.detail || 'Erreur suppression.' })))
        )
      )
    )
  );

  saveBatch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.saveUserAgencesBatch),
      mergeMap(({ userId, items }) => {
        if (items.length === 0) return of(A.saveUserAgencesBatchSuccess({ userId }));
        return forkJoin(items.map(i => this.userAgenceService.create({ ...i, user: userId }))).pipe(
          map(() => A.saveUserAgencesBatchSuccess({ userId })),
          catchError(err => of(A.saveUserAgencesBatchFailure({ error: err?.error?.detail || 'Erreur batch.' })))
        );
      })
    )
  );

  batchSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.saveUserAgencesBatchSuccess),
      map(({ userId }) => A.fetchUserAgences({ userId }))
    )
  );
}
