import { Action, createReducer, on } from '@ngrx/store';
import { 
  addfonctionDataSuccess, 
  deletefonctionSuccess,
  deletemultiplefonctionSuccess,
  fetchfonctionData, 
  fetchfonctionFailure, 
  fetchfonctionSuccess, 
  updatefonctionDataSuccess,
  fetchfonctionNoPaginateSuccess
} from './fonction.action';
import { FonctionlistModel } from './fonction.model';

export interface FonctionState {
  fonctionData: FonctionlistModel[];
  allFonctions: FonctionlistModel[]; 
  totalItems: number;
  next: string | null;
  previous: string | null;
  loading: boolean;
  error: any;
  currentPage: number;
}

export const initialState: FonctionState = {
  fonctionData: [],
  allFonctions: [],
  totalItems: 0,
  next: null,
  previous: null,
  loading: false,
  error: null,
  currentPage: 1
};

export const FonctionReducer = createReducer(
  initialState,
  on(fetchfonctionData, (state, { page }) => {
    return { ...state, loading: true, error: null, currentPage: page || state.currentPage };
  }),
  on(fetchfonctionSuccess, (state, { response }) => {
    return { 
      ...state, 
      fonctionData: response.results, 
      totalItems: response.count,
      next: response.next,
      previous: response.previous,
      loading: false 
    };
  }),
  on(fetchfonctionFailure, (state, { error }) => {
    return { ...state, error, loading: false };
  }),
   
  on(addfonctionDataSuccess, (state, { newData }) => {
    return { ...state, error: null };
  }),
  on(updatefonctionDataSuccess, (state, { updatedData }) => {
    return { ...state, error: null };
  }),
   
  on(deletefonctionSuccess, (state, { id }) => {
    return { ...state, error: null };
  }),
  
  on(deletemultiplefonctionSuccess, (state, { id }) => {
    return { ...state, error: null };
  }),

  on(fetchfonctionNoPaginateSuccess, (state, { response }) => {
        return {
          ...state,
          allFonctions: response, // Mettre à jour les priorités sans pagination
          loading: false
        };
      }),
);

// Selector
export function reducer(state: FonctionState | undefined, action: Action) {
  return FonctionReducer(state, action);
}