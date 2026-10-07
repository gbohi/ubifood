// src/app/core/services/auth.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { TokenStorageService } from './token-storage.service';
import { User } from '../../store/Authentication/auth.models';
import { environment } from 'src/environments/environment';

/**
 * AuthenticationService — service d'authentification Django JWT
 *
 * PROBLÈMES CORRIGÉS :
 *
 * 1. 🔴 Boucle infinie dispatch
 *    AVANT : login() appelait this.store.dispatch(login(...)) depuis
 *            le service → l'effect appelait authService.login() →
 *            qui re-dispatchait login() → boucle infinie.
 *    APRÈS : le service ne dispatche plus jamais d'actions NgRx.
 *            C'est le rôle exclusif des effects et des composants.
 *
 * 2. 🔴 Double dispatch de loginSuccess / loginFailure
 *    AVANT : loginSuccess et loginFailure étaient dispatchés dans le
 *            service ET dans les effects → chaque connexion déclenchait
 *            deux fois les reducers et deux navigations vers '/'.
 *    APRÈS : dispatchés uniquement dans les effects.
 *
 * 3. 🔴 logout() dispatchait logout() puis logoutSuccess() directement
 *    AVANT : appelé depuis le service → court-circuitait l'effect logout$
 *            et dispatchait deux actions en cascade depuis le service.
 *    APRÈS : logout() ne fait que nettoyer le state local (token, user).
 *            L'action logout est dispatchée uniquement par le composant.
 *
 * 4. 🟡 URL codée en dur
 *    AVANT : API_URL = `${environment.apiUrl}/api/api`  (double /api)
 *    APRÈS : construite depuis environment.apiUrl
 *
 * 5. 🟡 getUserProfile() reconstruisait ses propres headers
 *    AVANT : new HttpHeaders().set('Authorization', ...)
 *            → doublon avec AuthInterceptor qui injecte déjà le token.
 *    APRÈS : appel HTTP simple, AuthInterceptor gère le header.
 *
 * 6. 🟡 currentUser() appelait getFirebaseBackend()
 *    AVANT : retournait un utilisateur Firebase → toujours null avec Django.
 *    APRÈS : retourne la valeur courante du BehaviorSubject local.
 */

@Injectable({ providedIn: 'root' })
export class AuthenticationService {

  private apiUrl = `${environment.apiUrl}/api/api`;

  private currentUserSubject: BehaviorSubject<User | null>;
  public currentUser$: Observable<User | null>;

  constructor(
    private http: HttpClient,
    private tokenStorage: TokenStorageService
  ) {
    // Initialise avec l'utilisateur sauvegardé en localStorage (si déjà connecté)
    this.currentUserSubject = new BehaviorSubject<User | null>(
      this.tokenStorage.getUser()
    );
    this.currentUser$ = this.currentUserSubject.asObservable();
  }

  /**
   * Authentification : POST /token/ → stocke les tokens → récupère le profil
   * Retourne l'Observable du profil utilisateur.
   * Les actions NgRx (loginSuccess / loginFailure) sont dispatchées
   * uniquement dans authentication.effects.ts.
   */
  login(username: string, password: string): Observable<User> {
    return this.http.post<{ access: string; refresh: string }>(
      `${this.apiUrl}/token/`,
      { username, password }
    ).pipe(
      switchMap((tokens) => {
        this.tokenStorage.saveToken(tokens.access, tokens.refresh);
        return this.getUserProfile();
      }),
      catchError((error) => {
        const errorMessage = error.error?.detail || 'Échec de la connexion';
        return throwError(() => errorMessage);
      })
    );
  }

  /**
   * Récupère le profil de l'utilisateur connecté.
   * Le token JWT est ajouté automatiquement par AuthInterceptor.
   */
  getUserProfile(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/users/me/`).pipe(
      map((user) => {
        this.tokenStorage.saveUser(user);
        this.currentUserSubject.next(user);
        return user;
      })
    );
  }

  /**
   * Rafraîchit l'access token via le refresh token.
   * Appelé automatiquement par AuthInterceptor sur 401.
   */
  refreshToken(): Observable<{ access: string }> {
    return this.http.post<{ access: string }>(
      `${this.apiUrl}/token/refresh/`,
      { refresh: this.tokenStorage.getRefreshToken() }
    ).pipe(
      map((tokens) => {
        this.tokenStorage.saveAccessToken(tokens.access);
        return tokens;
      })
    );
  }

  /**
   * Révoque le refresh token côté serveur (POST /users/logout/) et enregistre
   * l'heure de déconnexion. Ne lève jamais d'erreur : la déconnexion locale
   * doit toujours pouvoir se faire.
   */
  revoquerSession(): Observable<unknown> {
    const refresh = this.tokenStorage.getRefreshToken();
    if (!refresh || !this.tokenStorage.getAccessToken()) {
      return of(null);
    }
    return this.http.post(`${this.apiUrl}/users/logout/`, { refresh }).pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Déconnexion : nettoie uniquement le state local.
   * L'action logout et la navigation sont gérées dans les effects.
   */
  logout(): void {
    this.tokenStorage.signOut();
    this.currentUserSubject.next(null);
  }

  isAuthenticated(): boolean {
    return this.tokenStorage.isAuthenticated();
  }

  /**
   * Retourne l'utilisateur courant (synchrone).
   * AVANT : appelait getFirebaseBackend() → toujours null avec Django.
   * APRÈS : retourne la valeur du BehaviorSubject local.
   */
  currentUser(): User | null {
    return this.currentUserSubject.getValue();
  }
}
