// src/app/core/services/priorite/priorite.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { PrioritelistModel, ApiResponse } from 'src/app/store/Priorite/priorite.model';
import { paramTri } from 'src/app/shared/tri-serveur';

@Injectable({ providedIn: 'root' })
export class PrioriteService {

  // ✅ Utilisation de environment au lieu de hardcoding
  private apiUrl = `${environment.apiUrl}/api/api`;

  // Infos de pagination conservées en mémoire pour la gestion post-suppression
  private currentPage  = 1;
  private currentOrdering = '';
  private totalItems   = 0;
  private itemsPerPage = 10;
  private currentSearch = '';

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────
  getAllPriorites(page: number = 1, search?: string, ordering?: string): Observable<ApiResponse<PrioritelistModel>> {
    this.currentPage = page;
    // Tri serveur (?ordering=) : conservé lors des rechargements tant qu'aucun nouveau tri n'est fourni
    if (ordering !== undefined) this.currentOrdering = ordering.trim();
    this.currentSearch = (search ?? '').trim();
    // ✅ Plus de getAuthHeaders() — le JWT est géré par l'intercepteur HTTP
    return this.http.get<ApiResponse<PrioritelistModel>>(
      `${this.apiUrl}/priorites/?page=${page}${paramTri(this.currentOrdering)}`
        + (this.currentSearch ? `&search=${encodeURIComponent(this.currentSearch)}` : '')
    ).pipe(
      tap(response => {
        this.totalItems   = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Liste sans pagination ─────────────────────────────────
  // ⚠️ Endpoint public spécifique à priorité
  getListPriorites(): Observable<PrioritelistModel[]> {
    return this.http.get<PrioritelistModel[]>(
      `${this.apiUrl}/public/priorites/`
    );
  }

  // ── Récupérer par ID ──────────────────────────────────────
  getPrioriteById(id: string): Observable<PrioritelistModel> {
    return this.http.get<PrioritelistModel>(
      `${this.apiUrl}/priorites/${id}/`
    );
  }

  // ── Créer ─────────────────────────────────────────────────
  createPriorite(
    priorite: Partial<PrioritelistModel>
  ): Observable<PrioritelistModel> {
    return this.http.post<PrioritelistModel>(
      `${this.apiUrl}/priorites/`, priorite
    );
  }

  // ── Mettre à jour ─────────────────────────────────────────
  updatePriorite(
    priorite: PrioritelistModel
  ): Observable<PrioritelistModel> {
    return this.http.put<PrioritelistModel>(
      `${this.apiUrl}/priorites/${priorite.id}/`, priorite
    );
  }

  // ── Supprimer un élément ──────────────────────────────────
  deletePriorite(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/priorites/${id}/`);
  }

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultiplePriorite(ids: number[]): Observable<any> {
    return this.http.delete<any>(
      `${this.apiUrl}/priorites/bulk_delete/`, { body: { ids } }
    );
  }

  // ── Terme de recherche courant (conservé lors des rechargements) ──

  getCurrentSearch(): string {

    return this.currentSearch;

  }


  // ── Info pagination courante (utilisée post-suppression) ──
  getCurrentPageInfo(): Observable<{
    currentPage:  number;
    totalItems:   number;
    itemsPerPage: number;
  }> {
    return of({
      currentPage:  this.currentPage,
      totalItems:   this.totalItems,
      itemsPerPage: this.itemsPerPage,
    });
  }

  // ── Tri courant (conservé lors des rechargements) ──
  getCurrentOrdering(): string {
    return this.currentOrdering;
  }
}
