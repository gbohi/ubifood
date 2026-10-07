// src/app/store/Comptecomptable/comptecomptable.reducer.ts

import { Action, createReducer, on } from '@ngrx/store';
import {
  addcomptecomptableDataSuccess,
  deletecomptecomptableSuccess,
  deletemultiplecomptecomptableSuccess,
  fetchcomptecomptableData,
  fetchcomptecomptableFailure,
  fetchcomptecomptableSuccess,
  updatecomptecomptableDataSuccess,
  fetchcomptecomptableNoPaginateSuccess,
} from './comptecomptable.action';
import { ComptecomptablelistModel } from './comptecomptable.model';

export interface ComptecomptableState {
  comptecomptableData: ComptecomptablelistModel[];
  allComptecomptables: ComptecomptablelistModel[];
  totalItems:          number;
  next:                string | null;
  previous:            string | null;
  loading:             boolean;
  error:               any;
  currentPage:         number;
}

export const initialState: ComptecomptableState = {
  comptecomptableData: [],
  allComptecomptables: [],
  totalItems:          0,
  next:                null,
  previous:            null,
  loading:             false,
  error:               null,
  currentPage:         1,
};

export const ComptecomptableReducer = createReducer(
  initialState,

  on(fetchcomptecomptableData, (state, { page }) => ({
    ...state,
    loading:     true,
    error:       null,
    currentPage: page ?? state.currentPage,
  })),

  on(fetchcomptecomptableSuccess, (state, { response }) => ({
    ...state,
    comptecomptableData: response.results,
    totalItems:          response.count,
    next:                response.next,
    previous:            response.previous,
    loading:             false,
  })),

  on(fetchcomptecomptableFailure, (state, { error }) => ({
    ...state,
    error,
    loading: false,
  })),

  on(addcomptecomptableDataSuccess,        (state) => ({ ...state, error: null })),
  on(updatecomptecomptableDataSuccess,     (state) => ({ ...state, error: null })),
  on(deletecomptecomptableSuccess,         (state) => ({ ...state, error: null })),
  on(deletemultiplecomptecomptableSuccess, (state) => ({ ...state, error: null })),

  on(fetchcomptecomptableNoPaginateSuccess, (state, { response }) => ({
    ...state,
    allComptecomptables: response,
    loading:             false,
  })),
);

export function reducer(state: ComptecomptableState | undefined, action: Action) {
  return ComptecomptableReducer(state, action);
}
