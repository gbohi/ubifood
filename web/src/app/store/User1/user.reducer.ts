import { Action, createReducer, on } from '@ngrx/store';
import { 
  adduserDataSuccess, 
  deleteuserSuccess,
  deletemultipleuserSuccess,
  fetchuserData, 
  fetchuserFailure, 
  fetchuserSuccess, 
  updateuserDataSuccess 
} from './user.action';
import { UserlistModel } from './user.model';

export interface UserState {
  userdata: UserlistModel[];
  totalItems: number;
  next: string | null;
  previous: string | null;
  loading: boolean;
  error: any;
  currentPage: number;
}

export const initialState: UserState = {
  userdata: [],
  totalItems: 0,
  next: null,
  previous: null,
  loading: false,
  error: null,
  currentPage: 1
};

export const UserReducer = createReducer(
  initialState,
  on(fetchuserData, (state, { page }) => {
    return { ...state, loading: true, error: null, currentPage: page || state.currentPage };
  }),
  on(fetchuserSuccess, (state, { response }) => {
    return { 
      ...state, 
      userdata: response.results, 
      totalItems: response.count,
      next: response.next,
      previous: response.previous,
      loading: false 
    };
  }),
  on(fetchuserFailure, (state, { error }) => {
    return { ...state, error, loading: false };
  }),
   
  on(adduserDataSuccess, (state, { newData }) => {
    return { ...state, error: null };
  }),
  on(updateuserDataSuccess, (state, { updatedData }) => {
    return { ...state, error: null };
  }),
   
  on(deleteuserSuccess, (state, { id }) => {
    return { ...state, error: null };
  }),
  
  on(deletemultipleuserSuccess, (state, { id }) => {
    return { ...state, error: null };
  }),
);

// Selector
export function reducer(state: UserState | undefined, action: Action) {
  return UserReducer(state, action);
}