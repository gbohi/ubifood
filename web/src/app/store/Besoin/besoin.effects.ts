// src/app/store/Besoin/besoin.effects.ts

import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { BesoinService } from 'src/app/core/services/besoin/besoin.service';
import {
  addbesoinData,
  addbesoinDataFailure,
  addbesoinDataSuccess,
  addNoAuthbesoinData,
  addNoAuthbesoinDataFailure,
  addNoAuthbesoinDataSuccess,
  deletebesoinData,
  deletebesoinFailure,
  deletebesoinSuccess,
  deletemultiplebesoinData,
  deletemultiplebesoinFailure,
  deletemultiplebesoinSuccess,
  fetchbesoinData,
  fetchbesoinFailure,
  fetchbesoinSuccess,
  updatebesoinData,
  updatebesoinDataFailure,
  updatebesoinDataSuccess,
  fetchstatistiquebesoinData,
  fetchstatistiquebesoinSuccess,
  fetchstatistiquebesoinFailure,
} from './besoin.action';

@Injectable()
export class BesoinEffects {

  // ── Fetch paginé ────────────────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchbesoinData),
      mergeMap(({ page }) =>
        this.besoinService.getAllBesoins(page ?? 1).pipe(
          map((response) => fetchbesoinSuccess({ response })),
          catchError((error) =>
            of(fetchbesoinFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Statistiques globales ───────────────────────────────────
  fetchStatistiqueGlobale$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchstatistiquebesoinData),
      mergeMap(() =>
        this.besoinService.getStatistiquesGlobales().pipe(
          map((response) => fetchstatistiquebesoinSuccess({ response })),
          catchError((error) =>
            of(fetchstatistiquebesoinFailure({ error: error.message ?? error.toString() }))
          )
        )
      )
    )
  );

  // ── Ajouter (authentifié) ───────────────────────────────────
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addbesoinData),
      mergeMap(({ newData }) =>
        this.besoinService.createBesoin(newData).pipe(
          map((response) => addbesoinDataSuccess({ newData: response })),
          catchError((error) =>
            of(addbesoinDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger à la page 1 après ajout
  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addbesoinDataSuccess),
      map(() => fetchbesoinData({ page: 1 }))
    )
  );

  // ── Ajouter (sans authentification — FormData) ──────────────
  addNoAuthData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addNoAuthbesoinData),
      mergeMap(({ newData }) =>
        this.besoinService.createNoAuthBesoin(newData as FormData).pipe(
          map((response) => addNoAuthbesoinDataSuccess({ newData: response })),
          catchError((error) =>
            of(addNoAuthbesoinDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // ── Modifier ────────────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatebesoinData),
      mergeMap(({ updatedData }) =>
        this.besoinService.updateBesoin(updatedData).pipe(
          map(() => updatebesoinDataSuccess({ updatedData })),
          catchError((error) =>
            of(updatebesoinDataFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recharger la page courante après modification
  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatebesoinDataSuccess),
      mergeMap(() =>
        this.besoinService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchbesoinData({ page: currentPage }))
        )
      )
    )
  );

  // ── Supprimer (unitaire) ────────────────────────────────────
  deleteData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletebesoinData),
      mergeMap(({ id }) =>
        this.besoinService.deleteBesoin(id).pipe(
          map(() => deletebesoinSuccess({ id })),
          catchError((error) =>
            of(deletebesoinFailure({ error: error.toString() }))
          )
        )
      )
    )
  );

  // Recalculer la page après suppression unitaire
  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletebesoinSuccess),
      mergeMap(() =>
        this.besoinService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchbesoinData({ page: targetPage });
          }),
          catchError(() => of(fetchbesoinData({ page: 1 })))
        )
      )
    )
  );

  // ── Supprimer (multiple) ────────────────────────────────────
  deleteMultipleData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultiplebesoinData),
      mergeMap(({ id }) => {
        if (!id || id.trim() === '') {
          return of(deletemultiplebesoinFailure({ error: 'Aucun ID valide' }));
        }

        const idArray = id
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultiplebesoinFailure({
            error: 'Aucun ID valide après conversion',
          }));
        }

        return this.besoinService.deleteMultipleBesoin(idArray).pipe(
          map(() => deletemultiplebesoinSuccess({ id })),
          catchError((error) =>
            of(deletemultiplebesoinFailure({ error: error.toString() }))
          )
        );
      })
    )
  );

  // Recalculer la page après suppression multiple
  deleteMultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultiplebesoinSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id.split(',').filter((s) => s.trim() !== '').length;

        return this.besoinService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchbesoinData({ page: targetPage });
          }),
          catchError(() => of(fetchbesoinData({ page: 1 })))
        );
      })
    )
  );

  constructor(
    private actions$: Actions,
    private besoinService: BesoinService  // ✅ CrudService supprimé
  ) {}
}
