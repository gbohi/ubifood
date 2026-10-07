// src/app/store/UserService/user-service.effects.ts

import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of, forkJoin } from 'rxjs';
import { catchError, map, mergeMap, switchMap } from 'rxjs/operators';
import { UserServiceService } from 'src/app/core/services/user-service/user-service.service';
import * as A from './user-service.action';

@Injectable()
export class UserServiceEffects {
  private actions$           = inject(Actions);
  private userServiceService = inject(UserServiceService);

  fetch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.fetchUserServices),
      switchMap(({ userId }) =>
        this.userServiceService.getByUser(userId).pipe(
          map(items => A.fetchUserServicesSuccess({ items })),
          catchError(err => of(A.fetchUserServicesFailure({ error: err?.error?.detail || 'Erreur chargement.' })))
        )
      )
    )
  );

  create$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.createUserService),
      mergeMap(({ data }) =>
        this.userServiceService.create(data).pipe(
          map(item => A.createUserServiceSuccess({ item })),
          catchError(err => of(A.createUserServiceFailure({ error: err?.error?.detail || 'Erreur création.' })))
        )
      )
    )
  );

  update$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.updateUserService),
      mergeMap(({ id, data }) =>
        this.userServiceService.update(id, data).pipe(
          map(item => A.updateUserServiceSuccess({ item })),
          catchError(err => of(A.updateUserServiceFailure({ error: err?.error?.detail || 'Erreur mise à jour.' })))
        )
      )
    )
  );

  delete$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.deleteUserService),
      mergeMap(({ id }) =>
        this.userServiceService.delete(id).pipe(
          map(() => A.deleteUserServiceSuccess({ id })),
          catchError(err => of(A.deleteUserServiceFailure({ error: err?.error?.detail || 'Erreur suppression.' })))
        )
      )
    )
  );

  saveBatch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.saveUserServicesBatch),
      mergeMap(({ userId, items }) => {
        if (items.length === 0) return of(A.saveUserServicesBatchSuccess({ userId }));
        return forkJoin(items.map(i => this.userServiceService.create({ ...i, user: userId }))).pipe(
          map(() => A.saveUserServicesBatchSuccess({ userId })),
          catchError(err => of(A.saveUserServicesBatchFailure({ error: err?.error?.detail || 'Erreur batch.' })))
        );
      })
    )
  );

  batchSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.saveUserServicesBatchSuccess),
      map(({ userId }) => A.fetchUserServices({ userId }))
    )
  );
}
