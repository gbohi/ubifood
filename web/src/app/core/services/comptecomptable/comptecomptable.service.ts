// src/app/core/services/comptecomptable/comptecomptable.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { ComptecomptablelistModel, ApiResponse } from 'src/app/store/Comptecomptable/comptecomptable.model';

@Injectable({ providedIn: 'root' })
export class ComptecomptableService {

  // ✅ Utilisation de environment au lieu de hardcoding
  private apiUrl = `${environment.apiUrl}/api/api`;

  // Infos de pagination conservées en mémoire pour la gestion post-suppression
  private currentPage  = 1;
  private totalItems   = 0;
  private itemsPerPage = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────
  getAllComptecomptables(page: number = 1): Observable<ApiResponse<ComptecomptablelistModel>> {
    this.currentPage = page;
    // ✅ Plus de getAuthHeaders() — le JWT est géré par l'intercepteur HTTP
    return this.http.get<ApiResponse<ComptecomptablelistModel>>(
      `${this.apiUrl}/comptecomptables/?page=${page}`
    ).pipe(
      tap(response => {
        this.totalItems   = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Liste sans pagination ─────────────────────────────────
  getListComptecomptables(): Observable<ComptecomptablelistModel[]> {
    return this.http.get<ComptecomptablelistModel[]>(
      `${this.apiUrl}/allnopagin/comptecomptables/`
    );
  }

  // ── Récupérer par ID ──────────────────────────────────────
  getcomptecomptableById(id: string): Observable<ComptecomptablelistModel> {
    return this.http.get<ComptecomptablelistModel>(
      `${this.apiUrl}/comptecomptables/${id}/`
    );
  }

  // ── Créer ─────────────────────────────────────────────────
  createComptecomptable(
    comptecomptable: Partial<ComptecomptablelistModel>
  ): Observable<ComptecomptablelistModel> {
    return this.http.post<ComptecomptablelistModel>(
      `${this.apiUrl}/comptecomptables/`, comptecomptable
    );
  }

  // ── Mettre à jour ─────────────────────────────────────────
  updateComptecomptable(
    comptecomptable: ComptecomptablelistModel
  ): Observable<ComptecomptablelistModel> {
    return this.http.put<ComptecomptablelistModel>(
      `${this.apiUrl}/comptecomptables/${comptecomptable.id}/`, comptecomptable
    );
  }

  // ── Supprimer un élément ──────────────────────────────────
  deleteComptecomptable(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/comptecomptables/${id}/`);
  }

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleComptecomptable(ids: number[]): Observable<any> {
    return this.http.delete<any>(
      `${this.apiUrl}/comptecomptables/bulk_delete/`, { body: { ids } }
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
