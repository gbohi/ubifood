import { Action, createReducer, on } from '@ngrx/store';
import { 
  addentretienvehiculeDataSuccess, 
  deleteentretienvehiculeSuccess,
  deletemultipleentretienvehiculeSuccess,
  fetchentretienvehiculeData, 
  fetchentretienvehiculeFailure, 
  fetchentretienvehiculeSuccess, 
  updateentretienvehiculeDataSuccess,
  fetchentretienvehiculeNoPaginateSuccess
} from './entretienvehicule.action';
import { EntretienVehiculelistModel } from './entretienvehicule.model';

export interface EntretienvehiculeState {
  entretienvehiculeData: EntretienVehiculelistModel[];
  allEntretienvehicules: EntretienVehiculelistModel[];  
  totalItems: number;
  next: string | null;
  previous: string | null;
  loading: boolean;
  error: any;
  currentPage: number;
}

export const initialState: EntretienvehiculeState = {
  entretienvehiculeData: [],
  allEntretienvehicules: [],  
  totalItems: 0,
  next: null,
  previous: null,
  loading: false,
  error: null,
  currentPage: 1
};

export const EntretienvehiculeReducer = createReducer(
  initialState,
  on(fetchentretienvehiculeData, (state, { page }) => {
    return { ...state, loading: true, error: null, currentPage: page || state.currentPage };
  }),
  on(fetchentretienvehiculeSuccess, (state, { response }) => {
    return { 
      ...state, 
      entretienvehiculeData: response.results, 
      totalItems: response.count,
      next: response.next,
      previous: response.previous,
      loading: false 
    };
  }),
  on(fetchentretienvehiculeFailure, (state, { error }) => {
    return { ...state, error, loading: false };
  }),
   
  on(addentretienvehiculeDataSuccess, (state, { newData }) => {
    return { ...state, error: null };
  }),
  on(updateentretienvehiculeDataSuccess, (state, { updatedData }) => {
    return { ...state, error: null };
  }),
   
  on(deleteentretienvehiculeSuccess, (state, { id }) => {
    return { ...state, error: null };
  }),
  
  on(deletemultipleentretienvehiculeSuccess, (state, { id }) => {
    return { ...state, error: null };
  }),

  on(fetchentretienvehiculeNoPaginateSuccess, (state, { response }) => {
      return {
        ...state,
        allentretienvehicules: response, // Mettre à jour les Entretienvehicule sans pagination
        loading: false
      };
    }),
);

// Selector
export function reducer(state: EntretienvehiculeState | undefined, action: Action) {
  return EntretienvehiculeReducer(state, action);
}