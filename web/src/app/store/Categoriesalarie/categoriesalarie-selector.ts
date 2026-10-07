import { createFeatureSelector, createSelector } from '@ngrx/store';
import { CategoriesalarieState } from './categoriesalarie.reducer';

export const selectCategoriesalarieState = createFeatureSelector<CategoriesalarieState>('categoriesalarie');

export const selectcategoriesalarieData = createSelector(
    selectCategoriesalarieState,
    (state) => state.categoriesalarieData
);

export const selectLoading = createSelector(
    selectCategoriesalarieState,
    (state) => state.loading
);

export const selectTotalItems = createSelector(
    selectCategoriesalarieState,
    (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
    selectCategoriesalarieState,
    (state) => state.currentPage
);

export const selectNextPage = createSelector(
    selectCategoriesalarieState,
    (state) => state.next
);

export const selectPreviousPage = createSelector(
    selectCategoriesalarieState,
    (state) => state.previous
);

export const selectAllCategoriesalarieWithoutPagination = createSelector(
    selectCategoriesalarieState,
    (state) => state.allCategoriesalaries
  );