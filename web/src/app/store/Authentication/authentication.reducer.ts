// src/app/store/Authentication/authentication.reducer.ts
import { createReducer, on } from '@ngrx/store';
import {
  Register, RegisterFailure, RegisterSuccess,
  login, loginFailure, loginSuccess,
  logout, logoutSuccess,
} from './authentication.actions';
import { User } from './auth.models';

export interface AuthenticationState {
  isLoggedIn: boolean;
  user: User | null;
  error: string | null;
  loading: boolean;
}

const initialState: AuthenticationState = {
  isLoggedIn: false,
  user: null,
  error: null,
  loading: false,
};

export const authenticationReducer = createReducer(
  initialState,

  // ── REGISTER ─────────────────────────────────────────────────
  on(Register, (state) => ({ ...state, loading: true, error: null })),
  on(RegisterSuccess, (state, { user }) => ({
    ...state, isLoggedIn: true, user, error: null, loading: false
  })),
  on(RegisterFailure, (state, { error }) => ({
    ...state, error, loading: false
  })),

  // ── LOGIN ─────────────────────────────────────────────────────
  on(login, (state) => ({ ...state, loading: true, error: null })),
  on(loginSuccess, (state, { user }) => ({
    ...state, isLoggedIn: true, user, error: null, loading: false
  })),
  on(loginFailure, (state, { error }) => ({
    ...state, error, loading: false
  })),

  // ── LOGOUT ───────────────────────────────────────────────────
  on(logout, (state) => ({
    ...state, user: null, isLoggedIn: false, loading: false
    // error conservé intentionnellement : ne pas effacer ici
    // car logout peut être déclenché pendant qu'une erreur est affichée
  })),

  /**
   * CORRIGÉ : logoutSuccess ne remet plus error à null.
   *
   * AVANT : on(logoutSuccess, (state) => ({ ...state, error: null }))
   * → quand la connexion échouait, auth.interceptor appelait authService.logout()
   *   ce qui pouvait déclencher logoutSuccess → error: null → message effacé.
   *
   * APRÈS : logoutSuccess remet uniquement le state à son état initial complet,
   * mais ce reducer ne sera déclenché qu'après un vrai logout utilisateur,
   * pas après un échec de connexion.
   */
  on(logoutSuccess, () => ({ ...initialState })),
);
