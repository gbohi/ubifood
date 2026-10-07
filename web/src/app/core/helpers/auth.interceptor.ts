// src/app/core/helpers/auth.interceptor.ts
import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { TokenStorageService } from '../services/token-storage.service';
import { AuthenticationService } from '../services/auth.service';

/**
 * AuthInterceptor — injection du token JWT + refresh automatique
 *
 * AVANT (première version générée) : sur tout 401, déconnexion immédiate.
 * → Résultat : à chaque expiration du access token, l'utilisateur était
 *   renvoyé vers /auth/login alors que le refresh token était encore valide.
 *
 * APRÈS : mécanique de refresh correcte en 4 étapes :
 *   1. Injecter le access token sur chaque requête sortante
 *   2. Si 401 → tenter un refresh via /token/refresh/
 *   3. Si le refresh réussit → relancer la requête originale avec le nouveau token
 *   4. Si le refresh échoue (refresh token expiré) → déconnexion réelle
 *
 * isRefreshing + refreshTokenSubject évitent les appels multiples simultanés :
 * si 3 requêtes reçoivent un 401 en même temps, une seule demande de refresh
 * est envoyée, et les 2 autres attendent le nouveau token avant de repartir.
 */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);

  constructor(
    private tokenStorage: TokenStorageService,
    private authService: AuthenticationService
  ) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Ne pas injecter le token sur les requêtes de login/refresh elles-mêmes
    if (this.isAuthRequest(request)) {
      return next.handle(request);
    }

    const token = this.tokenStorage.getAccessToken();
    if (token) {
      request = this.addToken(request, token);
    }

    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401 && !this.isAuthRequest(request)) {
          return this.handle401Error(request, next);
        }
        return throwError(() => error);
      })
    );
  }

  /**
   * Tente de rafraîchir le token puis relance la requête originale.
   * Gère les appels concurrents : toutes les requêtes en attente
   * reprennent dès que le nouveau token est disponible.
   */
  private handle401Error(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      const refreshToken = this.tokenStorage.getRefreshToken();

      if (!refreshToken) {
        // Pas de refresh token → session vraiment expirée
        this.isRefreshing = false;
        this.authService.logout();
        return throwError(() => new Error('Session expirée'));
      }

      return this.authService.refreshToken().pipe(
        switchMap((tokens) => {
          this.isRefreshing = false;
          this.refreshTokenSubject.next(tokens.access);
          // Relancer la requête originale avec le nouveau token
          return next.handle(this.addToken(request, tokens.access));
        }),
        catchError((refreshError) => {
          // Le refresh token est lui aussi expiré → vraie déconnexion
          this.isRefreshing = false;
          this.authService.logout();
          return throwError(() => refreshError);
        })
      );

    } else {
      // Un refresh est déjà en cours → attendre le nouveau token
      return this.refreshTokenSubject.pipe(
        filter((token): token is string => token !== null),
        take(1),
        switchMap((token) => next.handle(this.addToken(request, token)))
      );
    }
  }

  private addToken(request: HttpRequest<any>, token: string): HttpRequest<any> {
    return request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
        // Content-Type intentionnellement absent : FormData gère son propre boundary
      }
    });
  }

  /**
   * Identifie les requêtes d'authentification qui ne doivent pas
   * recevoir de token ni déclencher un refresh en cas de 401.
   */
  private isAuthRequest(request: HttpRequest<any>): boolean {
    return request.url.includes('/token/') || request.url.includes('/token/refresh/');
  }
}

export const authInterceptorProviders = [
  { provide: 'HTTP_INTERCEPTORS', useClass: AuthInterceptor, multi: true }
];
