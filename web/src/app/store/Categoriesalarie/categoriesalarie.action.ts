import { createAction, props } from '@ngrx/store';
import { CategoriesalarielistModel, ApiResponse } from './categoriesalarie.model';

// fetch categoriesalarie data
export const fetchcategoriesalarieData = createAction(
    '[Data] Fetch categoriesalarie Table Data',
    props<{ page?: number }>()
);

export const fetchcategoriesalarieSuccess = createAction(
  '[Data] Fetch categoriesalarie Data Success',
  props<{ response: ApiResponse<CategoriesalarielistModel> }>()
);

export const fetchcategoriesalarieFailure = createAction(
  '[Data] Fetch categoriesalarie Data Failure',
  props<{ error: string }>()
);

// Add Data
export const addcategoriesalarieData = createAction(
  '[Data] Add CategoriesalarieData',
  props<{ newData: CategoriesalarielistModel }>()
);

export const addcategoriesalarieDataSuccess = createAction(
  '[Data] Add CategoriesalarieData Success',
  props<{ newData: CategoriesalarielistModel }>()
);

export const addcategoriesalarieDataFailure = createAction(
  '[Data] Add CategoriesalarieData Failure',
  props<{ error: string }>()
);

// Update Data
export const updatecategoriesalarieData = createAction(
  '[Data] Update CategoriesalarieData',
  props<{ updatedData: CategoriesalarielistModel }>()
);

export const updatecategoriesalarieDataSuccess = createAction(
  '[Data] Update CategoriesalarieData Success',
  props<{ updatedData: CategoriesalarielistModel }>()
);

export const updatecategoriesalarieDataFailure = createAction(
  '[Data] Update CategoriesalarieData Failure',
  props<{ error: string }>()
);

// Delete Data (Single)
export const deletecategoriesalarieData = createAction(
  '[Data] Delete CategoriesalarieData',
  props<{ id: string }>()
);

export const deletecategoriesalarieSuccess = createAction(
  '[Data] Delete CategoriesalarieData Success',
  props<{ id: string }>()
);

export const deletecategoriesalarieFailure = createAction(
  '[Data] Delete CategoriesalarieData Failure',
  props<{ error: string }>()
);

// Delete Multiple
export const deletemultiplecategoriesalarieData = createAction(
  '[Data] Delete Multiple CategoriesalarieData',
  props<{ id: string }>()
);

export const deletemultiplecategoriesalarieSuccess = createAction(
  '[Data] Delete Multiple CategoriesalarieData Success',
  props<{ id: string }>()
);

export const deletemultiplecategoriesalarieFailure = createAction(
  '[Data] Delete Multiple CategoriesalarieData Failure',
  props<{ error: string }>()
);

export const fetchcategoriesalarieNoPaginateData = createAction(
  '[Categoriesalarie] Fetch Categoriesalarie No Pagination'
);

export const fetchcategoriesalarieNoPaginateSuccess = createAction(
  '[Categoriesalarie API] Fetch All Categoriesalarie Success',
  props<{ response: CategoriesalarielistModel[] }>() // ✅ tableau directement
);


export const fetchcategoriesalarieNoPaginateFailure = createAction(
  '[Categoriesalarie] Fetch Categoriesalarie No Pagination Failure',
  props<{ error: string }>()
);