// src/app/store/User/user.action.ts

import { createAction, props } from '@ngrx/store';
import { UserModel, ApiResponse } from './user.model';

// ── Fetch paginé ──────────────────────────────────────────────
export const fetchuserData = createAction(
  '[User] Fetch Data',
  props<{ page?: number }>()
);
export const fetchuserSuccess = createAction(
  '[User] Fetch Data Success',
  props<{ response: ApiResponse<UserModel> }>()
);
export const fetchuserFailure = createAction(
  '[User] Fetch Data Failure',
  props<{ error: string }>()
);

// ── ✅ Fetch sans pagination (pour les selects) ───────────────
export const fetchuserNoPaginateData = createAction(
  '[User] Fetch No Pagination'
);
export const fetchuserNoPaginateSuccess = createAction(
  '[User] Fetch No Pagination Success',
  props<{ response: UserModel[] }>()
);
export const fetchuserNoPaginateFailure = createAction(
  '[User] Fetch No Pagination Failure',
  props<{ error: string }>()
);

// ── Ajouter ───────────────────────────────────────────────────
export const adduserData = createAction(
  '[User] Add',
  props<{ newData: UserModel }>()
);
export const adduserDataSuccess = createAction(
  '[User] Add Success',
  props<{ newData: UserModel }>()
);
export const adduserDataFailure = createAction(
  '[User] Add Failure',
  props<{ error: string }>()
);

// ── Mettre à jour ─────────────────────────────────────────────
export const updateuserData = createAction(
  '[User] Update',
  props<{ updatedData: UserModel }>()
);
export const updateuserDataSuccess = createAction(
  '[User] Update Success',
  props<{ updatedData: UserModel }>()
);
export const updateuserDataFailure = createAction(
  '[User] Update Failure',
  props<{ error: string }>()
);

// ── Supprimer un élément ──────────────────────────────────────
export const deleteuserData = createAction(
  '[User] Delete',
  props<{ id: string }>()
);
export const deleteuserSuccess = createAction(
  '[User] Delete Success',
  props<{ id: string }>()
);
export const deleteuserFailure = createAction(
  '[User] Delete Failure',
  props<{ error: string }>()
);

// ── Supprimer plusieurs éléments ──────────────────────────────
export const deletemultipleuserData = createAction(
  '[User] Delete Multiple',
  props<{ id: string }>()
);
export const deletemultipleuserSuccess = createAction(
  '[User] Delete Multiple Success',
  props<{ id: string }>()
);
export const deletemultipleuserFailure = createAction(
  '[User] Delete Multiple Failure',
  props<{ error: string }>()
);

// ── Activer ───────────────────────────────────────────────────
export const activerUser = createAction(
  '[User] Activer',
  props<{ id: number }>()
);
export const activerUserSuccess = createAction(
  '[User] Activer Success',
  props<{ id: number }>()
);
export const activerUserFailure = createAction(
  '[User] Activer Failure',
  props<{ error: string }>()
);

// ── Désactiver ────────────────────────────────────────────────
export const desactiverUser = createAction(
  '[User] Desactiver',
  props<{ id: number }>()
);
export const desactiverUserSuccess = createAction(
  '[User] Desactiver Success',
  props<{ id: number }>()
);
export const desactiverUserFailure = createAction(
  '[User] Desactiver Failure',
  props<{ error: string }>()
);

// ── Activer multiple ──────────────────────────────────────────
export const activerMultipleUsers = createAction(
  '[User] Activer Multiple',
  props<{ ids: number[] }>()
);
export const activerMultipleUsersSuccess = createAction(
  '[User] Activer Multiple Success',
  props<{ ids: number[] }>()
);
export const activerMultipleUsersFailure = createAction(
  '[User] Activer Multiple Failure',
  props<{ error: string }>()
);

// ── Désactiver multiple ───────────────────────────────────────
export const desactiverMultipleUsers = createAction(
  '[User] Desactiver Multiple',
  props<{ ids: number[] }>()
);
export const desactiverMultipleUsersSuccess = createAction(
  '[User] Desactiver Multiple Success',
  props<{ ids: number[] }>()
);
export const desactiverMultipleUsersFailure = createAction(
  '[User] Desactiver Multiple Failure',
  props<{ error: string }>()
);

// ── Changer mot de passe ──────────────────────────────────────
export const changerMotDePasse = createAction(
  '[User] Changer Mot De Passe',
  props<{ id: number; password: string }>()
);
export const changerMotDePasseSuccess = createAction(
  '[User] Changer Mot De Passe Success'
);
export const changerMotDePasseFailure = createAction(
  '[User] Changer Mot De Passe Failure',
  props<{ error: string }>()
);
