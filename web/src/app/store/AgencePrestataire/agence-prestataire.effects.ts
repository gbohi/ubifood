// src/app/store/AgencePrestataire/agence-prestataire.effects.ts

import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of, forkJoin } from 'rxjs';
import { catchError, map, mergeMap, switchMap } from 'rxjs/operators';
import { AgencePrestataireService } from 'src/app/core/services/agence-prestataire/agence-prestataire.service';
import * as AgencePrestataireActions from './agence-prestataire.action';

@Injectable()
export class AgencePrestataireEffects {

  // ✅ inject() au lieu du constructeur — évite l'erreur TS -992003
  private actions$               = inject(Actions);
  private agencePrestataireService = inject(AgencePrestataireService);

  // ── Charger les agences d'un prestataire ──────────────────
  fetch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AgencePrestataireActions.fetchAgencePrestataire),
      switchMap(({ prestataireId }) =>
        this.agencePrestataireService.getByPrestataire(prestataireId).pipe(
          map(agences => AgencePrestataireActions.fetchAgencePrestataireSuccess({ agences })),
          catchError(err => of(AgencePrestataireActions.fetchAgencePrestataireFailure({
            error: err?.error?.detail || 'Erreur lors du chargement des agences.'
          })))
        )
      )
    )
  );

  // ── Créer une liaison ─────────────────────────────────────
  create$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AgencePrestataireActions.createAgencePrestataire),
      mergeMap(({ data }) =>
        this.agencePrestataireService.create(data).pipe(
          map(agence => AgencePrestataireActions.createAgencePrestataireSuccess({ agence })),
          catchError(err => of(AgencePrestataireActions.createAgencePrestataireFailure({
            error: err?.error?.detail || 'Erreur lors de la création.'
          })))
        )
      )
    )
  );

  // ── Mettre à jour une liaison ─────────────────────────────
  update$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AgencePrestataireActions.updateAgencePrestataire),
      mergeMap(({ id, data }) =>
        this.agencePrestataireService.update(id, data).pipe(
          map(agence => AgencePrestataireActions.updateAgencePrestataireSuccess({ agence })),
          catchError(err => of(AgencePrestataireActions.updateAgencePrestataireFailure({
            error: err?.error?.detail || 'Erreur lors de la mise à jour.'
          })))
        )
      )
    )
  );

  // ── Supprimer une liaison ─────────────────────────────────
  delete$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AgencePrestataireActions.deleteAgencePrestataire),
      mergeMap(({ id }) =>
        this.agencePrestataireService.delete(id).pipe(
          map(() => AgencePrestataireActions.deleteAgencePrestataireSuccess({ id })),
          catchError(err => of(AgencePrestataireActions.deleteAgencePrestataireFailure({
            error: err?.error?.detail || 'Erreur lors de la suppression.'
          })))
        )
      )
    )
  );

  // ── Sauvegarder en batch (création prestataire) ───────────
  saveBatch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AgencePrestataireActions.saveAgencePrestatairesBatch),
      mergeMap(({ prestataireId, agences }) => {
        if (agences.length === 0) {
          return of(AgencePrestataireActions.saveAgencePrestatairesBatchSuccess({ prestataireId }));
        }

        const requests = agences.map(a =>
          this.agencePrestataireService.create({
            ...a,
            prestataire: prestataireId,
          })
        );

        return forkJoin(requests).pipe(
          map(() => AgencePrestataireActions.saveAgencePrestatairesBatchSuccess({ prestataireId })),
          catchError(err => of(AgencePrestataireActions.saveAgencePrestatairesBatchFailure({
            error: err?.error?.detail || 'Erreur lors de la sauvegarde des agences.'
          })))
        );
      })
    )
  );

  // Recharger après batch success
  saveBatchSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AgencePrestataireActions.saveAgencePrestatairesBatchSuccess),
      map(({ prestataireId }) =>
        AgencePrestataireActions.fetchAgencePrestataire({ prestataireId })
      )
    )
  );
}
