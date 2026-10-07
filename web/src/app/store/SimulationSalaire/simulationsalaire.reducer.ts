import { Action, createReducer, on } from '@ngrx/store';
import { 
  addsimulationsalaireDataSuccess, 
  deletesimulationsalaireSuccess,
  deletemultiplesimulationsalaireSuccess,
  fetchsimulationsalaireData, 
  fetchsimulationsalaireFailure, 
  fetchsimulationsalaireSuccess, 
  updatesimulationsalaireDataSuccess,
  fetchsimulationsalaireNoPaginateSuccess
} from './simulationsalaire.action';
import { SimulationsalairelistModel } from './simulationsalaire.model';

export interface SimulationsalaireState {
  simulationsalaireData: SimulationsalairelistModel[];
  allSimulationsalaires: SimulationsalairelistModel[];  
  totalItems: number;
  next: string | null;
  previous: string | null;
  loading: boolean;
  error: any;
  currentPage: number;
}

export const initialState: SimulationsalaireState = {
  simulationsalaireData: [],
  allSimulationsalaires: [],  
  totalItems: 0,
  next: null,
  previous: null,
  loading: false,
  error: null,
  currentPage: 1
};

export const SimulationsalaireReducer = createReducer(
  initialState,
  on(fetchsimulationsalaireData, (state, { page }) => {
    return { ...state, loading: true, error: null, currentPage: page || state.currentPage };
  }),
  on(fetchsimulationsalaireSuccess, (state, { response }) => {
    return { 
      ...state, 
      simulationsalaireData: response.results, 
      totalItems: response.count,
      next: response.next,
      previous: response.previous,
      loading: false 
    };
  }),
  on(fetchsimulationsalaireFailure, (state, { error }) => {
    return { ...state, error, loading: false };
  }),
   
  on(addsimulationsalaireDataSuccess, (state, { newData }) => {
    return { ...state, error: null };
  }),
  on(updatesimulationsalaireDataSuccess, (state, { updatedData }) => {
    return { ...state, error: null };
  }),
   
  on(deletesimulationsalaireSuccess, (state, { id }) => {
    return { ...state, error: null };
  }),
  
  on(deletemultiplesimulationsalaireSuccess, (state, { id }) => {
    return { ...state, error: null };
  }),

  on(fetchsimulationsalaireNoPaginateSuccess, (state, { response }) => {
      return {
        ...state,
        allSimulationsalaires: response, // Mettre à jour les simulationsalaire sans pagination
        loading: false
      };
    }),
);

// Selector
export function reducer(state: SimulationsalaireState | undefined, action: Action) {
  return SimulationsalaireReducer(state, action);
}