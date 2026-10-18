import { Action, createReducer, on } from '@ngrx/store';
import { 
  addroleDataSuccess, 
  deleteroleSuccess,
  deletemultipleroleSuccess,
  fetchroleData, 
  fetchroleFailure, 
  fetchroleSuccess, 
  updateroleDataSuccess,
  addroleDataFailure,
  updateroleDataFailure,
  deleteroleFailure,
  deletemultipleroleFailure,
} from './role.action';
import { RolelistModel } from './role.model';

export interface RoleState {
  roledata: RolelistModel[];
  totalItems: number;
  next: string | null;
  previous: string | null;
  loading: boolean;
  error: any;
  currentPage: number;
}

export const initialState: RoleState = {
  roledata: [],
  totalItems: 0,
  next: null,
  previous: null,
  loading: false,
  error: null,
  currentPage: 1
};

export const RoleReducer = createReducer(
  initialState,
  on(fetchroleData, (state, { page }) => {
    return { ...state, loading: true, error: null, currentPage: page || state.currentPage };
  }),
  on(fetchroleSuccess, (state, { response }) => {
    return { 
      ...state, 
      roledata: response.results, 
      totalItems: response.count,
      next: response.next,
      previous: response.previous,
      loading: false 
    };
  }),
  on(fetchroleFailure, (state, { error }) => {
    return { ...state, error, loading: false };
  }),
   
  on(addroleDataSuccess, (state, { newData }) => {
    return { ...state, error: null };
  }),
  on(updateroleDataSuccess, (state, { updatedData }) => {
    return { ...state, error: null };
  }),
   
  on(deleteroleSuccess, (state, { id }) => {
    return { ...state, error: null };
  }),
  
  on(deletemultipleroleSuccess, (state, { id }) => {
    return { ...state, error: null };
  }),
  // Échecs des opérations : on garde l'état, on mémorise le message serveur
  on(addroleDataFailure, updateroleDataFailure, deleteroleFailure, deletemultipleroleFailure, (state, { error }) => ({ ...state, error })),
);

// Selector
export function reducer(state: RoleState | undefined, action: Action) {
  return RoleReducer(state, action);
}