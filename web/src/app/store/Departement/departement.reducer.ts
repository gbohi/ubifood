// src/app/store/Departement/departement.reducer.ts

import { Action, createReducer, on } from '@ngrx/store';
import {
  adddepartementDataSuccess,
  deletedepartementSuccess,
  deletemultipledepartementSuccess,
  fetchdepartementData,
  fetchdepartementFailure,
  fetchdepartementSuccess,
  updatedepartementDataSuccess,
  fetchdepartementNoPaginateSuccess,
} from './departement.action';
import { DepartementlistModel } from './departement.model';

export interface DepartementState {
  departementdata:  DepartementlistModel[];
  allDepartements:  DepartementlistModel[];   // ✅ liste sans pagination
  totalItems:       number;
  next:             string | null;
  previous:         string | null;
  loading:          boolean;
  error:            any;
  currentPage:      number;
}

export const initialState: DepartementState = {
  departementdata:  [],
  allDepartements:  [],
  totalItems:       0,
  next:             null,
  previous:         null,
  loading:          false,
  error:            null,
  currentPage:      1,
};

export const DepartementReducer = createReducer(
  initialState,

  on(fetchdepartementData, (state, { page }) => ({
    ...state, loading: true, error: null, currentPage: page || state.currentPage
  })),
  on(fetchdepartementSuccess, (state, { response }) => ({
    ...state,
    departementdata: response.results,
    totalItems:      response.count,
    next:            response.next,
    previous:        response.previous,
    loading:         false,
  })),
  on(fetchdepartementFailure, (state, { error }) => ({
    ...state, error, loading: false
  })),

  on(adddepartementDataSuccess,        state => ({ ...state, error: null })),
  on(updatedepartementDataSuccess,     state => ({ ...state, error: null })),
  on(deletedepartementSuccess,         state => ({ ...state, error: null })),
  on(deletemultipledepartementSuccess, state => ({ ...state, error: null })),

  // ✅ Liste sans pagination
  on(fetchdepartementNoPaginateSuccess, (state, { response }) => ({
    ...state, allDepartements: response, loading: false
  })),
);

export function reducer(state: DepartementState | undefined, action: Action) {
  return DepartementReducer(state, action);
}
