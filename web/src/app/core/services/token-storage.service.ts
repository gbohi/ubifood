// src/app/core/services/token-storage.service.ts
import { Injectable } from '@angular/core';

const TOKEN_KEY = 'access-token';
const REFRESH_TOKEN_KEY = 'refresh-token';
const USER_KEY = 'currentUser';

/**
 * TokenStorageService — gestion des tokens JWT en localStorage
 *
 * CORRECTIONS :
 *
 * 1. 🔴 signOut() appelait window.localStorage.clear()
 *    AVANT : effaçait TOUT le localStorage, y compris des données
 *            qui n'appartiennent pas à l'authentification
 *            (préférences UI, données de cache, etc.)
 *    APRÈS : suppression ciblée des seules clés de l'app.
 *
 * 2. 🟡 saveToken() faisait removeItem() puis setItem() pour les deux tokens
 *    AVANT : deux removeItem + deux setItem = 4 écritures localStorage
 *    APRÈS : deux setItem directs (setItem écrase automatiquement) = 2 écritures.
 */
@Injectable({
  providedIn: 'root'
})
export class TokenStorageService {

  signOut(): void {
    // CORRIGÉ : suppression ciblée au lieu de localStorage.clear()
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  }

  saveToken(accessToken: string, refreshToken: string): void {
    // CORRIGÉ : setItem écrase directement, pas besoin de removeItem avant
    window.localStorage.setItem(TOKEN_KEY, accessToken);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }

  saveAccessToken(token: string): void {
    window.localStorage.setItem(TOKEN_KEY, token);
  }

  getAccessToken(): string | null {
    return window.localStorage.getItem(TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return window.localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  saveUser(user: any): void {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  getUser(): any {
    const user = window.localStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
  }

  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  }
}
