// src/app/store/Classecomptable/classecomptable.reducer.ts

import { Action, createReducer, on } from '@ngrx/store';
import {
  addclassecomptableDataSuccess,
  deleteclassecomptableSuccess,
  deletemultipleclassecomptableSuccess,
  fetchclassecomptableData,
  fetchclassecomptableFailure,
  fetchclassecomptableSuccess,
  updateclassecomptableDataSuccess,
  fetchclassecomptableNoPaginateSuccess,
} from './classecomptable.action';
import { ClassecomptablelistModel } from './classecomptable.model';

export interface ClassecomptableState {
  classecomptableData: ClassecomptablelistModel[];
  allClassecomptables: ClassecomptablelistModel[];
  totalItems:          number;
  next:                string | null;
  previous:            string | null;
  loading:             boolean;
  error:               any;
  currentPage:         number;
}

export const initialState: ClassecomptableState = {
  classecomptableData: [],
  allClassecomptables: [],
  totalItems:          0,
  next:                null,
  previous:            null,
  loading:             false,
  error:               null,
  currentPage:         1,
};

export const ClassecomptableReducer = createReducer(
  initialState,

  on(fetchclassecomptableData, (state, { page }) => ({
    ...state,
    loading:     true,
    error:       null,
    currentPage: page ?? state.currentPage,
  })),

  on(fetchclassecomptableSuccess, (state, { response }) => ({
    ...state,
    classecomptableData: response.results,
    totalItems:          response.count,
    next:                response.next,
    previous:            response.previous,
    loading:             false,
  })),

  on(fetchclassecomptableFailure, (state, { error }) => ({
    ...state,
    error,
    loading: false,
  })),

  on(addclassecomptableDataSuccess,        (state) => ({ ...state, error: null })),
  on(updateclassecomptableDataSuccess,     (state) => ({ ...state, error: null })),
  on(deleteclassecomptableSuccess,         (state) => ({ ...state, error: null })),
  on(deletemultipleclassecomptableSuccess, (state) => ({ ...state, error: null })),

  on(fetchclassecomptableNoPaginateSuccess, (state, { response }) => ({
    ...state,
    allClassecomptables: response,
    loading:             false,
  })),
);

export function reducer(state: ClassecomptableState | undefined, action: Action) {
  return ClassecomptableReducer(state, action);
}
