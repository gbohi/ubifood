import { Action, createReducer, on } from '@ngrx/store';
import { 
  addetatDataSuccess, 
  deleteetatSuccess,
  deletemultipleetatSuccess,
  fetchetatData, 
  fetchetatFailure, 
  fetchetatSuccess, 
  updateetatDataSuccess,
  fetchetatNoPaginateSuccess 
} from './etat.action';
import { EtatlistModel } from './etat.model';

export interface EtatState {
  etatdata: EtatlistModel[];
  allEtats: EtatlistModel[];
  totalItems: number;
  next: string | null;
  previous: string | null;
  loading: boolean;
  error: any;
  currentPage: number;
}

export const initialState: EtatState = {
  etatdata: [],
  allEtats: [], 
  totalItems: 0,
  next: null,
  previous: null,
  loading: false,
  error: null,
  currentPage: 1
};

export const EtatReducer = createReducer(
  initialState,
  on(fetchetatData, (state, { page }) => {
    return { ...state, loading: true, error: null, currentPage: page || state.currentPage };
  }),
  on(fetchetatSuccess, (state, { response }) => {
    return { 
      ...state, 
      etatdata: response.results, 
      totalItems: response.count,
      next: response.next,
      previous: response.previous,
      loading: false 
    };
  }),
  on(fetchetatFailure, (state, { error }) => {
    return { ...state, error, loading: false };
  }),
   
  on(addetatDataSuccess, (state, { newData }) => {
    return { ...state, error: null };
  }),
  on(updateetatDataSuccess, (state, { updatedData }) => {
    return { ...state, error: null };
  }),
   
  on(deleteetatSuccess, (state, { id }) => {
    return { ...state, error: null };
  }),
  
  on(deletemultipleetatSuccess, (state, { id }) => {
    return { ...state, error: null };
  }),

   on(fetchetatNoPaginateSuccess, (state, { response }) => {
          return {
            ...state,
            allEtats: response, // Mettre à jour les statut sans pagination
            loading: false
          };
        }),

);

// Selector
export function reducer(state: EtatState | undefined, action: Action) {
  return EtatReducer(state, action);
}