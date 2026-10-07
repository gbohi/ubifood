// src/app/core/services/etat/etat.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { EtatlistModel, ApiResponse } from 'src/app/store/Etat/etat.model';

@Injectable({ providedIn: 'root' })
export class EtatService {

  // ✅ environment au lieu de hardcoding
  private apiUrl = `${environment.apiUrl}/api/api`;

  private currentPage  = 1;
  private totalItems   = 0;
  private itemsPerPage = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────
  getAllEtats(page: number = 1): Observable<ApiResponse<EtatlistModel>> {
    this.currentPage = page;
    // ✅ Plus de getAuthHeaders() — JWT géré par l'intercepteur
    return this.http.get<ApiResponse<EtatlistModel>>(
      `${this.apiUrl}/etats/?page=${page}`
    ).pipe(
      tap(response => {
        this.totalItems  = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Liste sans pagination ─────────────────────────────────
  getListEtat(): Observable<EtatlistModel[]> {
    return this.http.get<EtatlistModel[]>(`${this.apiUrl}/allnopagin/etats/`);
  }

  // ── Récupérer par ID ──────────────────────────────────────
  getEtatById(id: string): Observable<EtatlistModel> {
    return this.http.get<EtatlistModel>(`${this.apiUrl}/etats/${id}/`);
  }

  // ── Créer ─────────────────────────────────────────────────
  createEtat(etat: Partial<EtatlistModel>): Observable<EtatlistModel> {
    return this.http.post<EtatlistModel>(`${this.apiUrl}/etats/`, etat);
  }

  // ── Mettre à jour ─────────────────────────────────────────
  updateEtat(etat: EtatlistModel): Observable<EtatlistModel> {
    return this.http.put<EtatlistModel>(`${this.apiUrl}/etats/${etat.id}/`, etat);
  }

  // ── Supprimer un élément ──────────────────────────────────
  deleteEtat(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/etats/${id}/`);
  }

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleEtat(ids: number[]): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/etats/bulk_delete/`, {
      body: { ids }
    });
  }

  // ── Info pagination courante ──────────────────────────────
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
