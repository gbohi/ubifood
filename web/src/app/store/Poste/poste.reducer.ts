// src/app/store/Poste/poste.reducer.ts

import { Action, createReducer, on } from '@ngrx/store';
import { PosteModel } from './poste.model';
import {
  addposteDataSuccess,
  deleteposteSuccess,
  deletemultipleposteSuccess,
  fetchposteData,
  fetchposteFailure,
  fetchposteSuccess,
  updateposteDataSuccess,
  fetchposteNoPaginateSuccess,
} from './poste.action';

export interface PosteState {
  posteData:   PosteModel[];
  allPostes:   PosteModel[];
  totalItems:  number;
  next:        string | null;
  previous:    string | null;
  loading:     boolean;
  error:       any;
  currentPage: number;
}

export const initialState: PosteState = {
  posteData:   [],
  allPostes:   [],
  totalItems:  0,
  next:        null,
  previous:    null,
  loading:     false,
  error:       null,
  currentPage: 1,
};

export const PosteReducer = createReducer(
  initialState,

  on(fetchposteData, (state, { page }) => ({
    ...state, loading: true, error: null, currentPage: page || state.currentPage
  })),
  on(fetchposteSuccess, (state, { response }) => ({
    ...state,
    posteData:  response.results,
    totalItems: response.count,
    next:       response.next,
    previous:   response.previous,
    loading:    false,
  })),
  on(fetchposteFailure, (state, { error }) => ({
    ...state, error, loading: false
  })),

  on(addposteDataSuccess,          state => ({ ...state, error: null })),
  on(updateposteDataSuccess,       state => ({ ...state, error: null })),
  on(deleteposteSuccess,           state => ({ ...state, error: null })),
  on(deletemultipleposteSuccess,   state => ({ ...state, error: null })),

  on(fetchposteNoPaginateSuccess, (state, { response }) => ({
    ...state, allPostes: response, loading: false
  })),
);

export function reducer(state: PosteState | undefined, action: Action) {
  return PosteReducer(state, action);
}
