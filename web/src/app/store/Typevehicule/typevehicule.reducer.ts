// src/app/store/Typevehicule/typevehicule.reducer.ts

import { Action, createReducer, on } from '@ngrx/store';
import {
  addtypevehiculeDataSuccess,
  deletetypevehiculeSuccess,
  deletemultipletypevehiculeSuccess,
  fetchtypevehiculeData,
  fetchtypevehiculeFailure,
  fetchtypevehiculeSuccess,
  updatetypevehiculeDataSuccess,
  fetchtypevehiculeNoPaginateSuccess,
} from './typevehicule.action';
import { TypevehiculelistModel } from './typevehicule.model';

export interface TypevehiculeState {
  typevehiculedata: TypevehiculelistModel[];
  allTypevehicules: TypevehiculelistModel[];
  totalItems:       number;
  next:             string | null;
  previous:         string | null;
  loading:          boolean;
  error:            any;
  currentPage:      number;
}

export const initialState: TypevehiculeState = {
  typevehiculedata: [],
  allTypevehicules: [],
  totalItems:       0,
  next:             null,
  previous:         null,
  loading:          false,
  error:            null,
  currentPage:      1,
};

export const TypevehiculeReducer = createReducer(
  initialState,

  on(fetchtypevehiculeData, (state, { page }) => ({
    ...state,
    loading:     true,
    error:       null,
    currentPage: page ?? state.currentPage,
  })),

  on(fetchtypevehiculeSuccess, (state, { response }) => ({
    ...state,
    typevehiculedata: response.results,
    totalItems:       response.count,
    next:             response.next,
    previous:         response.previous,
    loading:          false,
  })),

  on(fetchtypevehiculeFailure, (state, { error }) => ({
    ...state,
    error,
    loading: false,
  })),

  on(addtypevehiculeDataSuccess,        (state) => ({ ...state, error: null })),
  on(updatetypevehiculeDataSuccess,     (state) => ({ ...state, error: null })),
  on(deletetypevehiculeSuccess,         (state) => ({ ...state, error: null })),
  on(deletemultipletypevehiculeSuccess, (state) => ({ ...state, error: null })),

  on(fetchtypevehiculeNoPaginateSuccess, (state, { response }) => ({
    ...state,
    allTypevehicules: response,
    loading:          false,
  })),
);

export function reducer(state: TypevehiculeState | undefined, action: Action) {
  return TypevehiculeReducer(state, action);
}
