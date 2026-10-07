import { Action, createReducer, on } from '@ngrx/store';
import { 
  addprestataireDataSuccess, 
  deleteprestataireSuccess,
  deletemultipleprestataireSuccess,
  fetchprestataireData, 
  fetchprestataireFailure, 
  fetchprestataireSuccess, 
  updateprestataireDataSuccess,
  fetchprestataireNoPaginateSuccess
} from './prestataire.action';
import { PrestatairelistModel } from './prestataire.model';

export interface PrestataireState {
  prestataireData: PrestatairelistModel[];
  allPrestataires: PrestatairelistModel[]; 
  totalItems: number;
  next: string | null;
  previous: string | null;
  loading: boolean;
  error: any;
  currentPage: number;
}

export const initialState: PrestataireState = {
  prestataireData: [],
  allPrestataires: [],
  totalItems: 0,
  next: null,
  previous: null,
  loading: false,
  error: null,
  currentPage: 1
};

export const PrestataireReducer = createReducer(
  initialState,
  on(fetchprestataireData, (state, { page }) => {
    return { ...state, loading: true, error: null, currentPage: page || state.currentPage };
  }),
  on(fetchprestataireSuccess, (state, { response }) => {
    return { 
      ...state, 
      prestataireData: response.results, 
      totalItems: response.count,
      next: response.next,
      previous: response.previous,
      loading: false 
    };
  }),
  on(fetchprestataireFailure, (state, { error }) => {
    return { ...state, error, loading: false };
  }),
   
  on(addprestataireDataSuccess, (state, { newData }) => {
    return { ...state, error: null };
  }),
  on(updateprestataireDataSuccess, (state, { updatedData }) => {
    return { ...state, error: null };
  }),
   
  on(deleteprestataireSuccess, (state, { id }) => {
    return { ...state, error: null };
  }),
  
  on(deletemultipleprestataireSuccess, (state, { id }) => {
    return { ...state, error: null };
  }),

  on(fetchprestataireNoPaginateSuccess, (state, { response }) => {
        return {
          ...state,
          allPrestataires: response, // Mettre à jour les priorités sans pagination
          loading: false
        };
      }),
);

// Selector
export function reducer(state: PrestataireState | undefined, action: Action) {
  return PrestataireReducer(state, action);
}