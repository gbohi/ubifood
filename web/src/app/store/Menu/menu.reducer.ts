// src/app/store/Menu/menu.reducer.ts
import { Action, createReducer, on } from '@ngrx/store';
import {
  fetchmenuData,
  fetchmenuSuccess,
  fetchmenuFailure,
  fetchmenuNoPaginateSuccess,
  addmenuData,
  addmenuDataSuccess,
  addmenuDataFailure,
  updatemenuData,
  updatemenuDataSuccess,
  updatemenuDataFailure,
  deletemenuData,
  deletemenuSuccess,
  deletemenuFailure,
  deletemultiplemenuData,
  deletemultiplemenuSuccess,
  deletemultiplemenuFailure,
} from './menu.action';
import { MenulistModel } from './menu.model';

export interface MenuState {
  menuData: MenulistModel[];
  allMenus: MenulistModel[];
  totalItems: number;
  next: string | null;
  previous: string | null;
  loading: boolean;
  error: string | null;
  currentPage: number;

  // ── Feedback UI (même pattern que PlatState) ───────────────
  // Le composant observe ces valeurs via selector pour afficher les toasts.
  successMessage: string | null;
  errorMessage: string | null;
}

export const initialState: MenuState = {
  menuData: [],
  allMenus: [],
  totalItems: 0,
  next: null,
  previous: null,
  loading: false,
  error: null,
  currentPage: 1,
  successMessage: null,
  errorMessage: null,
};

export const MenuReducer = createReducer(
  initialState,

  // ── FETCH ──────────────────────────────────────────────────
  on(fetchmenuData, (state, { page }) => ({
    ...state,
    loading: true,
    error: null,
    successMessage: null,
    errorMessage: null,
    currentPage: page ?? state.currentPage,
  })),
  on(fetchmenuSuccess, (state, { response }) => ({
    ...state,
    menuData: response.results,
    totalItems: response.count,
    next: response.next,
    previous: response.previous,
    loading: false,
  })),
  on(fetchmenuFailure, (state, { error }) => ({
    ...state,
    error,
    loading: false,
  })),

  // ── FETCH sans pagination ──────────────────────────────────
  on(fetchmenuNoPaginateSuccess, (state, { response }) => ({
    ...state,
    allMenus: response,
    loading: false,
  })),

  // ── CRÉATION ───────────────────────────────────────────────
  on(addmenuData, (state) => ({
    ...state,
    loading: true,
    successMessage: null,
    errorMessage: null,
  })),
  on(addmenuDataSuccess, (state) => ({
    ...state,
    loading: false,
    successMessage: 'Menu créé avec succès !',
  })),
  on(addmenuDataFailure, (state, { error }) => ({
    ...state,
    loading: false,
    errorMessage: error,
  })),

  // ── MISE À JOUR ────────────────────────────────────────────
  on(updatemenuData, (state) => ({
    ...state,
    loading: true,
    successMessage: null,
    errorMessage: null,
  })),
  on(updatemenuDataSuccess, (state) => ({
    ...state,
    loading: false,
    successMessage: 'Menu mis à jour avec succès !',
  })),
  on(updatemenuDataFailure, (state, { error }) => ({
    ...state,
    loading: false,
    errorMessage: error,
  })),

  // ── SUPPRESSION simple ─────────────────────────────────────
  on(deletemenuData, (state) => ({
    ...state,
    loading: true,
    successMessage: null,
    errorMessage: null,
  })),
  on(deletemenuSuccess, (state) => ({
    ...state,
    loading: false,
    successMessage: 'Menu supprimé avec succès !',
  })),
  on(deletemenuFailure, (state, { error }) => ({
    ...state,
    loading: false,
    errorMessage: error,
  })),

  // ── SUPPRESSION multiple ───────────────────────────────────
  on(deletemultiplemenuData, (state) => ({
    ...state,
    loading: true,
    successMessage: null,
    errorMessage: null,
  })),
  on(deletemultiplemenuSuccess, (state) => ({
    ...state,
    loading: false,
    successMessage: 'Menus supprimés avec succès !',
  })),
  on(deletemultiplemenuFailure, (state, { error }) => ({
    ...state,
    loading: false,
    errorMessage: error,
  })),
);

export function reducer(state: MenuState | undefined, action: Action) {
  return MenuReducer(state, action);
}
