// src/app/core/services/typebesoin/typebesoin.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { TypebesoinlistModel, ApiResponse } from 'src/app/store/Typebesoin/typebesoin.model';

@Injectable({ providedIn: 'root' })
export class TypebesoinService {

  // ✅ Utilisation de environment au lieu de hardcoding
  private apiUrl = `${environment.apiUrl}/api/api`;

  // Infos de pagination conservées en mémoire pour la gestion post-suppression
  private currentPage  = 1;
  private totalItems   = 0;
  private itemsPerPage = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────
  getAllTypebesoins(page: number = 1): Observable<ApiResponse<TypebesoinlistModel>> {
    this.currentPage = page;
    // ✅ Plus de getAuthHeaders() — le JWT est géré par l'intercepteur HTTP
    return this.http.get<ApiResponse<TypebesoinlistModel>>(
      `${this.apiUrl}/typebesoins/?page=${page}`
    ).pipe(
      tap(response => {
        this.totalItems   = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Liste sans pagination ─────────────────────────────────
  // ⚠️ Endpoint public spécifique à typebesoin
  getListTypebesoins(): Observable<TypebesoinlistModel[]> {
    return this.http.get<TypebesoinlistModel[]>(
      `${this.apiUrl}/public/typebesoins/`
    );
  }

  // ── Récupérer par ID ──────────────────────────────────────
  getTypebesoinById(id: string): Observable<TypebesoinlistModel> {
    return this.http.get<TypebesoinlistModel>(
      `${this.apiUrl}/typebesoins/${id}/`
    );
  }

  // ── Créer ─────────────────────────────────────────────────
  createTypebesoin(
    typebesoin: Partial<TypebesoinlistModel>
  ): Observable<TypebesoinlistModel> {
    return this.http.post<TypebesoinlistModel>(
      `${this.apiUrl}/typebesoins/`, typebesoin
    );
  }

  // ── Mettre à jour ─────────────────────────────────────────
  updateTypebesoin(
    typebesoin: TypebesoinlistModel
  ): Observable<TypebesoinlistModel> {
    return this.http.put<TypebesoinlistModel>(
      `${this.apiUrl}/typebesoins/${typebesoin.id}/`, typebesoin
    );
  }

  // ── Supprimer un élément ──────────────────────────────────
  deleteTypebesoin(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/typebesoins/${id}/`);
  }

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleTypebesoin(ids: number[]): Observable<any> {
    return this.http.delete<any>(
      `${this.apiUrl}/typebesoins/bulk_delete/`, { body: { ids } }
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
