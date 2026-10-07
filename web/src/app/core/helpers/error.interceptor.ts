// src/app/core/helpers/error.interceptor.ts
import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * ErrorInterceptor — gestion globale des erreurs HTTP
 *
 * AVANT — deux problèmes graves :
 *
 * 1. 🔴 location.reload() sur tout 401
 *    Rechargement complet de la page sur chaque 401, y compris lors
 *    d'un échec de connexion avec mauvais identifiants → le message
 *    d'erreur s'affichait puis disparaissait immédiatement.
 *
 * 2. 🔴 Conflit avec AuthInterceptor
 *    AuthInterceptor gère déjà les 401 proprement (refresh token puis
 *    déconnexion si nécessaire). ErrorInterceptor ne doit pas interférer
 *    avec cette logique en déconnectant ou rechargeant en parallèle.
 *
 * APRÈS :
 *    ErrorInterceptor ne gère plus les 401 du tout.
 *    Il laisse AuthInterceptor s'en occuper et se contente de
 *    formater le message d'erreur pour les autres codes HTTP.
 */
@Injectable()
export class ErrorInterceptor implements HttpInterceptor {

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(request).pipe(
      catchError(err => {
        // 401 : géré exclusivement par AuthInterceptor (refresh + logout)
        // On laisse passer l'erreur sans interférer
        if (err.status === 401) {
          return throwError(() => err);
        }

        // 403 : accès refusé (droits insuffisants, pas un problème de token)
        if (err.status === 403) {
          console.warn('Accès refusé :', request.url);
          return throwError(() => err);
        }

        // Autres erreurs : extraire le message lisible
        const error = err?.error?.message
          || err?.error?.detail
          || err?.statusText
          || 'Une erreur est survenue';

        return throwError(() => error);
      })
    );
  }
}
