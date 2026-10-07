// src/app/store/Typeequipe/typeequipe.reducer.ts

import { Action, createReducer, on } from '@ngrx/store';
import {
  addtypeequipeDataSuccess,
  deletetypeequipeSuccess,
  deletemultipletypeequipeSuccess,
  fetchtypeequipeData,
  fetchtypeequipeFailure,
  fetchtypeequipeSuccess,
  updatetypeequipeDataSuccess,
  fetchtypeequipeNoPaginateSuccess,
} from './typeequipe.action';
import { TypeequipelistModel } from './typeequipe.model';

export interface TypeequipeState {
  typeequipedata: TypeequipelistModel[];
  allTypeequipes: TypeequipelistModel[];
  totalItems:     number;
  next:           string | null;
  previous:       string | null;
  loading:        boolean;
  error:          any;
  currentPage:    number;
}

export const initialState: TypeequipeState = {
  typeequipedata: [],
  allTypeequipes: [],
  totalItems:     0,
  next:           null,
  previous:       null,
  loading:        false,
  error:          null,
  currentPage:    1,
};

export const TypeequipeReducer = createReducer(
  initialState,

  on(fetchtypeequipeData, (state, { page }) => ({
    ...state,
    loading:     true,
    error:       null,
    currentPage: page ?? state.currentPage,
  })),

  on(fetchtypeequipeSuccess, (state, { response }) => ({
    ...state,
    typeequipedata: response.results,
    totalItems:     response.count,
    next:           response.next,
    previous:       response.previous,
    loading:        false,
  })),

  on(fetchtypeequipeFailure, (state, { error }) => ({
    ...state,
    error,
    loading: false,
  })),

  on(addtypeequipeDataSuccess,        (state) => ({ ...state, error: null })),
  on(updatetypeequipeDataSuccess,     (state) => ({ ...state, error: null })),
  on(deletetypeequipeSuccess,         (state) => ({ ...state, error: null })),
  on(deletemultipletypeequipeSuccess, (state) => ({ ...state, error: null })),

  on(fetchtypeequipeNoPaginateSuccess, (state, { response }) => ({
    ...state,
    allTypeequipes: response,
    loading:        false,
  })),
);

export function reducer(state: TypeequipeState | undefined, action: Action) {
  return TypeequipeReducer(state, action);
}
