// src/app/store/Priorite/priorite.reducer.ts

import { Action, createReducer, on } from '@ngrx/store';
import {
  addprioriteDataSuccess,
  deleteprioriteSuccess,
  deletemultipleprioriteSuccess,
  fetchprioriteData,
  fetchprioriteFailure,
  fetchprioriteSuccess,
  updateprioriteDataSuccess,
  fetchprioriteNoPaginateSuccess,
} from './priorite.action';
import { PrioritelistModel } from './priorite.model';

export interface PrioriteState {
  prioritedata: PrioritelistModel[];
  allPriorites: PrioritelistModel[];
  totalItems:   number;
  next:         string | null;
  previous:     string | null;
  loading:      boolean;
  error:        any;
  currentPage:  number;
}

export const initialState: PrioriteState = {
  prioritedata: [],
  allPriorites: [],
  totalItems:   0,
  next:         null,
  previous:     null,
  loading:      false,
  error:        null,
  currentPage:  1,
};

export const PrioriteReducer = createReducer(
  initialState,

  on(fetchprioriteData, (state, { page }) => ({
    ...state,
    loading:     true,
    error:       null,
    currentPage: page ?? state.currentPage,
  })),

  on(fetchprioriteSuccess, (state, { response }) => ({
    ...state,
    prioritedata: response.results,
    totalItems:   response.count,
    next:         response.next,
    previous:     response.previous,
    loading:      false,
  })),

  on(fetchprioriteFailure, (state, { error }) => ({
    ...state,
    error,
    loading: false,
  })),

  on(addprioriteDataSuccess,        (state) => ({ ...state, error: null })),
  on(updateprioriteDataSuccess,     (state) => ({ ...state, error: null })),
  on(deleteprioriteSuccess,         (state) => ({ ...state, error: null })),
  on(deletemultipleprioriteSuccess, (state) => ({ ...state, error: null })),

  on(fetchprioriteNoPaginateSuccess, (state, { response }) => ({
    ...state,
    allPriorites: response,
    loading:      false,
  })),
);

export function reducer(state: PrioriteState | undefined, action: Action) {
  return PrioriteReducer(state, action);
}
