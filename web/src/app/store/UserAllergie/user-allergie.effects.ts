// src/app/store/UserAllergie/user-allergie.effects.ts

import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of, forkJoin } from 'rxjs';
import { catchError, map, mergeMap, switchMap } from 'rxjs/operators';
import { UserAllergieService } from 'src/app/core/services/user-allergie/user-allergie.service';
import * as A from './user-allergie.action';

@Injectable()
export class UserAllergieEffects {
  private actions$            = inject(Actions);
  private userAllergieService = inject(UserAllergieService);

  fetch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.fetchUserAllergies),
      switchMap(({ userId }) =>
        this.userAllergieService.getByUser(userId).pipe(
          map(items => A.fetchUserAllergiesSuccess({ items })),
          catchError(err => of(A.fetchUserAllergiesFailure({ error: err?.error?.detail || 'Erreur chargement.' })))
        )
      )
    )
  );

  create$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.createUserAllergie),
      mergeMap(({ data }) =>
        this.userAllergieService.create(data).pipe(
          map(item => A.createUserAllergieSuccess({ item })),
          catchError(err => of(A.createUserAllergieFailure({ error: err?.error?.detail || 'Erreur création.' })))
        )
      )
    )
  );

  update$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.updateUserAllergie),
      mergeMap(({ id, data }) =>
        this.userAllergieService.update(id, data).pipe(
          map(item => A.updateUserAllergieSuccess({ item })),
          catchError(err => of(A.updateUserAllergieFailure({ error: err?.error?.detail || 'Erreur mise à jour.' })))
        )
      )
    )
  );

  delete$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.deleteUserAllergie),
      mergeMap(({ id }) =>
        this.userAllergieService.delete(id).pipe(
          map(() => A.deleteUserAllergieSuccess({ id })),
          catchError(err => of(A.deleteUserAllergieFailure({ error: err?.error?.detail || 'Erreur suppression.' })))
        )
      )
    )
  );

  saveBatch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.saveUserAllergiesBatch),
      mergeMap(({ userId, items }) => {
        if (items.length === 0) return of(A.saveUserAllergiesBatchSuccess({ userId }));
        return forkJoin(items.map(i => this.userAllergieService.create({ ...i, user: userId }))).pipe(
          map(() => A.saveUserAllergiesBatchSuccess({ userId })),
          catchError(err => of(A.saveUserAllergiesBatchFailure({ error: err?.error?.detail || 'Erreur batch.' })))
        );
      })
    )
  );

  batchSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.saveUserAllergiesBatchSuccess),
      map(({ userId }) => A.fetchUserAllergies({ userId }))
    )
  );
}
