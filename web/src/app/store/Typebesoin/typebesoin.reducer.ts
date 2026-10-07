// src/app/store/Typebesoin/typebesoin.reducer.ts

import { Action, createReducer, on } from '@ngrx/store';
import {
  addtypebesoinDataSuccess,
  deletetypebesoinSuccess,
  deletemultipletypebesoinSuccess,
  fetchtypebesoinData,
  fetchtypebesoinFailure,
  fetchtypebesoinSuccess,
  updatetypebesoinDataSuccess,
  fetchtypebesoinNoPaginateSuccess,
} from './typebesoin.action';
import { TypebesoinlistModel } from './typebesoin.model';

export interface TypebesoinState {
  typebesoindata: TypebesoinlistModel[];
  allTypebesoins: TypebesoinlistModel[];
  totalItems:     number;
  next:           string | null;
  previous:       string | null;
  loading:        boolean;
  error:          any;
  currentPage:    number;
}

export const initialState: TypebesoinState = {
  typebesoindata: [],
  allTypebesoins: [],
  totalItems:     0,
  next:           null,
  previous:       null,
  loading:        false,
  error:          null,
  currentPage:    1,
};

export const TypebesoinReducer = createReducer(
  initialState,

  on(fetchtypebesoinData, (state, { page }) => ({
    ...state,
    loading:     true,
    error:       null,
    currentPage: page ?? state.currentPage,
  })),

  on(fetchtypebesoinSuccess, (state, { response }) => ({
    ...state,
    typebesoindata: response.results,
    totalItems:     response.count,
    next:           response.next,
    previous:       response.previous,
    loading:        false,
  })),

  on(fetchtypebesoinFailure, (state, { error }) => ({
    ...state,
    error,
    loading: false,
  })),

  on(addtypebesoinDataSuccess,        (state) => ({ ...state, error: null })),
  on(updatetypebesoinDataSuccess,     (state) => ({ ...state, error: null })),
  on(deletetypebesoinSuccess,         (state) => ({ ...state, error: null })),
  on(deletemultipletypebesoinSuccess, (state) => ({ ...state, error: null })),

  on(fetchtypebesoinNoPaginateSuccess, (state, { response }) => ({
    ...state,
    allTypebesoins: response,
    loading:        false,
  })),
);

export function reducer(state: TypebesoinState | undefined, action: Action) {
  return TypebesoinReducer(state, action);
}
