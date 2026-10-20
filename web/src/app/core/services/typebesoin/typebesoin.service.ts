// src/app/core/services/typebesoin/typebesoin.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { TypebesoinlistModel, ApiResponse } from 'src/app/store/Typebesoin/typebesoin.model';
import { paramTri } from 'src/app/shared/tri-serveur';

@Injectable({ providedIn: 'root' })
export class TypebesoinService {

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
  getAllTypebesoins(page: number = 1, search?: string, ordering?: string): Observable<ApiResponse<TypebesoinlistModel>> {
    this.currentPage = page;
    // Tri serveur (?ordering=) : conservé lors des rechargements tant qu'aucun nouveau tri n'est fourni
    if (ordering !== undefined) this.currentOrdering = ordering.trim();
    this.currentSearch = (search ?? '').trim();
    // ✅ Plus de getAuthHeaders() — le JWT est géré par l'intercepteur HTTP
    return this.http.get<ApiResponse<TypebesoinlistModel>>(
      `${this.apiUrl}/typebesoins/?page=${page}${paramTri(this.currentOrdering)}`
        + (this.currentSearch ? `&search=${encodeURIComponent(this.currentSearch)}` : '')
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
