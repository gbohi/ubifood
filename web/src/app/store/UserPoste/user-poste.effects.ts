// src/app/store/UserPoste/user-poste.effects.ts

import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of, forkJoin } from 'rxjs';
import { catchError, map, mergeMap, switchMap } from 'rxjs/operators';
import { UserPosteService } from 'src/app/core/services/user-poste/user-poste.service';
import * as A from './user-poste.action';

@Injectable()
export class UserPosteEffects {
  private actions$         = inject(Actions);
  private userPosteService = inject(UserPosteService);

  fetch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.fetchUserPostes),
      switchMap(({ userId }) =>
        this.userPosteService.getByUser(userId).pipe(
          map(items => A.fetchUserPostesSuccess({ items })),
          catchError(err => of(A.fetchUserPostesFailure({ error: err?.error?.detail || 'Erreur chargement.' })))
        )
      )
    )
  );

  create$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.createUserPoste),
      mergeMap(({ data }) =>
        this.userPosteService.create(data).pipe(
          map(item => A.createUserPosteSuccess({ item })),
          catchError(err => of(A.createUserPosteFailure({ error: err?.error?.detail || 'Erreur création.' })))
        )
      )
    )
  );

  update$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.updateUserPoste),
      mergeMap(({ id, data }) =>
        this.userPosteService.update(id, data).pipe(
          map(item => A.updateUserPosteSuccess({ item })),
          catchError(err => of(A.updateUserPosteFailure({ error: err?.error?.detail || 'Erreur mise à jour.' })))
        )
      )
    )
  );

  delete$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.deleteUserPoste),
      mergeMap(({ id }) =>
        this.userPosteService.delete(id).pipe(
          map(() => A.deleteUserPosteSuccess({ id })),
          catchError(err => of(A.deleteUserPosteFailure({ error: err?.error?.detail || 'Erreur suppression.' })))
        )
      )
    )
  );

  saveBatch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.saveUserPostesBatch),
      mergeMap(({ userId, items }) => {
        if (items.length === 0) return of(A.saveUserPostesBatchSuccess({ userId }));
        return forkJoin(items.map(i => this.userPosteService.create({ ...i, user: userId }))).pipe(
          map(() => A.saveUserPostesBatchSuccess({ userId })),
          catchError(err => of(A.saveUserPostesBatchFailure({ error: err?.error?.detail || 'Erreur batch.' })))
        );
      })
    )
  );

  batchSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.saveUserPostesBatchSuccess),
      map(({ userId }) => A.fetchUserPostes({ userId }))
    )
  );
}
