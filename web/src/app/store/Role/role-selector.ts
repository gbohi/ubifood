import { createFeatureSelector, createSelector } from '@ngrx/store';
import { RoleState } from './role.reducer';

export const selectRoleState = createFeatureSelector<RoleState>('role');

export const selectroleData = createSelector(
    selectRoleState,
    (state) => state.roledata
);

export const selectLoading = createSelector(
    selectRoleState,
    (state) => state.loading
);

export const selectTotalItems = createSelector(
    selectRoleState,
    (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
    selectRoleState,
    (state) => state.currentPage
);

export const selectNextPage = createSelector(
    selectRoleState,
    (state) => state.next
);

export const selectPreviousPage = createSelector(
    selectRoleState,
    (state) => state.previous
);