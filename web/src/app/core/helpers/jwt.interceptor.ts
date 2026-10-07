// src/app/core/helpers/jwt.interceptor.ts
import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * JwtInterceptor — intercepteur hérité du template Themeforest
 *
 * AVANT : deux branches selon environment.defaultauth :
 *   - 'firebase'     → lisait currentUser().token depuis AuthenticationService
 *   - 'fakebackend'  → lisait currentUserValue.token depuis AuthfakeauthenticationService
 *
 * PROBLÈMES :
 *   1. La branche 'firebase' lisait user.token — champ supprimé de auth.models.ts
 *      car les tokens appartiennent à TokenStorageService, pas au modèle User.
 *   2. La branche 'fakebackend' lisait authFackservice.currentUserValue.token
 *      → ce service ne connaît pas les tokens Django JWT → Authorization toujours absent.
 *   3. AuthInterceptor gère déjà l'injection du token Django sur toutes les requêtes.
 *      Avoir deux intercepteurs qui injectent Authorization crée des conflits.
 *
 * APRÈS : JwtInterceptor laisse passer toutes les requêtes sans modification.
 *   AuthInterceptor est le seul responsable de l'injection du token JWT.
 *
 *   Ce fichier est conservé pour ne pas casser les imports dans app.module.ts.
 *   Tu peux le supprimer entièrement et retirer son entrée dans providers[]
 *   une fois que tu as vérifié que rien d'autre ne l'importe.
 */
@Injectable()
export class JwtInterceptor implements HttpInterceptor {

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Délégué entièrement à AuthInterceptor — ne rien faire ici
    return next.handle(request);
  }
}
