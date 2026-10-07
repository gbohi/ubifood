// src/app/store/Commande/commande.action.ts

import { createAction, props } from '@ngrx/store';
import {
  CommandeModel,
  CommandeListModel,
  CommandeCreatePayload,
  CommandeParUserModel,
  RechercheParBadgeResult,
} from './commande.model';

// ── Charger mes commandes (agent connecté) ───────────────────
export const fetchMesCommandes = createAction(
  '[Commande] Fetch Mes Commandes',
  props<{ statut?: string; date_gte?: string }>()
);
export const fetchMesCommandesSuccess = createAction(
  '[Commande] Fetch Mes Commandes Success',
  props<{ commandes: CommandeModel[] }>()
);
export const fetchMesCommandesFailure = createAction(
  '[Commande] Fetch Mes Commandes Failure',
  props<{ error: string }>()
);

// ── Charger commandes d'un menu (gestionnaire) ───────────────
export const fetchCommandesParMenu = createAction(
  '[Commande] Fetch Par Menu',
  props<{ menuId: number }>()
);
export const fetchCommandesParMenuSuccess = createAction(
  '[Commande] Fetch Par Menu Success',
  props<{ grouped: CommandeParUserModel[] }>()
);
export const fetchCommandesParMenuFailure = createAction(
  '[Commande] Fetch Par Menu Failure',
  props<{ error: string }>()
);

// ── Charger commandes par agence et période (admin) ──────────
export const fetchCommandesParAgencePeriode = createAction(
  '[Commande] Fetch Par Agence Periode',
  props<{
    date_debut?: string;
    date_fin?:   string;
    agence?:     number;
    typeequipe?: number;
    statut?:     string;
  }>()
);
export const fetchCommandesParAgencePeriodeSuccess = createAction(
  '[Commande] Fetch Par Agence Periode Success',
  props<{ commandes: CommandeModel[] }>()
);
export const fetchCommandesParAgencePeriodeFailure = createAction(
  '[Commande] Fetch Par Agence Periode Failure',
  props<{ error: string }>()
);

// ── Recherche agent par badge (retrait) ──────────────────────
export const rechercheParBadge = createAction(
  '[Commande] Recherche Par Badge',
  props<{ badge: string; menuId: number }>()
);
export const rechercheParBadgeSuccess = createAction(
  '[Commande] Recherche Par Badge Success',
  props<{ result: RechercheParBadgeResult }>()
);
export const rechercheParBadgeFailure = createAction(
  '[Commande] Recherche Par Badge Failure',
  props<{ error: string }>()
);
export const resetRechercheParBadge = createAction('[Commande] Reset Recherche Par Badge');

// ── Charger liste paginée (admin) ────────────────────────────
export const fetchCommandes = createAction(
  '[Commande] Fetch List',
  props<{ page?: number; menu?: number; statut?: string; agence?: number }>()
);
export const fetchCommandesSuccess = createAction(
  '[Commande] Fetch List Success',
  props<{ data: CommandeListModel }>()
);
export const fetchCommandesFailure = createAction(
  '[Commande] Fetch List Failure',
  props<{ error: string }>()
);

// ── Créer une commande ───────────────────────────────────────
export const createCommande = createAction(
  '[Commande] Create',
  props<{ payload: CommandeCreatePayload }>()
);
export const createCommandeSuccess = createAction(
  '[Commande] Create Success',
  props<{ commande: CommandeModel }>()
);
export const createCommandeFailure = createAction(
  '[Commande] Create Failure',
  props<{ error: string }>()
);

// ── Annuler une commande ─────────────────────────────────────
export const annulerCommande = createAction(
  '[Commande] Annuler',
  props<{ id: number }>()
);
export const annulerCommandeSuccess = createAction(
  '[Commande] Annuler Success',
  props<{ commande: CommandeModel }>()
);
export const annulerCommandeFailure = createAction(
  '[Commande] Annuler Failure',
  props<{ error: string }>()
);

// ── Enregistrer un retrait ───────────────────────────────────
export const createRetrait = createAction(
  '[Commande] Create Retrait',
  props<{ userId: number; menuId: number; badge_matricule: string }>()
);
export const createRetraitSuccess = createAction(
  '[Commande] Create Retrait Success',
  props<{ menuId: number; userId: number }>()
);
export const createRetraitFailure = createAction(
  '[Commande] Create Retrait Failure',
  props<{ error: string }>()
);

// ── Reset erreur ─────────────────────────────────────────────
export const resetCommandeError = createAction('[Commande] Reset Error');

// ── Reset commandes par menu ──────────────────────────────────
export const resetCommandesParMenu = createAction('[Commande] Reset Par Menu');

// ── Reset commandes par agence/période ───────────────────────
export const resetCommandesParAgencePeriode = createAction('[Commande] Reset Par Agence Periode');
