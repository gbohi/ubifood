// src/app/store/Statut/statut.reducer.ts

import { Action, createReducer, on } from '@ngrx/store';
import {
  addstatutDataSuccess,
  deletestatutSuccess,
  deletemultiplestatutSuccess,
  fetchstatutData,
  fetchstatutFailure,
  fetchstatutSuccess,
  updatestatutDataSuccess,
  fetchstatutNoPaginateSuccess,
} from './statut.action';
import { StatutlistModel } from './statut.model';

export interface StatutState {
  statutdata: StatutlistModel[];
  allStatuts: StatutlistModel[];
  totalItems: number;
  next:       string | null;
  previous:   string | null;
  loading:    boolean;
  error:      any;
  currentPage: number;
}

export const initialState: StatutState = {
  statutdata:  [],
  allStatuts:  [],
  totalItems:  0,
  next:        null,
  previous:    null,
  loading:     false,
  error:       null,
  currentPage: 1,
};

export const StatutReducer = createReducer(
  initialState,

  on(fetchstatutData, (state, { page }) => ({
    ...state,
    loading:     true,
    error:       null,
    currentPage: page ?? state.currentPage,
  })),

  on(fetchstatutSuccess, (state, { response }) => ({
    ...state,
    statutdata: response.results,
    totalItems: response.count,
    next:       response.next,
    previous:   response.previous,
    loading:    false,
  })),

  on(fetchstatutFailure, (state, { error }) => ({
    ...state,
    error,
    loading: false,
  })),

  on(addstatutDataSuccess,        (state) => ({ ...state, error: null })),
  on(updatestatutDataSuccess,     (state) => ({ ...state, error: null })),
  on(deletestatutSuccess,         (state) => ({ ...state, error: null })),
  on(deletemultiplestatutSuccess, (state) => ({ ...state, error: null })),

  on(fetchstatutNoPaginateSuccess, (state, { response }) => ({
    ...state,
    allStatuts: response,
    loading:    false,
  })),
);

export function reducer(state: StatutState | undefined, action: Action) {
  return StatutReducer(state, action);
}
