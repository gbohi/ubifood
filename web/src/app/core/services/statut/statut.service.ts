// src/app/core/services/statut/statut.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { StatutlistModel, ApiResponse } from 'src/app/store/Statut/statut.model';

@Injectable({ providedIn: 'root' })
export class StatutService {

  // ✅ Utilisation de environment au lieu de hardcoding
  private apiUrl = `${environment.apiUrl}/api/api`;

  // Infos de pagination conservées en mémoire pour la gestion post-suppression
  private currentPage  = 1;
  private totalItems   = 0;
  private itemsPerPage = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────
  getAllStatuts(page: number = 1): Observable<ApiResponse<StatutlistModel>> {
    this.currentPage = page;
    // ✅ Plus de getAuthHeaders() — le JWT est géré par l'intercepteur HTTP
    return this.http.get<ApiResponse<StatutlistModel>>(
      `${this.apiUrl}/statuts/?page=${page}`
    ).pipe(
      tap(response => {
        this.totalItems   = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Liste sans pagination ─────────────────────────────────
  getListStatut(): Observable<StatutlistModel[]> {
    return this.http.get<StatutlistModel[]>(
      `${this.apiUrl}/allnopagin/statuts/`
    );
  }

  // ── Récupérer par ID ──────────────────────────────────────
  getStatutById(id: string): Observable<StatutlistModel> {
    return this.http.get<StatutlistModel>(
      `${this.apiUrl}/statuts/${id}/`
    );
  }

  // ── Créer ─────────────────────────────────────────────────
  createStatut(
    statut: Partial<StatutlistModel>
  ): Observable<StatutlistModel> {
    return this.http.post<StatutlistModel>(
      `${this.apiUrl}/statuts/`, statut
    );
  }

  // ── Mettre à jour ─────────────────────────────────────────
  updateStatut(
    statut: StatutlistModel
  ): Observable<StatutlistModel> {
    return this.http.put<StatutlistModel>(
      `${this.apiUrl}/statuts/${statut.id}/`, statut
    );
  }

  // ── Supprimer un élément ──────────────────────────────────
  deleteStatut(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/statuts/${id}/`);
  }

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleStatut(ids: number[]): Observable<any> {
    return this.http.delete<any>(
      `${this.apiUrl}/statuts/bulk_delete/`, { body: { ids } }
    );
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
}
