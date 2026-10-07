// src/app/store/Agence/agence.reducer.ts

import { Action, createReducer, on } from '@ngrx/store';
import {
  addagenceDataSuccess,
  deleteagenceSuccess,
  deletemultipleagenceSuccess,
  fetchagenceData,
  fetchagenceFailure,
  fetchagenceSuccess,
  updateagenceDataSuccess,
  fetchagenceNoPaginateSuccess,
} from './agence.action';
import { AgencelistModel } from './agence.model';

export interface AgenceState {
  agencedata:  AgencelistModel[];
  allAgences:  AgencelistModel[];
  totalItems:  number;
  next:        string | null;
  previous:    string | null;
  loading:     boolean;
  error:       any;
  currentPage: number;
}

export const initialState: AgenceState = {
  agencedata:  [],
  allAgences:  [],
  totalItems:  0,
  next:        null,
  previous:    null,
  loading:     false,
  error:       null,
  currentPage: 1,
};

export const AgenceReducer = createReducer(
  initialState,

  on(fetchagenceData, (state, { page }) => ({
    ...state,
    loading:     true,
    error:       null,
    currentPage: page ?? state.currentPage,
  })),

  on(fetchagenceSuccess, (state, { response }) => ({
    ...state,
    agencedata: response.results,
    totalItems: response.count,
    next:       response.next,
    previous:   response.previous,
    loading:    false,
  })),

  on(fetchagenceFailure, (state, { error }) => ({
    ...state,
    error,
    loading: false,
  })),

  on(addagenceDataSuccess,         (state) => ({ ...state, error: null })),
  on(updateagenceDataSuccess,      (state) => ({ ...state, error: null })),
  on(deleteagenceSuccess,          (state) => ({ ...state, error: null })),
  on(deletemultipleagenceSuccess,  (state) => ({ ...state, error: null })),

  on(fetchagenceNoPaginateSuccess, (state, { response }) => ({
    ...state,
    allAgences: response,
    loading:    false,
  })),
);

export function reducer(state: AgenceState | undefined, action: Action) {
  return AgenceReducer(state, action);
}
