// src/app/core/services/categoriecomptable/categoriecomptable.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { CategoriecomptablelistModel, ApiResponse } from 'src/app/store/Categoriecomptable/categoriecomptable.model';

@Injectable({ providedIn: 'root' })
export class CategoriecomptableService {

  // ✅ Utilisation de environment au lieu de hardcoding
  private apiUrl = `${environment.apiUrl}/api/api`;

  // Infos de pagination conservées en mémoire pour la gestion post-suppression
  private currentPage  = 1;
  private totalItems   = 0;
  private itemsPerPage = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────
  getAllCategoriecomptables(page: number = 1): Observable<ApiResponse<CategoriecomptablelistModel>> {
    this.currentPage = page;
    // ✅ Plus de getAuthHeaders() — le JWT est géré par l'intercepteur HTTP
    return this.http.get<ApiResponse<CategoriecomptablelistModel>>(
      `${this.apiUrl}/categoriecomptables/?page=${page}`
    ).pipe(
      tap(response => {
        this.totalItems   = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Liste sans pagination ─────────────────────────────────
  getListCategoriecomptables(): Observable<CategoriecomptablelistModel[]> {
    return this.http.get<CategoriecomptablelistModel[]>(
      `${this.apiUrl}/allnopagin/categoriecomptables/`
    );
  }

  // ── Récupérer par ID ──────────────────────────────────────
  getCategoriecomptableById(id: string): Observable<CategoriecomptablelistModel> {
    return this.http.get<CategoriecomptablelistModel>(
      `${this.apiUrl}/categoriecomptables/${id}/`
    );
  }

  // ── Créer ─────────────────────────────────────────────────
  createCategoriecomptable(
    categoriecomptable: Partial<CategoriecomptablelistModel>
  ): Observable<CategoriecomptablelistModel> {
    return this.http.post<CategoriecomptablelistModel>(
      `${this.apiUrl}/categoriecomptables/`, categoriecomptable
    );
  }

  // ── Mettre à jour ─────────────────────────────────────────
  updateCategoriecomptable(
    categoriecomptable: CategoriecomptablelistModel
  ): Observable<CategoriecomptablelistModel> {
    return this.http.put<CategoriecomptablelistModel>(
      `${this.apiUrl}/categoriecomptables/${categoriecomptable.id}/`, categoriecomptable
    );
  }

  // ── Supprimer un élément ──────────────────────────────────
  deleteCategoriecomptable(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/categoriecomptables/${id}/`);
  }

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleCategoriecomptable(ids: number[]): Observable<any> {
    return this.http.delete<any>(
      `${this.apiUrl}/categoriecomptables/bulk_delete/`, { body: { ids } }
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
