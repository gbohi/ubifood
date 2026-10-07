// src/app/store/Categoriecomptable/categoriecomptable.reducer.ts

import { Action, createReducer, on } from '@ngrx/store';
import {
  addcategoriecomptableDataSuccess,
  deletecategoriecomptableSuccess,
  deletemultiplecategoriecomptableSuccess,
  fetchcategoriecomptableData,
  fetchcategoriecomptableFailure,
  fetchcategoriecomptableSuccess,
  updatecategoriecomptableDataSuccess,
  fetchcategoriecomptableNoPaginateSuccess,
} from './categoriecomptable.action';
import { CategoriecomptablelistModel } from './categoriecomptable.model';

export interface CategoriecomptableState {
  categoriecomptableData: CategoriecomptablelistModel[];
  allCategoriecomptables: CategoriecomptablelistModel[];
  totalItems:             number;
  next:                   string | null;
  previous:               string | null;
  loading:                boolean;
  error:                  any;
  currentPage:            number;
}

export const initialState: CategoriecomptableState = {
  categoriecomptableData: [],
  allCategoriecomptables: [],
  totalItems:             0,
  next:                   null,
  previous:               null,
  loading:                false,
  error:                  null,
  currentPage:            1,
};

export const CategoriecomptableReducer = createReducer(
  initialState,

  on(fetchcategoriecomptableData, (state, { page }) => ({
    ...state,
    loading:     true,
    error:       null,
    currentPage: page ?? state.currentPage,
  })),

  on(fetchcategoriecomptableSuccess, (state, { response }) => ({
    ...state,
    categoriecomptableData: response.results,
    totalItems:             response.count,
    next:                   response.next,
    previous:               response.previous,
    loading:                false,
  })),

  on(fetchcategoriecomptableFailure, (state, { error }) => ({
    ...state,
    error,
    loading: false,
  })),

  on(addcategoriecomptableDataSuccess,        (state) => ({ ...state, error: null })),
  on(updatecategoriecomptableDataSuccess,     (state) => ({ ...state, error: null })),
  on(deletecategoriecomptableSuccess,         (state) => ({ ...state, error: null })),
  on(deletemultiplecategoriecomptableSuccess, (state) => ({ ...state, error: null })),

  on(fetchcategoriecomptableNoPaginateSuccess, (state, { response }) => ({
    ...state,
    allCategoriecomptables: response,
    loading:                false,
  })),
);

export function reducer(state: CategoriecomptableState | undefined, action: Action) {
  return CategoriecomptableReducer(state, action);
}
