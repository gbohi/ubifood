// src/app/store/Commande/commande-selector.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { CommandeState } from './commande.reducer';

export const selectCommandeState = createFeatureSelector<CommandeState>('commande');

export const selectMesCommandes                = createSelector(selectCommandeState, s => s?.mesCommandes              ?? []);
export const selectCommandesParMenu            = createSelector(selectCommandeState, s => s?.commandesParMenu          ?? []);
export const selectCommandesParAgencePeriode   = createSelector(selectCommandeState, s => s?.commandesParAgencePeriode ?? []);
export const selectAllCommandes                = createSelector(selectCommandeState, s => s?.allCommandes              ?? []);
export const selectCommandeTotalCount          = createSelector(selectCommandeState, s => s?.totalCount                ?? 0);
export const selectCommandeIsLoading           = createSelector(selectCommandeState, s => s?.isLoading                 ?? false);
export const selectCommandeIsSubmitting        = createSelector(selectCommandeState, s => s?.isSubmitting              ?? false);
export const selectCommandeError               = createSelector(selectCommandeState, s => s?.error                     ?? null);
export const selectCommandeSuccess             = createSelector(selectCommandeState, s => s?.successMessage            ?? null);

// ── Recherche par badge (retrait) ─────────────────────────────
export const selectRechercheParBadge   = createSelector(selectCommandeState, s => s?.rechercheParBadge ?? null);
export const selectIsSearchingBadge    = createSelector(selectCommandeState, s => s?.isSearchingBadge  ?? false);
export const selectBadgeError          = createSelector(selectCommandeState, s => s?.badgeError         ?? null);

/** Commandes en attente uniquement (agent) */
export const selectMesCommandesEnAttente = createSelector(
  selectMesCommandes,
  cmds => cmds.filter(c => c.statut === 'en_attente')
);

/** IDs des plats déjà commandés pour un menu donné */
export const selectPlatsCommandesPourMenu = (menuId: number) => createSelector(
  selectMesCommandes,
  cmds => cmds
    .filter(c => c.menu_detail?.id === menuId && c.statut === 'en_attente')
    .map(c => c.plat_detail?.id)
    .filter(Boolean)
);

/** Vérifie si un plat a déjà été commandé pour un menu */
export const selectPlatDejaCommande = (menuId: number, platId: number) => createSelector(
  selectMesCommandes,
  cmds => cmds.some(
    c => c.menu_detail?.id === menuId &&
         c.plat_detail?.id === platId &&
         c.statut === 'en_attente'
  )
);
