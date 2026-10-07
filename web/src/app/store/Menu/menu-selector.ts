// src/app/store/Menu/menu-selector.ts
import { createFeatureSelector, createSelector } from '@ngrx/store';
import { MenuState } from './menu.reducer';

export const selectMenuState = createFeatureSelector<MenuState>('menu');

export const selectmenuData = createSelector(
  selectMenuState,
  (state) => state.menuData
);

export const selectLoading = createSelector(
  selectMenuState,
  (state) => state.loading
);

export const selectTotalItems = createSelector(
  selectMenuState,
  (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
  selectMenuState,
  (state) => state.currentPage
);

export const selectNextPage = createSelector(
  selectMenuState,
  (state) => state.next
);

export const selectPreviousPage = createSelector(
  selectMenuState,
  (state) => state.previous
);

export const selectAllMenuWithoutPagination = createSelector(
  selectMenuState,
  (state) => state.allMenus
);

// ── Feedback UI ──────────────────────────────────────────────
// Même pattern que les selectors Plat.
// Le composant s'abonne à ces valeurs pour afficher les toasts,
// sans écouter les actions directement (anti-pattern évité).

export const selectSuccessMessage = createSelector(
  selectMenuState,
  (state) => state.successMessage
);

export const selectErrorMessage = createSelector(
  selectMenuState,
  (state) => state.errorMessage
);
