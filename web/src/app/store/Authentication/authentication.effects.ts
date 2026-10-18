// src/app/store/Authentication/authentication.effects.ts
import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { map, catchError, exhaustMap, tap } from 'rxjs/operators';
import { of } from 'rxjs';
import { Router } from '@angular/router';
import { AuthenticationService } from '../../core/services/auth.service';
import {
  login,
  loginSuccess,
  loginFailure,
  logout,
  logoutSuccess,
} from './authentication.actions';

@Injectable()
export class AuthenticationEffects {

  login$ = createEffect(() =>
    this.actions$.pipe(
      ofType(login),
      exhaustMap(({ username, password }) =>
        this.authService.login(username, password).pipe(
          map((user) => loginSuccess({ user })),
          catchError((error) => {
            let message: string;
            if (typeof error === 'string') {
              message = error;
            } else if (error?.error?.detail) {
              message = error.error.detail;
            } else if (error?.error?.non_field_errors) {
              message = error.error.non_field_errors[0];
            } else if (error?.message) {
              message = error.message;
            } else {
              message = 'Identifiants incorrects. Veuillez réessayer.';
            }
            return of(loginFailure({ error: message }));
          })
        )
      )
    )
  );

  logout$ = createEffect(() =>
    this.actions$.pipe(
      ofType(logout),
      // Révoque d'abord le refresh token côté serveur, puis nettoie localement
      exhaustMap(() => this.authService.revoquerSession()),
      tap(() => {
        this.authService.logout();
        this.router.navigate(['/auth/login']);
      }),
      map(() => logoutSuccess())
    )
  );

  constructor(
    private actions$: Actions,
    private authService: AuthenticationService,
    private router: Router
  ) {}
}
