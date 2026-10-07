// src/app/store/Typeplat/typeplat.reducer.ts

import { Action, createReducer, on } from '@ngrx/store';
import {
  addtypeplatDataSuccess,
  deletetypeplatSuccess,
  deletemultipletypeplatSuccess,
  fetchtypeplatData,
  fetchtypeplatFailure,
  fetchtypeplatSuccess,
  updatetypeplatDataSuccess,
  fetchtypeplatNoPaginateSuccess,
} from './typeplat.action';
import { TypeplatlistModel } from './typeplat.model';

export interface TypeplatState {
  typeplatdata: TypeplatlistModel[];
  allTypeplats: TypeplatlistModel[];
  totalItems:   number;
  next:         string | null;
  previous:     string | null;
  loading:      boolean;
  error:        any;
  currentPage:  number;
}

export const initialState: TypeplatState = {
  typeplatdata: [],
  allTypeplats: [],
  totalItems:   0,
  next:         null,
  previous:     null,
  loading:      false,
  error:        null,
  currentPage:  1,
};

export const TypeplatReducer = createReducer(
  initialState,

  on(fetchtypeplatData, (state, { page }) => ({
    ...state,
    loading:     true,
    error:       null,
    currentPage: page ?? state.currentPage,
  })),

  on(fetchtypeplatSuccess, (state, { response }) => ({
    ...state,
    typeplatdata: response.results,
    totalItems:   response.count,
    next:         response.next,
    previous:     response.previous,
    loading:      false,
  })),

  on(fetchtypeplatFailure, (state, { error }) => ({
    ...state,
    error,
    loading: false,
  })),

  on(addtypeplatDataSuccess,        (state) => ({ ...state, error: null })),
  on(updatetypeplatDataSuccess,     (state) => ({ ...state, error: null })),
  on(deletetypeplatSuccess,         (state) => ({ ...state, error: null })),
  on(deletemultipletypeplatSuccess, (state) => ({ ...state, error: null })),

  on(fetchtypeplatNoPaginateSuccess, (state, { response }) => ({
    ...state,
    allTypeplats: response,
    loading:      false,
  })),
);

export function reducer(state: TypeplatState | undefined, action: Action) {
  return TypeplatReducer(state, action);
}
