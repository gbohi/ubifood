import { Action, createReducer, on } from '@ngrx/store';
import { 
  addcategoriesalarieDataSuccess, 
  deletecategoriesalarieSuccess,
  deletemultiplecategoriesalarieSuccess,
  fetchcategoriesalarieData, 
  fetchcategoriesalarieFailure, 
  fetchcategoriesalarieSuccess, 
  updatecategoriesalarieDataSuccess,
  fetchcategoriesalarieNoPaginateSuccess
} from './categoriesalarie.action';
import { CategoriesalarielistModel } from './categoriesalarie.model';

export interface CategoriesalarieState {
  categoriesalarieData: CategoriesalarielistModel[];
  allCategoriesalaries: CategoriesalarielistModel[]; 
  totalItems: number;
  next: string | null;
  previous: string | null;
  loading: boolean;
  error: any;
  currentPage: number;
}

export const initialState: CategoriesalarieState = {
  categoriesalarieData: [],
  allCategoriesalaries: [],
  totalItems: 0,
  next: null,
  previous: null,
  loading: false,
  error: null,
  currentPage: 1
};

export const CategoriesalarieReducer = createReducer(
  initialState,
  on(fetchcategoriesalarieData, (state, { page }) => {
    return { ...state, loading: true, error: null, currentPage: page || state.currentPage };
  }),
  on(fetchcategoriesalarieSuccess, (state, { response }) => {
    return { 
      ...state, 
      categoriesalarieData: response.results, 
      totalItems: response.count,
      next: response.next,
      previous: response.previous,
      loading: false 
    };
  }),
  on(fetchcategoriesalarieFailure, (state, { error }) => {
    return { ...state, error, loading: false };
  }),
   
  on(addcategoriesalarieDataSuccess, (state, { newData }) => {
    return { ...state, error: null };
  }),
  on(updatecategoriesalarieDataSuccess, (state, { updatedData }) => {
    return { ...state, error: null };
  }),
   
  on(deletecategoriesalarieSuccess, (state, { id }) => {
    return { ...state, error: null };
  }),
  
  on(deletemultiplecategoriesalarieSuccess, (state, { id }) => {
    return { ...state, error: null };
  }),

  on(fetchcategoriesalarieNoPaginateSuccess, (state, { response }) => {
        return {
          ...state,
          allCategoriesalaries: response, // Mettre à jour les priorités sans pagination
          loading: false
        };
      }),
);

// Selector
export function reducer(state: CategoriesalarieState | undefined, action: Action) {
  return CategoriesalarieReducer(state, action);
}