// src/app/store/Plat/plat.effects.ts
import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap, switchMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { PlatService } from 'src/app/core/services/plat/plat.service';
import {
  fetchplatData,
  fetchplatSuccess,
  fetchplatFailure,
  fetchstatistiqueplatData,
  fetchstatistiqueplatSuccess,
  fetchstatistiqueplatFailure,
  createPlatWithFiles,
  createPlatWithFilesSuccess,
  createPlatWithFilesFailure,
  updatePlatWithFiles,
  updatePlatWithFilesSuccess,
  updatePlatWithFilesFailure,
  deleteplatData,
  deleteplatSuccess,
  deleteplatFailure,
  deletemultipleplatData,
  deletemultipleplatSuccess,
  deletemultipleplatFailure,
} from './plat.action';

@Injectable()
export class PlatEffects {

  // ── FETCH ────────────────────────────────────────────────────

  fetchList$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchplatData),
      // switchMap annule la requête précédente si une nouvelle arrive
      // (ex: l'utilisateur clique rapidement sur plusieurs pages)
      switchMap(({ page }) =>
        this.platService.getAllPlats(page ?? 1).pipe(
          map((response) => fetchplatSuccess({ response })),
          catchError((error) =>
            of(fetchplatFailure({ error: error?.message ?? error.toString() }))
          )
        )
      )
    )
  );

  // ── STATISTIQUES ─────────────────────────────────────────────
/*
  fetchStatistiques$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchstatistiqueplatData),
      switchMap(() =>
        this.platService.getStatistiquesGlobales().pipe(
          map((response) => fetchstatistiqueplatSuccess({ response })),
          catchError((error) =>
            of(fetchstatistiqueplatFailure({ error: error?.message ?? error.toString() }))
          )
        )
      )
    )
  );*/

  // ── CRÉATION avec fichiers ────────────────────────────────────

  createWithFiles$ = createEffect(() =>
    this.actions$.pipe(
      ofType(createPlatWithFiles),
      mergeMap(({ newData }) =>
        this.platService.createPlatWithFiles(newData).pipe(
          map((plat) => createPlatWithFilesSuccess({ plat })),
          catchError((error) =>
            of(createPlatWithFilesFailure({ error: error?.message ?? 'Erreur inconnue' }))
          )
        )
      )
    )
  );

  // Rechargement après création réussie
  createWithFilesSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(createPlatWithFilesSuccess),
      switchMap(() =>
        this.platService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchplatData({ page: currentPage || 1 })),
          catchError(() => of(fetchplatData({ page: 1 })))
        )
      )
    )
  );

  // ── MISE À JOUR avec fichiers ─────────────────────────────────

  updateWithFiles$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatePlatWithFiles),
      mergeMap(({ id, updatedData }) =>
        this.platService.updatePlatWithFiles(id, updatedData).pipe(
          map((updatedPlat) => updatePlatWithFilesSuccess({ updatedPlat })),
          catchError((error) =>
            of(updatePlatWithFilesFailure({ error: error?.message ?? 'Erreur inconnue' }))
          )
        )
      )
    )
  );

  // Rechargement après mise à jour réussie
  updateWithFilesSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updatePlatWithFilesSuccess),
      switchMap(() =>
        this.platService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchplatData({ page: currentPage })),
          catchError(() => of(fetchplatData({ page: 1 })))
        )
      )
    )
  );

  // ── SUPPRESSION simple ────────────────────────────────────────

  delete$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteplatData),
      mergeMap(({ id }) =>
        this.platService.deletePlat(id).pipe(
          map(() => deleteplatSuccess({ id })),
          catchError((error) =>
            of(deleteplatFailure({ error: error?.message ?? error.toString() }))
          )
        )
      )
    )
  );

  // Rechargement après suppression simple
  deleteSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteplatSuccess),
      switchMap(() =>
        this.platService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchplatData({ page: targetPage });
          }),
          catchError(() => of(fetchplatData({ page: 1 })))
        )
      )
    )
  );

  // ── SUPPRESSION multiple ──────────────────────────────────────

  deleteMultiple$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipleplatData),
      mergeMap(({ id }) => {
        const idArray = id
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultipleplatFailure({ error: 'Aucun ID valide fourni' }));
        }

        return this.platService.deleteMultiplePlat(idArray).pipe(
          map(() => deletemultipleplatSuccess({ id })),
          catchError((error) =>
            of(deletemultipleplatFailure({ error: error?.message ?? error.toString() }))
          )
        );
      })
    )
  );

  // Rechargement après suppression multiple
  deleteMultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipleplatSuccess),
      switchMap(({ id }) => {
        const deletedCount = id.split(',').filter((s) => s.trim() !== '').length;

        return this.platService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchplatData({ page: targetPage });
          }),
          catchError(() => of(fetchplatData({ page: 1 })))
        );
      })
    )
  );

  constructor(
    private actions$: Actions,
    private platService: PlatService
  ) {}
}
