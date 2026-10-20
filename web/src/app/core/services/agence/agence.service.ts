// src/app/core/services/agence/agence.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { AgencelistModel, ApiResponse } from 'src/app/store/Agence/agence.model';
import { paramTri } from 'src/app/shared/tri-serveur';

@Injectable({ providedIn: 'root' })
export class AgenceService {

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
  getAllAgences(page: number = 1, search?: string, ordering?: string): Observable<ApiResponse<AgencelistModel>> {
    this.currentPage = page;
    // Tri serveur (?ordering=) : conservé lors des rechargements tant qu'aucun nouveau tri n'est fourni
    if (ordering !== undefined) this.currentOrdering = ordering.trim();
    this.currentSearch = (search ?? '').trim();
    // ✅ Plus de getAuthHeaders() — le JWT est géré par l'intercepteur HTTP
    return this.http.get<ApiResponse<AgencelistModel>>(
      `${this.apiUrl}/agences/?page=${page}${paramTri(this.currentOrdering)}`
        + (this.currentSearch ? `&search=${encodeURIComponent(this.currentSearch)}` : '')
    ).pipe(
      tap(response => {
        this.totalItems   = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Liste sans pagination ─────────────────────────────────
  getListAgences(): Observable<AgencelistModel[]> {
    return this.http.get<AgencelistModel[]>(`${this.apiUrl}/allnopagin/agences/`);
  }

  // ── Récupérer par ID ──────────────────────────────────────
  getAgenceById(id: string): Observable<AgencelistModel> {
    return this.http.get<AgencelistModel>(`${this.apiUrl}/agences/${id}/`);
  }

  // ── Créer ─────────────────────────────────────────────────
  createAgence(agence: Partial<AgencelistModel>): Observable<AgencelistModel> {
    return this.http.post<AgencelistModel>(`${this.apiUrl}/agences/`, agence);
  }

  // ── Mettre à jour ─────────────────────────────────────────
  updateAgence(agence: AgencelistModel): Observable<AgencelistModel> {
    return this.http.put<AgencelistModel>(
      `${this.apiUrl}/agences/${agence.id}/`, agence
    );
  }

  // ── Supprimer un élément ──────────────────────────────────
  deleteAgence(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/agences/${id}/`);
  }

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleAgence(ids: number[]): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/agences/bulk_delete/`, {
      body: { ids }
    });
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
