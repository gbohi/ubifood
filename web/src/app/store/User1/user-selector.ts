import { createFeatureSelector, createSelector } from '@ngrx/store';
import { UserState } from './user.reducer';

export const selectUserState = createFeatureSelector<UserState>('user');

export const selectuserData = createSelector(
    selectUserState,
    (state) => state.userdata
);

export const selectLoading = createSelector(
    selectUserState,
    (state) => state.loading
);

export const selectTotalItems = createSelector(
    selectUserState,
    (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
    selectUserState,
    (state) => state.currentPage
);

export const selectNextPage = createSelector(
    selectUserState,
    (state) => state.next
);

export const selectPreviousPage = createSelector(
    selectUserState,
    (state) => state.previous
);