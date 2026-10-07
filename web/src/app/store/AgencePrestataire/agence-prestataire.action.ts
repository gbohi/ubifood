// src/app/store/AgencePrestataire/agence-prestataire.action.ts

import { createAction, props } from '@ngrx/store';
import { AgencePrestataireModel } from './agence-prestataire.model';

// ── Charger les agences d'un prestataire ─────────────────────
export const fetchAgencePrestataire = createAction(
  '[AgencePrestataire] Fetch By Prestataire',
  props<{ prestataireId: number }>()
);
export const fetchAgencePrestataireSuccess = createAction(
  '[AgencePrestataire] Fetch By Prestataire Success',
  props<{ agences: AgencePrestataireModel[] }>()
);
export const fetchAgencePrestataireFailure = createAction(
  '[AgencePrestataire] Fetch By Prestataire Failure',
  props<{ error: string }>()
);

// ── Créer une liaison ─────────────────────────────────────────
export const createAgencePrestataire = createAction(
  '[AgencePrestataire] Create',
  props<{ data: Partial<AgencePrestataireModel> }>()
);
export const createAgencePrestataireSuccess = createAction(
  '[AgencePrestataire] Create Success',
  props<{ agence: AgencePrestataireModel }>()
);
export const createAgencePrestataireFailure = createAction(
  '[AgencePrestataire] Create Failure',
  props<{ error: string }>()
);

// ── Mettre à jour une liaison ─────────────────────────────────
export const updateAgencePrestataire = createAction(
  '[AgencePrestataire] Update',
  props<{ id: number; data: Partial<AgencePrestataireModel> }>()
);
export const updateAgencePrestataireSuccess = createAction(
  '[AgencePrestataire] Update Success',
  props<{ agence: AgencePrestataireModel }>()
);
export const updateAgencePrestataireFailure = createAction(
  '[AgencePrestataire] Update Failure',
  props<{ error: string }>()
);

// ── Supprimer une liaison ─────────────────────────────────────
export const deleteAgencePrestataire = createAction(
  '[AgencePrestataire] Delete',
  props<{ id: number }>()
);
export const deleteAgencePrestataireSuccess = createAction(
  '[AgencePrestataire] Delete Success',
  props<{ id: number }>()
);
export const deleteAgencePrestataireFailure = createAction(
  '[AgencePrestataire] Delete Failure',
  props<{ error: string }>()
);

// ── Sauvegarder en batch (création prestataire) ──────────────
export const saveAgencePrestatairesBatch = createAction(
  '[AgencePrestataire] Save Batch',
  props<{ prestataireId: number; agences: Partial<AgencePrestataireModel>[] }>()
);
export const saveAgencePrestatairesBatchSuccess = createAction(
  '[AgencePrestataire] Save Batch Success',
  props<{ prestataireId: number }>()
);
export const saveAgencePrestatairesBatchFailure = createAction(
  '[AgencePrestataire] Save Batch Failure',
  props<{ error: string }>()
);

// ── Reset ─────────────────────────────────────────────────────
export const resetAgencePrestataire = createAction('[AgencePrestataire] Reset');
