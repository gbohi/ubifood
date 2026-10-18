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
import { Router } from '@angular/router';
import { TokenStorageService } from '../services/token-storage.service';
import { AuthenticationService } from '../services/auth.service';

/**
 * AuthInterceptor — injection du jeton JWT et renouvellement automatique.
 *
 *   1. Le jeton d'accès est ajouté à chaque requête sortante.
 *   2. Sur un 401, un seul appel à /token/refresh/ est fait, même si
 *      plusieurs requêtes échouent en même temps ; les autres attendent.
 *   3. Renouvellement réussi : les requêtes repartent avec le nouveau jeton.
 *   4. Échec (session expirée) : les requêtes en attente échouent aussi,
 *      le stockage est vidé et l'utilisateur est renvoyé à la connexion,
 *      avec l'adresse de la page en cours pour y revenir ensuite.
 */
const SESSION_EXPIREE = 'Votre session a expiré. Veuillez vous reconnecter.';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  private isRefreshing = false;
  // null : renouvellement en cours ; '' : échec ; sinon le nouveau jeton
  private refreshTokenSubject = new BehaviorSubject<string | null>(null);

  constructor(
    private tokenStorage: TokenStorageService,
    private authService: AuthenticationService,
    private router: Router,
  ) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Pas de jeton sur les requêtes de connexion / renouvellement elles-mêmes
    if (this.isAuthRequest(request)) {
      return next.handle(request);
    }

    const token = this.tokenStorage.getAccessToken();
    if (token) {
      request = this.addToken(request, token);
    }

    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401 && token) {
          return this.handle401Error(request, next);
        }
        return throwError(() => error);
      })
    );
  }

  private handle401Error(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      if (!this.tokenStorage.getRefreshToken()) {
        return this.sessionExpiree();
      }

      return this.authService.refreshToken().pipe(
        switchMap((tokens) => {
          this.isRefreshing = false;
          this.refreshTokenSubject.next(tokens.access);
          return next.handle(this.addToken(request, tokens.access));
        }),
        catchError(() => this.sessionExpiree())
      );
    }

    // Un renouvellement est déjà en cours : attendre son résultat
    return this.refreshTokenSubject.pipe(
      filter((token): token is string => token !== null),
      take(1),
      switchMap((token) => token
        ? next.handle(this.addToken(request, token))
        : throwError(() => SESSION_EXPIREE))
    );
  }

  /** Fin de session : libère les requêtes en attente et renvoie à la connexion. */
  private sessionExpiree(): Observable<never> {
    this.isRefreshing = false;
    this.refreshTokenSubject.next('');
    this.authService.logout();
    if (!this.router.url.startsWith('/auth/')) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
    }
    return throwError(() => SESSION_EXPIREE);
  }

  private addToken(request: HttpRequest<any>, token: string): HttpRequest<any> {
    return request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
        // Content-Type intentionnellement absent : FormData gère son propre boundary
      }
    });
  }

  /** Requêtes de connexion et de renouvellement (adresse exacte, pas « device-tokens »). */
  private isAuthRequest(request: HttpRequest<any>): boolean {
    const chemin = request.url.split('?')[0];
    return chemin.endsWith('/api/token/') || chemin.endsWith('/api/token/refresh/');
  }
}
