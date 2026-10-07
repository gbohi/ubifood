// src/app/store/PlatCategoriesalarie/plat-categoriesalarie.action.ts

import { createAction, props } from '@ngrx/store';
import { PlatCategoriesalarieModel } from './plat-categoriesalarie.model';

// ── Charger les tarifs d'une catégorie salarié ───────────────
export const fetchPlatCategoriesalarie = createAction(
  '[PlatCategoriesalarie] Fetch By Categoriesalarie',
  props<{ categoriesalarieId: number }>()
);
export const fetchPlatCategoriesalarieSuccess = createAction(
  '[PlatCategoriesalarie] Fetch By Categoriesalarie Success',
  props<{ tarifs: PlatCategoriesalarieModel[] }>()
);
export const fetchPlatCategoriesalarieFailure = createAction(
  '[PlatCategoriesalarie] Fetch By Categoriesalarie Failure',
  props<{ error: string }>()
);

// ── Créer un tarif ────────────────────────────────────────────
export const createPlatCategoriesalarie = createAction(
  '[PlatCategoriesalarie] Create',
  props<{ data: Partial<PlatCategoriesalarieModel> }>()
);
export const createPlatCategoriesalarieSuccess = createAction(
  '[PlatCategoriesalarie] Create Success',
  props<{ tarif: PlatCategoriesalarieModel }>()
);
export const createPlatCategoriesalarieFailure = createAction(
  '[PlatCategoriesalarie] Create Failure',
  props<{ error: string }>()
);

// ── Mettre à jour un tarif ────────────────────────────────────
export const updatePlatCategoriesalarie = createAction(
  '[PlatCategoriesalarie] Update',
  props<{ id: number; data: Partial<PlatCategoriesalarieModel> }>()
);
export const updatePlatCategoriesalarieSuccess = createAction(
  '[PlatCategoriesalarie] Update Success',
  props<{ tarif: PlatCategoriesalarieModel }>()
);
export const updatePlatCategoriesalarieFailure = createAction(
  '[PlatCategoriesalarie] Update Failure',
  props<{ error: string }>()
);

// ── Supprimer un tarif ────────────────────────────────────────
export const deletePlatCategoriesalarie = createAction(
  '[PlatCategoriesalarie] Delete',
  props<{ id: number }>()
);
export const deletePlatCategoriesalarieSuccess = createAction(
  '[PlatCategoriesalarie] Delete Success',
  props<{ id: number }>()
);
export const deletePlatCategoriesalarieFailure = createAction(
  '[PlatCategoriesalarie] Delete Failure',
  props<{ error: string }>()
);

// ── Sauvegarder en batch (création catégorie) ─────────────────
export const savePlatCategoriesalariesBatch = createAction(
  '[PlatCategoriesalarie] Save Batch',
  props<{ categoriesalarieId: number; tarifs: Partial<PlatCategoriesalarieModel>[] }>()
);
export const savePlatCategoriesalariesBatchSuccess = createAction(
  '[PlatCategoriesalarie] Save Batch Success',
  props<{ categoriesalarieId: number }>()
);
export const savePlatCategoriesalariesBatchFailure = createAction(
  '[PlatCategoriesalarie] Save Batch Failure',
  props<{ error: string }>()
);

// ── Reset ─────────────────────────────────────────────────────
export const resetPlatCategoriesalarie = createAction('[PlatCategoriesalarie] Reset');
