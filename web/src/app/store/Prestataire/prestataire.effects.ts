// src/app/store/Prestataire/prestataire.effects.ts

import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { PrestataireService } from 'src/app/core/services/prestataire/prestataire.service';

import {
  addprestataireData,
  addprestataireDataFailure,
  addprestataireDataSuccess,

  deleteprestataireData,
  deleteprestataireFailure,
  deleteprestataireSuccess,

  deletemultipleprestataireData,
  deletemultipleprestataireSuccess,
  deletemultipleprestataireFailure,

  fetchprestataireData,
  fetchprestataireFailure,
  fetchprestataireSuccess,

  updateprestataireData,
  updateprestataireDataFailure,
  updateprestataireDataSuccess,

  fetchprestataireNoPaginateData,
  fetchprestataireNoPaginateSuccess,
  fetchprestataireNoPaginateFailure,
} from './prestataire.action';

@Injectable()
export class PrestataireEffects {

  constructor(
    private actions$: Actions,
    private prestataireService: PrestataireService,
  ) {}

  // ── Charger liste paginée ─────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchprestataireData),
      mergeMap(({ page }) =>
        this.prestataireService.getAllPrestataires(page || 1).pipe(
          map(response => fetchprestataireSuccess({ response })),
          catchError(error => of(fetchprestataireFailure({ error: error.toString() })))
        )
      )
    )
  );

  // ── Charger liste sans pagination ─────────────────────────
  fetchlistNoPaginData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchprestataireNoPaginateData),
      mergeMap(() =>
        this.prestataireService.getListPrestataires().pipe(
          map(response => fetchprestataireNoPaginateSuccess({ response })),
          catchError(error => of(fetchprestataireNoPaginateFailure({ error: error.toString() })))
        )
      )
    )
  );

  // ── Ajouter ───────────────────────────────────────────────
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addprestataireData),
      mergeMap(({ newData }) =>
        this.prestataireService.createPrestataire(newData).pipe(
          // ✅ On retourne la réponse complète incluant l'ID généré par Django
          map(response => addprestataireDataSuccess({ newData: response })),
          catchError(error => of(addprestataireDataFailure({ error: error.toString() })))
        )
      )
    )
  );

  // Recharger page 1 après ajout
  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addprestataireDataSuccess),
      map(() => fetchprestataireData({ page: 1 }))
    )
  );

  // ── Mettre à jour ─────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updateprestataireData),
      mergeMap(({ updatedData }) =>
        this.prestataireService.updatePrestataire(updatedData).pipe(
          map(() => updateprestataireDataSuccess({ updatedData })),
          catchError(error => of(updateprestataireDataFailure({ error: error.toString() })))
        )
      )
    )
  );

  // Recharger page courante après mise à jour
  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updateprestataireDataSuccess),
      mergeMap(() =>
        this.prestataireService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchprestataireData({ page: currentPage }))
        )
      )
    )
  );

  // ── Supprimer un élément ──────────────────────────────────
  deleteData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteprestataireData),
      mergeMap(({ id }) =>
        this.prestataireService.deletePrestataire(id).pipe(
          map(() => deleteprestataireSuccess({ id })),
          catchError(error => of(deleteprestataireFailure({ error: error.toString() })))
        )
      )
    )
  );

  // Recharger après suppression simple
  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteprestataireSuccess),
      mergeMap(() =>
        this.prestataireService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const page = currentPage > totalPages ? Math.max(totalPages, 1) : currentPage;
            return fetchprestataireData({ page });
          }),
          catchError(() => of(fetchprestataireData({ page: 1 })))
        )
      )
    )
  );

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipleprestataireData),
      mergeMap(({ id }) => {
        const idArray = id
          .split(',')
          .map(s => parseInt(s.trim()))
          .filter(n => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultipleprestataireFailure({ error: 'Aucun ID valide' }));
        }

        return this.prestataireService.deleteMultiplePrestataire(idArray).pipe(
          map(() => deletemultipleprestataireSuccess({ id })),
          catchError(error => of(deletemultipleprestataireFailure({ error: error.toString() })))
        );
      })
    )
  );

  // Recharger après suppression multiple
  deletemultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipleprestataireSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id.split(',').filter(s => s.trim() !== '').length;
        return this.prestataireService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const page = currentPage > totalPages ? Math.max(totalPages, 1) : currentPage;
            return fetchprestataireData({ page });
          }),
          catchError(() => of(fetchprestataireData({ page: 1 })))
        );
      })
    )
  );
}
