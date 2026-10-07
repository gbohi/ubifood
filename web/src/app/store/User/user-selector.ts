// src/app/store/User/user-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { UserState } from './user.reducer';

export const selectUserState = createFeatureSelector<UserState>('user');

export const selectuserData    = createSelector(selectUserState, s => s.userData);
export const selectLoading     = createSelector(selectUserState, s => s.loading);
export const selectTotalItems  = createSelector(selectUserState, s => s.totalItems);
export const selectCurrentPage = createSelector(selectUserState, s => s.currentPage);
export const selectNextPage    = createSelector(selectUserState, s => s.next);
export const selectPreviousPage = createSelector(selectUserState, s => s.previous);

// ✅ Liste complète sans pagination — utilisée dans les selects (besoin, etc.)
export const selectAlluserWithoutPagination = createSelector(
  selectUserState,
  s => s.allUsers
);
