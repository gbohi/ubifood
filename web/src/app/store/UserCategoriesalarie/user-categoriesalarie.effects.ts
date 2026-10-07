// src/app/store/UserCategoriesalarie/user-categoriesalarie.effects.ts

import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of, forkJoin } from 'rxjs';
import { catchError, map, mergeMap, switchMap } from 'rxjs/operators';
import { UserCategoriesalarieService } from 'src/app/core/services/user-categoriesalarie/user-categoriesalarie.service';
import * as A from './user-categoriesalarie.action';

@Injectable()
export class UserCategoriesalarieEffects {
  private actions$                    = inject(Actions);
  private userCategoriesalarieService = inject(UserCategoriesalarieService);

  fetch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.fetchUserCategoriesalaries),
      switchMap(({ userId }) =>
        this.userCategoriesalarieService.getByUser(userId).pipe(
          map(items => A.fetchUserCategoriesalariesSuccess({ items })),
          catchError(err => of(A.fetchUserCategoriesalariesFailure({ error: err?.error?.detail || 'Erreur chargement.' })))
        )
      )
    )
  );

  create$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.createUserCategoriesalarie),
      mergeMap(({ data }) =>
        this.userCategoriesalarieService.create(data).pipe(
          map(item => A.createUserCategoriesalarieSuccess({ item })),
          catchError(err => of(A.createUserCategoriesalarieFailure({ error: err?.error?.detail || 'Erreur création.' })))
        )
      )
    )
  );

  update$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.updateUserCategoriesalarie),
      mergeMap(({ id, data }) =>
        this.userCategoriesalarieService.update(id, data).pipe(
          map(item => A.updateUserCategoriesalarieSuccess({ item })),
          catchError(err => of(A.updateUserCategoriesalarieFailure({ error: err?.error?.detail || 'Erreur mise à jour.' })))
        )
      )
    )
  );

  delete$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.deleteUserCategoriesalarie),
      mergeMap(({ id }) =>
        this.userCategoriesalarieService.delete(id).pipe(
          map(() => A.deleteUserCategoriesalarieSuccess({ id })),
          catchError(err => of(A.deleteUserCategoriesalarieFailure({ error: err?.error?.detail || 'Erreur suppression.' })))
        )
      )
    )
  );

  saveBatch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.saveUserCategoriesalariesBatch),
      mergeMap(({ userId, items }) => {
        if (items.length === 0) return of(A.saveUserCategoriesalariesBatchSuccess({ userId }));
        return forkJoin(items.map(i => this.userCategoriesalarieService.create({ ...i, user: userId }))).pipe(
          map(() => A.saveUserCategoriesalariesBatchSuccess({ userId })),
          catchError(err => of(A.saveUserCategoriesalariesBatchFailure({ error: err?.error?.detail || 'Erreur batch.' })))
        );
      })
    )
  );

  batchSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(A.saveUserCategoriesalariesBatchSuccess),
      map(({ userId }) => A.fetchUserCategoriesalaries({ userId }))
    )
  );
}
