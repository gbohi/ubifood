// src/app/store/Vehicule/vehicule.reducer.ts

import { Action, createReducer, on } from '@ngrx/store';
import {
  addvehiculeDataSuccess,
  deletevehiculeSuccess,
  deletemultiplevehiculeSuccess,
  fetchvehiculeData,
  fetchvehiculeFailure,
  fetchvehiculeSuccess,
  updatevehiculeDataSuccess,
  fetchvehiculeNoPaginateSuccess,
} from './vehicule.action';
import { VehiculelistModel } from './vehicule.model';

export interface VehiculeState {
  vehiculeData: VehiculelistModel[];
  allVehicules: VehiculelistModel[];
  totalItems:   number;
  next:         string | null;
  previous:     string | null;
  loading:      boolean;
  error:        any;
  currentPage:  number;
}

export const initialState: VehiculeState = {
  vehiculeData: [],
  allVehicules: [],
  totalItems:   0,
  next:         null,
  previous:     null,
  loading:      false,
  error:        null,
  currentPage:  1,
};

export const VehiculeReducer = createReducer(
  initialState,

  on(fetchvehiculeData, (state, { page }) => ({
    ...state,
    loading:     true,
    error:       null,
    currentPage: page ?? state.currentPage,
  })),

  on(fetchvehiculeSuccess, (state, { response }) => ({
    ...state,
    vehiculeData: response.results,
    totalItems:   response.count,
    next:         response.next,
    previous:     response.previous,
    loading:      false,
  })),

  on(fetchvehiculeFailure, (state, { error }) => ({
    ...state,
    error,
    loading: false,
  })),

  on(addvehiculeDataSuccess,        (state) => ({ ...state, error: null })),
  on(updatevehiculeDataSuccess,     (state) => ({ ...state, error: null })),
  on(deletevehiculeSuccess,         (state) => ({ ...state, error: null })),
  on(deletemultiplevehiculeSuccess, (state) => ({ ...state, error: null })),

  on(fetchvehiculeNoPaginateSuccess, (state, { response }) => ({
    ...state,
    allVehicules: response,
    loading:      false,
  })),
);

export function reducer(state: VehiculeState | undefined, action: Action) {
  return VehiculeReducer(state, action);
}
