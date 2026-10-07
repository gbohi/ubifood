// src/app/store/User/user.reducer.ts

import { Action, createReducer, on } from '@ngrx/store';
import { UserModel } from './user.model';
import {
  fetchuserData, fetchuserSuccess, fetchuserFailure,
  fetchuserNoPaginateSuccess,
  adduserDataSuccess, updateuserDataSuccess,
  deleteuserSuccess, deletemultipleuserSuccess,
  activerUserSuccess, desactiverUserSuccess,
  activerMultipleUsersSuccess, desactiverMultipleUsersSuccess,
} from './user.action';

export interface UserState {
  userData:    UserModel[];
  allUsers:    UserModel[];   // ✅ liste complète pour les selects
  totalItems:  number;
  next:        string | null;
  previous:    string | null;
  loading:     boolean;
  error:       any;
  currentPage: number;
}

export const initialState: UserState = {
  userData:    [],
  allUsers:    [],
  totalItems:  0,
  next:        null,
  previous:    null,
  loading:     false,
  error:       null,
  currentPage: 1,
};

export const UserReducer = createReducer(
  initialState,

  on(fetchuserData, (state, { page }) => ({
    ...state,
    loading:     true,
    error:       null,
    currentPage: page ?? state.currentPage,
  })),

  on(fetchuserSuccess, (state, { response }) => ({
    ...state,
    userData:   response.results,
    totalItems: response.count,
    next:       response.next,
    previous:   response.previous,
    loading:    false,
  })),

  on(fetchuserFailure, (state, { error }) => ({
    ...state, error, loading: false,
  })),

  // ✅ Liste complète sans pagination
  on(fetchuserNoPaginateSuccess, (state, { response }) => ({
    ...state,
    allUsers: response,
    loading:  false,
  })),

  on(adduserDataSuccess,             state => ({ ...state, error: null })),
  on(updateuserDataSuccess,          state => ({ ...state, error: null })),
  on(deleteuserSuccess,              state => ({ ...state, error: null })),
  on(deletemultipleuserSuccess,      state => ({ ...state, error: null })),
  on(activerUserSuccess,             state => ({ ...state, error: null })),
  on(desactiverUserSuccess,          state => ({ ...state, error: null })),
  on(activerMultipleUsersSuccess,    state => ({ ...state, error: null })),
  on(desactiverMultipleUsersSuccess, state => ({ ...state, error: null })),
);

export function reducer(state: UserState | undefined, action: Action) {
  return UserReducer(state, action);
}
