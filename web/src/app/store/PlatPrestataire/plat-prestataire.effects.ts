// src/app/store/PlatPrestataire/plat-prestataire.effects.ts

import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of, forkJoin } from 'rxjs';
import { catchError, map, mergeMap, switchMap } from 'rxjs/operators';
import { PlatPrestataireService } from 'src/app/core/services/plat-prestataire/plat-prestataire.service';
import * as PlatPrestataireActions from './plat-prestataire.action';

@Injectable()
export class PlatPrestataireEffects {

  // ✅ inject() au lieu du constructeur — évite l'erreur TS -992003
  private actions$               = inject(Actions);
  private platPrestataireService = inject(PlatPrestataireService);

  // ── Charger les tarifs d'un prestataire ───────────────────
  fetch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(PlatPrestataireActions.fetchPlatPrestataire),
      switchMap(({ prestataireId }) =>
        this.platPrestataireService.getByPrestataire(prestataireId).pipe(
          map(tarifs => PlatPrestataireActions.fetchPlatPrestataireSuccess({ tarifs })),
          catchError(err => of(PlatPrestataireActions.fetchPlatPrestataireFailure({
            error: err?.error?.detail || 'Erreur lors du chargement des tarifs.'
          })))
        )
      )
    )
  );

  // ── Créer un tarif ────────────────────────────────────────
  create$ = createEffect(() =>
    this.actions$.pipe(
      ofType(PlatPrestataireActions.createPlatPrestataire),
      mergeMap(({ data }) =>
        this.platPrestataireService.create(data).pipe(
          map(tarif => PlatPrestataireActions.createPlatPrestataireSuccess({ tarif })),
          catchError(err => of(PlatPrestataireActions.createPlatPrestataireFailure({
            error: err?.error?.detail || 'Erreur lors de la création du tarif.'
          })))
        )
      )
    )
  );

  // ── Mettre à jour un tarif ────────────────────────────────
  update$ = createEffect(() =>
    this.actions$.pipe(
      ofType(PlatPrestataireActions.updatePlatPrestataire),
      mergeMap(({ id, data }) =>
        this.platPrestataireService.update(id, data).pipe(
          map(tarif => PlatPrestataireActions.updatePlatPrestataireSuccess({ tarif })),
          catchError(err => of(PlatPrestataireActions.updatePlatPrestataireFailure({
            error: err?.error?.detail || 'Erreur lors de la mise à jour du tarif.'
          })))
        )
      )
    )
  );

  // ── Supprimer un tarif ────────────────────────────────────
  delete$ = createEffect(() =>
    this.actions$.pipe(
      ofType(PlatPrestataireActions.deletePlatPrestataire),
      mergeMap(({ id }) =>
        this.platPrestataireService.delete(id).pipe(
          map(() => PlatPrestataireActions.deletePlatPrestataireSuccess({ id })),
          catchError(err => of(PlatPrestataireActions.deletePlatPrestataireFailure({
            error: err?.error?.detail || 'Erreur lors de la suppression du tarif.'
          })))
        )
      )
    )
  );

  // ── Sauvegarder en batch (création prestataire) ───────────
  saveBatch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(PlatPrestataireActions.savePlatPrestatairesBatch),
      mergeMap(({ prestataireId, tarifs }) => {
        if (tarifs.length === 0) {
          return of(PlatPrestataireActions.savePlatPrestatairesBatchSuccess({ prestataireId }));
        }

        const requests = tarifs.map(t =>
          this.platPrestataireService.create({
            ...t,
            prestataire: prestataireId,
          })
        );

        return forkJoin(requests).pipe(
          map(() => PlatPrestataireActions.savePlatPrestatairesBatchSuccess({ prestataireId })),
          catchError(err => of(PlatPrestataireActions.savePlatPrestatairesBatchFailure({
            error: err?.error?.detail || 'Erreur lors de la sauvegarde des tarifs.'
          })))
        );
      })
    )
  );

  // Recharger les tarifs après batch success
  saveBatchSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(PlatPrestataireActions.savePlatPrestatairesBatchSuccess),
      map(({ prestataireId }) =>
        PlatPrestataireActions.fetchPlatPrestataire({ prestataireId })
      )
    )
  );
}
