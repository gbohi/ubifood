// src/app/store/Plat/plat.reducer.ts
import { Action, createReducer, on } from '@ngrx/store';
import {
  fetchplatData,
  fetchplatSuccess,
  fetchplatFailure,
  fetchstatistiqueplatData,
  fetchstatistiqueplatSuccess,
  fetchstatistiqueplatFailure,
  createPlatWithFiles,
  createPlatWithFilesSuccess,
  createPlatWithFilesFailure,
  updatePlatWithFiles,
  updatePlatWithFilesSuccess,
  updatePlatWithFilesFailure,
  deleteplatData,
  deleteplatSuccess,
  deleteplatFailure,
  deletemultipleplatData,
  deletemultipleplatSuccess,
  deletemultipleplatFailure,
} from './plat.action';
import { PlatModel, StatistiqueGlobale } from './plat.model';

export interface PlatState {
  platdata: PlatModel[];
  totalItems: number;
  next: string | null;
  previous: string | null;
  loading: boolean;
  error: string | null;
  currentPage: number;

  // Statistiques
  statistiqueGlobale: StatistiqueGlobale | null;
  loadingStat: boolean;
  errorStat: string | null;

  // ── Feedback UI ────────────────────────────────────────────
  // Ces deux champs remplacent l'anti-pattern actions$.pipe(ofType(...))
  // dans le composant. Le composant observe successMessage/errorMessage
  // via un selector pour afficher les toasts, sans écouter les actions.
  successMessage: string | null;
  errorMessage: string | null;
}

export const initialState: PlatState = {
  platdata: [],
  totalItems: 0,
  next: null,
  previous: null,
  loading: false,
  error: null,
  currentPage: 1,
  statistiqueGlobale: null,
  loadingStat: false,
  errorStat: null,
  successMessage: null,
  errorMessage: null,
};

export const PlatReducer = createReducer(
  initialState,

  // ── FETCH ──────────────────────────────────────────────────
  on(fetchplatData, (state, { page }) => ({
    ...state,
    loading: true,
    error: null,
    // Réinitialiser les messages à chaque nouveau chargement
    successMessage: null,
    errorMessage: null,
    currentPage: page ?? state.currentPage,
  })),
  on(fetchplatSuccess, (state, { response }) => ({
    ...state,
    platdata: response.results,
    totalItems: response.count,
    next: response.next,
    previous: response.previous,
    loading: false,
  })),
  on(fetchplatFailure, (state, { error }) => ({
    ...state,
    error,
    loading: false,
  })),

  // ── STATISTIQUES ───────────────────────────────────────────
  on(fetchstatistiqueplatData, (state) => ({
    ...state,
    loadingStat: true,
    errorStat: null,
  })),
  on(fetchstatistiqueplatSuccess, (state, { response }) => ({
    ...state,
    statistiqueGlobale: response,
    loadingStat: false,
  })),
  on(fetchstatistiqueplatFailure, (state, { error }) => ({
    ...state,
    errorStat: error,
    loadingStat: false,
  })),

  // ── CRÉATION ───────────────────────────────────────────────
  on(createPlatWithFiles, (state) => ({
    ...state,
    loading: true,
    successMessage: null,
    errorMessage: null,
  })),
  on(createPlatWithFilesSuccess, (state) => ({
    ...state,
    loading: false,
    // Le composant observera successMessage pour afficher le toast
    successMessage: 'Plat enregistré avec succès !',
  })),
  on(createPlatWithFilesFailure, (state, { error }) => ({
    ...state,
    loading: false,
    errorMessage: error,
  })),

  // ── MISE À JOUR ────────────────────────────────────────────
  on(updatePlatWithFiles, (state) => ({
    ...state,
    loading: true,
    successMessage: null,
    errorMessage: null,
  })),
  on(updatePlatWithFilesSuccess, (state) => ({
    ...state,
    loading: false,
    successMessage: 'Plat mis à jour avec succès !',
  })),
  on(updatePlatWithFilesFailure, (state, { error }) => ({
    ...state,
    loading: false,
    errorMessage: error,
  })),

  // ── SUPPRESSION simple ─────────────────────────────────────
  on(deleteplatData, (state) => ({
    ...state,
    loading: true,
    successMessage: null,
    errorMessage: null,
  })),
  on(deleteplatSuccess, (state) => ({
    ...state,
    loading: false,
    successMessage: 'Plat supprimé avec succès !',
  })),
  on(deleteplatFailure, (state, { error }) => ({
    ...state,
    loading: false,
    errorMessage: error,
  })),

  // ── SUPPRESSION multiple ───────────────────────────────────
  on(deletemultipleplatData, (state) => ({
    ...state,
    loading: true,
    successMessage: null,
    errorMessage: null,
  })),
  on(deletemultipleplatSuccess, (state) => ({
    ...state,
    loading: false,
    successMessage: 'Plats supprimés avec succès !',
  })),
  on(deletemultipleplatFailure, (state, { error }) => ({
    ...state,
    loading: false,
    errorMessage: error,
  })),
);

export function reducer(state: PlatState | undefined, action: Action) {
  return PlatReducer(state, action);
}
