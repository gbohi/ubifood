// src/app/store/Poste/poste-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { PosteState } from './poste.reducer';

export const selectPosteState = createFeatureSelector<PosteState>('poste');

export const selectposteData = createSelector(
  selectPosteState,
  s => s.posteData
);

export const selectLoading = createSelector(
  selectPosteState,
  s => s.loading
);

export const selectTotalItems = createSelector(
  selectPosteState,
  s => s.totalItems
);

export const selectCurrentPage = createSelector(
  selectPosteState,
  s => s.currentPage
);

export const selectAllPosteWithoutPagination = createSelector(
  selectPosteState,
  s => s.allPostes
);
