// src/app/store/Besoin/besoin.effects.ts

import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap, switchMap } from 'rxjs/operators';
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

// L'ErrorInterceptor transforme les erreurs HTTP en message texte (français)
const message = (error: any, defaut: string): string =>
  typeof error === 'string' && error ? error : defaut;

@Injectable()
export class BesoinEffects {

  // ── Fetch paginé ────────────────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchbesoinData),
      switchMap(({ page, search }) =>
        this.besoinService.getAllBesoins(page ?? 1, search).pipe(
          map((response) => fetchbesoinSuccess({ response })),
          catchError((error) =>
            of(fetchbesoinFailure({ error: message(error, 'Erreur lors du chargement des besoins') }))
          )
        )
      )
    )
  );

  // ── Statistiques globales ───────────────────────────────────
  fetchStatistiqueGlobale$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchstatistiquebesoinData),
      switchMap(() =>
        this.besoinService.getStatistiquesGlobales().pipe(
          map((response) => fetchstatistiquebesoinSuccess({ response })),
          catchError((error) =>
            of(fetchstatistiquebesoinFailure({ error: message(error, 'Erreur lors du chargement des statistiques') }))
          )
        )
      )
    )
  );

  // Statistiques à jour après chaque ajout / modification / suppression
  refreshStatistiques$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addbesoinDataSuccess, updatebesoinDataSuccess, deletebesoinSuccess, deletemultiplebesoinSuccess),
      map(() => fetchstatistiquebesoinData())
    )
  );

  // ── Ajouter ─────────────────────────────────────────────────
  // FormData : besoin + pièces jointes (POST /api/besoins/creer/)
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addbesoinData),
      mergeMap(({ newData }) =>
        (newData instanceof FormData
          ? this.besoinService.createBesoinWithDocuments(newData)
          : this.besoinService.createBesoin(newData)
        ).pipe(
          map((response) => addbesoinDataSuccess({ newData: response })),
          catchError((error) =>
            of(addbesoinDataFailure({ error: message(error, "Erreur lors de l'ajout du besoin") }))
          )
        )
      )
    )
  );

  // Recharger à la page 1 après ajout (recherche conservée)
  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addbesoinDataSuccess),
      map(() => fetchbesoinData({ page: 1, search: this.besoinService.getCurrentSearch() }))
    )
  );

  // ── Ajouter (« Signaler une anomalie » — FormData) ──────────
  addNoAuthData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addNoAuthbesoinData),
      mergeMap(({ newData }) =>
        this.besoinService.createNoAuthBesoin(newData as FormData).pipe(
          map((response) => addNoAuthbesoinDataSuccess({ newData: response })),
          catchError((error) =>
            of(addNoAuthbesoinDataFailure({ error: message(error, "Erreur lors de l'ajout du besoin") }))
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
          map((response) => updatebesoinDataSuccess({ updatedData: response ?? updatedData })),
          catchError((error) =>
            of(updatebesoinDataFailure({ error: message(error, 'Erreur lors de la mise à jour du besoin') }))
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
          map(({ currentPage }) => fetchbesoinData({
            page: currentPage, search: this.besoinService.getCurrentSearch(),
          }))
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
            of(deletebesoinFailure({ error: message(error, 'Erreur lors de la suppression du besoin') }))
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
            return fetchbesoinData({ page: targetPage, search: this.besoinService.getCurrentSearch() });
          }),
          catchError(() => of(fetchbesoinData({ page: 1, search: this.besoinService.getCurrentSearch() })))
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
          return of(deletemultiplebesoinFailure({ error: 'Aucun besoin sélectionné.' }));
        }

        const idArray = id
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultiplebesoinFailure({ error: 'Aucun besoin sélectionné.' }));
        }

        return this.besoinService.deleteMultipleBesoin(idArray).pipe(
          map(() => deletemultiplebesoinSuccess({ id })),
          catchError((error) =>
            of(deletemultiplebesoinFailure({ error: message(error, 'Erreur lors de la suppression des besoins') }))
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
            return fetchbesoinData({ page: targetPage, search: this.besoinService.getCurrentSearch() });
          }),
          catchError(() => of(fetchbesoinData({ page: 1, search: this.besoinService.getCurrentSearch() })))
        );
      })
    )
  );

  constructor(
    private actions$: Actions,
    private besoinService: BesoinService
  ) {}
}
