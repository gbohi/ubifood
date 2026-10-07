// src/app/store/PlatCategoriesalarie/plat-categoriesalarie-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { PlatCategoriesalarieState } from './plat-categoriesalarie.reducer';

export const selectPlatCategoriesalarieState =
  createFeatureSelector<PlatCategoriesalarieState>('platCategoriesalarie');

export const selectPlatCategoriesalarieTarifs = createSelector(
  selectPlatCategoriesalarieState,
  s => s?.tarifs ?? []
);

export const selectPlatCategoriesalarieIsLoading = createSelector(
  selectPlatCategoriesalarieState,
  s => s?.isLoading ?? false
);

export const selectPlatCategoriesalarieIsSubmitting = createSelector(
  selectPlatCategoriesalarieState,
  s => s?.isSubmitting ?? false
);

export const selectPlatCategoriesalarieError = createSelector(
  selectPlatCategoriesalarieState,
  s => s?.error ?? null
);

export const selectPlatCategoriesalarieSuccess = createSelector(
  selectPlatCategoriesalarieState,
  s => s?.successMessage ?? null
);
