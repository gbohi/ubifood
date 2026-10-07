// src/app/store/PlatPrestataire/plat-prestataire.action.ts

import { createAction, props } from '@ngrx/store';
import { PlatPrestataireModel } from './plat-prestataire.model';

// ── Charger les tarifs d'un prestataire ──────────────────────
export const fetchPlatPrestataire = createAction(
  '[PlatPrestataire] Fetch By Prestataire',
  props<{ prestataireId: number }>()
);
export const fetchPlatPrestataireSuccess = createAction(
  '[PlatPrestataire] Fetch By Prestataire Success',
  props<{ tarifs: PlatPrestataireModel[] }>()
);
export const fetchPlatPrestataireFailure = createAction(
  '[PlatPrestataire] Fetch By Prestataire Failure',
  props<{ error: string }>()
);

// ── Créer un tarif ────────────────────────────────────────────
export const createPlatPrestataire = createAction(
  '[PlatPrestataire] Create',
  props<{ data: Partial<PlatPrestataireModel> }>()
);
export const createPlatPrestataireSuccess = createAction(
  '[PlatPrestataire] Create Success',
  props<{ tarif: PlatPrestataireModel }>()
);
export const createPlatPrestataireFailure = createAction(
  '[PlatPrestataire] Create Failure',
  props<{ error: string }>()
);

// ── Mettre à jour un tarif ────────────────────────────────────
export const updatePlatPrestataire = createAction(
  '[PlatPrestataire] Update',
  props<{ id: number; data: Partial<PlatPrestataireModel> }>()
);
export const updatePlatPrestataireSuccess = createAction(
  '[PlatPrestataire] Update Success',
  props<{ tarif: PlatPrestataireModel }>()
);
export const updatePlatPrestataireFailure = createAction(
  '[PlatPrestataire] Update Failure',
  props<{ error: string }>()
);

// ── Supprimer un tarif ────────────────────────────────────────
export const deletePlatPrestataire = createAction(
  '[PlatPrestataire] Delete',
  props<{ id: number }>()
);
export const deletePlatPrestataireSuccess = createAction(
  '[PlatPrestataire] Delete Success',
  props<{ id: number }>()
);
export const deletePlatPrestataireFailure = createAction(
  '[PlatPrestataire] Delete Failure',
  props<{ error: string }>()
);

// ── Sauvegarder plusieurs tarifs en batch (création) ─────────
export const savePlatPrestatairesBatch = createAction(
  '[PlatPrestataire] Save Batch',
  props<{ prestataireId: number; tarifs: Partial<PlatPrestataireModel>[] }>()
);
export const savePlatPrestatairesBatchSuccess = createAction(
  '[PlatPrestataire] Save Batch Success',
  props<{ prestataireId: number }>()
);
export const savePlatPrestatairesBatchFailure = createAction(
  '[PlatPrestataire] Save Batch Failure',
  props<{ error: string }>()
);

// ── Reset ─────────────────────────────────────────────────────
export const resetPlatPrestataire = createAction('[PlatPrestataire] Reset');
