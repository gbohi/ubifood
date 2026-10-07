// src/app/store/Postereporting/postereporting.reducer.ts

import { Action, createReducer, on } from '@ngrx/store';
import {
  addpostereportingDataSuccess,
  deletepostereportingSuccess,
  deletemultiplepostereportingSuccess,
  fetchpostereportingData,
  fetchpostereportingFailure,
  fetchpostereportingSuccess,
  updatepostereportingDataSuccess,
  fetchpostereportingNoPaginateSuccess,
} from './postereporting.action';
import { PostereportinglistModel } from './postereporting.model';

export interface PostereportingState {
  postereportingData: PostereportinglistModel[];
  allPostereportings: PostereportinglistModel[];
  totalItems:         number;
  next:               string | null;
  previous:           string | null;
  loading:            boolean;
  error:              any;
  currentPage:        number;
}

export const initialState: PostereportingState = {
  postereportingData: [],
  allPostereportings: [],
  totalItems:         0,
  next:               null,
  previous:           null,
  loading:            false,
  error:              null,
  currentPage:        1,
};

export const PostereportingReducer = createReducer(
  initialState,

  on(fetchpostereportingData, (state, { page }) => ({
    ...state,
    loading:     true,
    error:       null,
    currentPage: page ?? state.currentPage,
  })),

  on(fetchpostereportingSuccess, (state, { response }) => ({
    ...state,
    postereportingData: response.results,
    totalItems:         response.count,
    next:               response.next,
    previous:           response.previous,
    loading:            false,
  })),

  on(fetchpostereportingFailure, (state, { error }) => ({
    ...state,
    error,
    loading: false,
  })),

  on(addpostereportingDataSuccess,        (state) => ({ ...state, error: null })),
  on(updatepostereportingDataSuccess,     (state) => ({ ...state, error: null })),
  on(deletepostereportingSuccess,         (state) => ({ ...state, error: null })),
  on(deletemultiplepostereportingSuccess, (state) => ({ ...state, error: null })),

  on(fetchpostereportingNoPaginateSuccess, (state, { response }) => ({
    ...state,
    allPostereportings: response,
    loading:            false,
  })),
);

export function reducer(state: PostereportingState | undefined, action: Action) {
  return PostereportingReducer(state, action);
}
