// src/app/store/Plat/plat-selector.ts
import { createFeatureSelector, createSelector } from '@ngrx/store';
import { PlatState } from './plat.reducer';

export const selectPlatState = createFeatureSelector<PlatState>('plat');

export const selectplatData = createSelector(
  selectPlatState,
  (state) => state.platdata
);

export const selectLoading = createSelector(
  selectPlatState,
  (state) => state.loading
);

export const selectTotalItems = createSelector(
  selectPlatState,
  (state) => state.totalItems
);

export const selectCurrentPage = createSelector(
  selectPlatState,
  (state) => state.currentPage
);

export const selectNextPage = createSelector(
  selectPlatState,
  (state) => state.next
);

export const selectPreviousPage = createSelector(
  selectPlatState,
  (state) => state.previous
);

export const selectStatistiqueGlobale = createSelector(
  selectPlatState,
  (state) => state.statistiqueGlobale
);

export const selectStatistiqueLoading = createSelector(
  selectPlatState,
  (state) => state.loadingStat
);

// ── Feedback UI ──────────────────────────────────────────────
// Utilisés dans le composant à la place de actions$.pipe(ofType(...))
// Le composant s'abonne à ces selectors pour afficher les toasts.

export const selectSuccessMessage = createSelector(
  selectPlatState,
  (state) => state.successMessage
);

export const selectErrorMessage = createSelector(
  selectPlatState,
  (state) => state.errorMessage
);
