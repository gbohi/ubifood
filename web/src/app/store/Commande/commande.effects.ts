// src/app/store/Commande/commande.effects.ts

import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, map, mergeMap, of, switchMap } from 'rxjs';
import { CommandeService } from 'src/app/core/services/commande/commande.service';
import * as CommandeActions from './commande.action';

@Injectable()
export class CommandeEffects {

  constructor(
    private actions$: Actions,
    private commandeService: CommandeService,
  ) {}

  // ── Mes commandes ──────────────────────────────────────────
  fetchMesCommandes$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CommandeActions.fetchMesCommandes),
      switchMap(({ statut, date_gte }) =>
        this.commandeService.getMesCommandes({ statut, date_gte }).pipe(
          map(commandes => CommandeActions.fetchMesCommandesSuccess({ commandes })),
          catchError(err => of(CommandeActions.fetchMesCommandesFailure({
            error: err?.error?.detail || 'Erreur lors du chargement des commandes.'
          })))
        )
      )
    )
  );

  // ── Par menu (gestionnaire) ────────────────────────────────
  fetchCommandesParMenu$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CommandeActions.fetchCommandesParMenu),
      switchMap(({ menuId }) =>
        this.commandeService.getCommandesParMenu(menuId).pipe(
          map(grouped => CommandeActions.fetchCommandesParMenuSuccess({ grouped })),
          catchError(err => of(CommandeActions.fetchCommandesParMenuFailure({
            error: err?.error?.detail || 'Erreur lors du chargement.'
          })))
        )
      )
    )
  );

  // ── Par agence et période (admin) ──────────────────────────
  fetchCommandesParAgencePeriode$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CommandeActions.fetchCommandesParAgencePeriode),
      switchMap(({ date_debut, date_fin, agence, typeequipe, statut }) =>
        this.commandeService.getCommandesParAgencePeriode({
          date_debut, date_fin, agence, typeequipe, statut
        }).pipe(
          map(commandes => CommandeActions.fetchCommandesParAgencePeriodeSuccess({ commandes })),
          catchError(err => {
            const e = err?.error;
            const msg =
              e?.detail
              || (Array.isArray(e) ? e[0] : null)
              || (typeof e === 'string' ? e : null)
              || (Object.values(e ?? {}) as string[][])?.[0]?.[0]
              || 'Erreur lors du chargement des commandes.';
            return of(CommandeActions.fetchCommandesParAgencePeriodeFailure({ error: msg }));
          })
        )
      )
    )
  );

  // ── Recherche par badge (retrait) ──────────────────────────
  rechercheParBadge$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CommandeActions.rechercheParBadge),
      switchMap(({ badge, menuId }) =>
        this.commandeService.rechercheParBadge(badge, menuId).pipe(
          map(result => CommandeActions.rechercheParBadgeSuccess({ result })),
          catchError(err => {
            const e = err?.error;
            const msg =
              e?.detail
              || (Array.isArray(e) ? e[0] : null)
              || (typeof e === 'string' ? e : null)
              || (Object.values(e ?? {}) as string[][])?.[0]?.[0]
              || 'Agent introuvable ou aucune commande pour ce menu.';
            return of(CommandeActions.rechercheParBadgeFailure({ error: msg }));
          })
        )
      )
    )
  );

  // ── Liste admin ────────────────────────────────────────────
  fetchCommandes$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CommandeActions.fetchCommandes),
      switchMap(({ page, menu, statut, agence }) =>
        this.commandeService.getCommandes({ page, menu, statut, agence }).pipe(
          map(data => CommandeActions.fetchCommandesSuccess({ data })),
          catchError(err => of(CommandeActions.fetchCommandesFailure({
            error: err?.error?.detail || 'Erreur lors du chargement.'
          })))
        )
      )
    )
  );

  // ── Créer ──────────────────────────────────────────────────
  createCommande$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CommandeActions.createCommande),
      mergeMap(({ payload }) =>
        this.commandeService.createCommande(payload).pipe(
          map(commande => CommandeActions.createCommandeSuccess({ commande })),
          catchError(err => {
            const e = err?.error;
            const msg =
              e?.non_field_errors?.[0]
              || e?.detail
              || (Array.isArray(e) ? e[0] : null)
              || (typeof e === 'string' ? e : null)
              || (Object.values(e ?? {}) as string[][])?.[0]?.[0]
              || 'Erreur lors de la commande.';
            return of(CommandeActions.createCommandeFailure({ error: msg }));
          })
        )
      )
    )
  );

  // ── Annuler ────────────────────────────────────────────────
  annulerCommande$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CommandeActions.annulerCommande),
      mergeMap(({ id }) =>
        this.commandeService.annulerCommande(id).pipe(
          map(commande => CommandeActions.annulerCommandeSuccess({ commande })),
          catchError(err => {
            const e = err?.error;
            const msg =
              e?.non_field_errors?.[0]
              || e?.detail
              || (Array.isArray(e) ? e[0] : null)
              || (typeof e === 'string' ? e : null)
              || (Object.values(e ?? {}) as string[][])?.[0]?.[0]
              || "Impossible d'annuler cette commande.";
            return of(CommandeActions.annulerCommandeFailure({ error: msg }));
          })
        )
      )
    )
  );

  // ── Retrait ────────────────────────────────────────────────
  createRetrait$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CommandeActions.createRetrait),
      mergeMap(({ userId, menuId, badge_matricule }) =>
        this.commandeService.createRetrait({
          user_id: userId, menu_id: menuId, badge_matricule
        }).pipe(
          map(() => CommandeActions.createRetraitSuccess({ menuId, userId })),
          catchError(err => {
            const e = err?.error;
            const msg =
              e?.non_field_errors?.[0]
              || e?.detail
              || (Array.isArray(e) ? e[0] : null)
              || (typeof e === 'string' ? e : null)
              || (Object.values(e ?? {}) as string[][])?.[0]?.[0]
              || "Erreur lors de l'enregistrement du retrait.";
            return of(CommandeActions.createRetraitFailure({ error: msg }));
          })
        )
      )
    )
  );
}
