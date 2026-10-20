// src/app/store/Agence/agence.effects.ts

import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { catchError, map, mergeMap, switchMap, tap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { AgenceService } from 'src/app/core/services/agence/agence.service';
import {
  addagenceData,
  addagenceDataFailure,
  addagenceDataSuccess,
  deleteagenceData,
  deleteagenceFailure,
  deleteagenceSuccess,
  deletemultipleagenceData,
  deletemultipleagenceFailure,
  deletemultipleagenceSuccess,
  fetchagenceData,
  fetchagenceFailure,
  fetchagenceSuccess,
  updateagenceData,
  updateagenceDataFailure,
  updateagenceDataSuccess,
  fetchagenceNoPaginateData,
  fetchagenceNoPaginateSuccess,
  fetchagenceNoPaginateFailure,
} from './agence.action';

@Injectable()
export class AgenceEffects {

  // ── Fetch paginé ────────────────────────────────────────────
  fetchlistData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchagenceData),
      switchMap(({ page, search, ordering }) =>
        this.agenceService.getAllAgences(page ?? 1, search, ordering).pipe(
          map((response) => fetchagenceSuccess({ response })),
          catchError((error) =>
            of(fetchagenceFailure({ error: typeof error === 'string' ? error : "Erreur lors du chargement des données" }))
          )
        )
      )
    )
  );

  // ── Fetch sans pagination ───────────────────────────────────
  fetchlistNoPaginData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(fetchagenceNoPaginateData),
      mergeMap(() =>
        this.agenceService.getListAgences().pipe(
          map((response) => fetchagenceNoPaginateSuccess({ response })),
          catchError((error) =>
            of(fetchagenceNoPaginateFailure({ error: typeof error === 'string' ? error : "Erreur lors du chargement des données" }))
          )
        )
      )
    )
  );

  // ── Ajouter ─────────────────────────────────────────────────
  addData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addagenceData),
      mergeMap(({ newData }) =>
        this.agenceService.createAgence(newData).pipe(
          map((response) => addagenceDataSuccess({ newData: response })),
          catchError((error) =>
            of(addagenceDataFailure({ error: typeof error === 'string' ? error : "Erreur lors de l'ajout" }))
          )
        )
      )
    )
  );

  // Recharger à la page 1 après ajout
  addSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(addagenceDataSuccess),
      map(() => fetchagenceData({ page: 1, search: this.agenceService.getCurrentSearch() }))
    )
  );

  // ── Modifier ────────────────────────────────────────────────
  updateData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updateagenceData),
      mergeMap(({ updatedData }) =>
        this.agenceService.updateAgence(updatedData).pipe(
          map(() => updateagenceDataSuccess({ updatedData })),
          catchError((error) =>
            of(updateagenceDataFailure({ error: typeof error === 'string' ? error : "Erreur lors de la mise à jour" }))
          )
        )
      )
    )
  );

  // Recharger la page courante après modification
  updateSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updateagenceDataSuccess),
      mergeMap(() =>
        this.agenceService.getCurrentPageInfo().pipe(
          map(({ currentPage }) => fetchagenceData({ page: currentPage, search: this.agenceService.getCurrentSearch() }))
        )
      )
    )
  );

  // ── Supprimer (unitaire) ────────────────────────────────────
  deleteData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteagenceData),
      mergeMap(({ id }) =>
        this.agenceService.deleteAgence(id).pipe(
          map(() => deleteagenceSuccess({ id })),
          catchError((error) =>
            of(deleteagenceFailure({ error: typeof error === 'string' ? error : "Erreur lors de la suppression" }))
          )
        )
      )
    )
  );

  // Recalculer la page après suppression unitaire
  deleteSingleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteagenceSuccess),
      mergeMap(() =>
        this.agenceService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchagenceData({ page: targetPage, search: this.agenceService.getCurrentSearch() });
          }),
          catchError(() => of(fetchagenceData({ page: 1, search: this.agenceService.getCurrentSearch() })))
        )
      )
    )
  );

  // ── Supprimer (multiple) ────────────────────────────────────
  deleteMultipleData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipleagenceData),
      mergeMap(({ id }) => {
        if (!id || id.trim() === '') {
          return of(deletemultipleagenceFailure({ error: 'Aucun ID valide' }));
        }

        const idArray = id
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

        if (idArray.length === 0) {
          return of(deletemultipleagenceFailure({ error: 'Aucun ID valide après conversion' }));
        }

        return this.agenceService.deleteMultipleAgence(idArray).pipe(
          map(() => deletemultipleagenceSuccess({ id })),
          catchError((error) =>
            of(deletemultipleagenceFailure({ error: typeof error === 'string' ? error : "Erreur lors de la suppression" }))
          )
        );
      })
    )
  );

  // Recalculer la page après suppression multiple
  deleteMultipleSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deletemultipleagenceSuccess),
      mergeMap(({ id }) => {
        const deletedCount = id
          .split(',')
          .filter((s) => s.trim() !== '').length;

        return this.agenceService.getCurrentPageInfo().pipe(
          map(({ currentPage, totalItems, itemsPerPage }) => {
            const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
            const targetPage = currentPage > totalPages
              ? Math.max(totalPages, 1)
              : currentPage;
            return fetchagenceData({ page: targetPage, search: this.agenceService.getCurrentSearch() });
          }),
          catchError(() => of(fetchagenceData({ page: 1, search: this.agenceService.getCurrentSearch() })))
        );
      })
    )
  );

  constructor(
    private actions$: Actions,
    private agenceService: AgenceService   // ✅ CrudService supprimé (inutilisé)
  ) {}
}
