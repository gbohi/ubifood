// src/app/store/Commande/commande.reducer.ts

import { createReducer, on } from '@ngrx/store';
import { CommandeModel, CommandeParUserModel, RechercheParBadgeResult } from './commande.model';
import * as CommandeActions from './commande.action';

export interface CommandeState {
  mesCommandes:              CommandeModel[];
  commandesParMenu:          CommandeParUserModel[];
  commandesParAgencePeriode: CommandeModel[];
  allCommandes:              CommandeModel[];
  totalCount:                number;
  // Recherche par badge (retrait)
  rechercheParBadge:         RechercheParBadgeResult | null;
  isSearchingBadge:          boolean;
  badgeError:                string | null;
  // UI
  isLoading:                 boolean;
  isSubmitting:              boolean;
  error:                     string | null;
  successMessage:            string | null;
}

export const initialCommandeState: CommandeState = {
  mesCommandes:              [],
  commandesParMenu:          [],
  commandesParAgencePeriode: [],
  allCommandes:              [],
  totalCount:                0,
  rechercheParBadge:         null,
  isSearchingBadge:          false,
  badgeError:                null,
  isLoading:                 false,
  isSubmitting:              false,
  error:                     null,
  successMessage:            null,
};

export const commandeReducer = createReducer(
  initialCommandeState,

  // ── Mes commandes ──────────────────────────────────────────
  on(CommandeActions.fetchMesCommandes, state => ({
    ...state, isLoading: true, error: null
  })),
  on(CommandeActions.fetchMesCommandesSuccess, (state, { commandes }) => ({
    ...state, isLoading: false, mesCommandes: commandes
  })),
  on(CommandeActions.fetchMesCommandesFailure, (state, { error }) => ({
    ...state, isLoading: false, error
  })),

  // ── Par menu (gestionnaire) ────────────────────────────────
  on(CommandeActions.fetchCommandesParMenu, state => ({
    ...state, isLoading: true, error: null
  })),
  on(CommandeActions.fetchCommandesParMenuSuccess, (state, { grouped }) => ({
    ...state, isLoading: false, commandesParMenu: grouped
  })),
  on(CommandeActions.fetchCommandesParMenuFailure, (state, { error }) => ({
    ...state, isLoading: false, error
  })),

  // ── Par agence et période (admin) ──────────────────────────
  on(CommandeActions.fetchCommandesParAgencePeriode, state => ({
    ...state, isLoading: true, error: null
  })),
  on(CommandeActions.fetchCommandesParAgencePeriodeSuccess, (state, { commandes }) => ({
    ...state, isLoading: false, commandesParAgencePeriode: commandes
  })),
  on(CommandeActions.fetchCommandesParAgencePeriodeFailure, (state, { error }) => ({
    ...state, isLoading: false, error
  })),

  // ── Recherche par badge ────────────────────────────────────
  on(CommandeActions.rechercheParBadge, state => ({
    ...state,
    isSearchingBadge:  true,
    badgeError:        null,
    rechercheParBadge: null,
  })),
  on(CommandeActions.rechercheParBadgeSuccess, (state, { result }) => ({
    ...state,
    isSearchingBadge:  false,
    rechercheParBadge: result,
    badgeError:        null,
  })),
  on(CommandeActions.rechercheParBadgeFailure, (state, { error }) => ({
    ...state,
    isSearchingBadge:  false,
    rechercheParBadge: null,
    badgeError:        error,
  })),
  on(CommandeActions.resetRechercheParBadge, state => ({
    ...state,
    rechercheParBadge: null,
    badgeError:        null,
    isSearchingBadge:  false,
  })),

  // ── Liste admin ────────────────────────────────────────────
  on(CommandeActions.fetchCommandes, state => ({
    ...state, isLoading: true, error: null
  })),
  on(CommandeActions.fetchCommandesSuccess, (state, { data }) => ({
    ...state,
    isLoading:    false,
    allCommandes: data.results,
    totalCount:   data.count,
  })),
  on(CommandeActions.fetchCommandesFailure, (state, { error }) => ({
    ...state, isLoading: false, error
  })),

  // ── Créer ──────────────────────────────────────────────────
  on(CommandeActions.createCommande, state => ({
    ...state, isSubmitting: true, error: null, successMessage: null
  })),
  on(CommandeActions.createCommandeSuccess, (state, { commande }) => {
    const exists = state.mesCommandes.some(c => c.id === commande.id);
    return {
      ...state,
      isSubmitting:   false,
      successMessage: 'Commande passée avec succès.',
      mesCommandes:   exists
        ? state.mesCommandes.map(c => c.id === commande.id ? commande : c)
        : [...state.mesCommandes, commande],
    };
  }),
  on(CommandeActions.createCommandeFailure, (state, { error }) => ({
    ...state, isSubmitting: false, error
  })),

  // ── Annuler ────────────────────────────────────────────────
  on(CommandeActions.annulerCommande, state => ({
    ...state, isSubmitting: true, error: null, successMessage: null
  })),
  on(CommandeActions.annulerCommandeSuccess, (state, { commande }) => ({
    ...state,
    isSubmitting:   false,
    successMessage: 'Commande annulée.',
    mesCommandes:   state.mesCommandes.map(c =>
      c.id === commande.id ? commande : c
    ),
    allCommandes: state.allCommandes.map(c =>
      c.id === commande.id ? commande : c
    ),
  })),
  on(CommandeActions.annulerCommandeFailure, (state, { error }) => ({
    ...state, isSubmitting: false, error
  })),

  // ── Retrait ────────────────────────────────────────────────
  on(CommandeActions.createRetrait, state => ({
    ...state, isSubmitting: true, error: null, successMessage: null
  })),
  on(CommandeActions.createRetraitSuccess, (state, { menuId, userId }) => ({
    ...state,
    isSubmitting:   false,
    successMessage: 'Retrait enregistré. Commandes passées à "Retirée".',
    // Mettre à jour rechercheParBadge si l'agent est le même
    rechercheParBadge: state.rechercheParBadge?.user_id === userId
      ? { ...state.rechercheParBadge, a_retire: true }
      : state.rechercheParBadge,
    commandesParMenu: state.commandesParMenu.map(g =>
      g.user_id === userId ? { ...g, a_retire: true } : g
    ),
    mesCommandes: state.mesCommandes.map(c =>
      c.menu_detail?.id === menuId && c.statut === 'en_attente'
        ? { ...c, statut: 'retiree' as const }
        : c
    ),
  })),
  on(CommandeActions.createRetraitFailure, (state, { error }) => ({
    ...state, isSubmitting: false, error
  })),

  // ── Reset erreur ───────────────────────────────────────────
  on(CommandeActions.resetCommandeError, state => ({
    ...state, error: null, successMessage: null
  })),

  // ── Reset commandes par menu ───────────────────────────────
  on(CommandeActions.resetCommandesParMenu, state => ({
    ...state, commandesParMenu: [], error: null, successMessage: null
  })),

  // ── Reset commandes par agence/période ────────────────────
  on(CommandeActions.resetCommandesParAgencePeriode, state => ({
    ...state, commandesParAgencePeriode: [], error: null, successMessage: null
  })),
);
