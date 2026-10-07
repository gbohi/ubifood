// src/app/core/helpers/error.interceptor.ts
import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * Extrait un message lisible d'une réponse d'erreur Django REST Framework.
 *
 * DRF renvoie selon les cas : {"detail": "..."}, {"error": "..." | [...]},
 * {"non_field_errors": ["..."]}, {"champ": ["..."]} ou ["..."].
 * Avant, seuls message / detail étaient lus : les erreurs de validation
 * (400) s'affichaient « Bad Request ».
 */
export function messageErreurApi(err: HttpErrorResponse | any): string {
  const premier = (v: any): string | null => {
    if (v == null) return null;
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.length ? premier(v[0]) : null;
    if (typeof v === 'object') {
      for (const cle of ['detail', 'error', 'message', 'non_field_errors']) {
        const m = premier(v[cle]);
        if (m) return m;
      }
      for (const [champ, valeur] of Object.entries(v)) {
        const m = premier(valeur);
        if (m) return `${champ} : ${m}`;
      }
    }
    return null;
  };

  if (err?.status === 0) return 'Impossible de contacter le serveur.';
  if (err?.status === 429) return 'Trop de tentatives. Réessayez dans quelques minutes.';
  return premier(err?.error) || err?.statusText || 'Une erreur est survenue';
}

/**
 * ErrorInterceptor — gestion globale des erreurs HTTP
 *
 * - 401 : laissé tel quel, géré par AuthInterceptor (refresh puis déconnexion).
 * - Autres codes : l'erreur est transformée en message texte lisible,
 *   que les effects NgRx stockent et que les pages affichent.
 */
@Injectable()
export class ErrorInterceptor implements HttpInterceptor {

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(request).pipe(
      catchError(err => {
        if (err.status === 401) {
          return throwError(() => err);
        }
        if (err.status === 403) {
          return throwError(() => messageErreurApi(err) || 'Accès refusé.');
        }
        return throwError(() => messageErreurApi(err));
      })
    );
  }
}
