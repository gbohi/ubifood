// src/app/core/services/typeequipe/typeequipe.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { TypeequipelistModel, ApiResponse } from 'src/app/store/Typeequipe/typeequipe.model';
import { paramTri } from 'src/app/shared/tri-serveur';

@Injectable({ providedIn: 'root' })
export class TypeequipeService {

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
  getAllTypeequipes(page: number = 1, search?: string, ordering?: string): Observable<ApiResponse<TypeequipelistModel>> {
    this.currentPage = page;
    // Tri serveur (?ordering=) : conservé lors des rechargements tant qu'aucun nouveau tri n'est fourni
    if (ordering !== undefined) this.currentOrdering = ordering.trim();
    this.currentSearch = (search ?? '').trim();
    // ✅ Plus de getAuthHeaders() — le JWT est géré par l'intercepteur HTTP
    return this.http.get<ApiResponse<TypeequipelistModel>>(
      `${this.apiUrl}/typeequipes/?page=${page}${paramTri(this.currentOrdering)}`
        + (this.currentSearch ? `&search=${encodeURIComponent(this.currentSearch)}` : '')
    ).pipe(
      tap(response => {
        this.totalItems   = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Liste sans pagination ─────────────────────────────────
  getListTypeequipes(): Observable<TypeequipelistModel[]> {
    return this.http.get<TypeequipelistModel[]>(
      `${this.apiUrl}/allnopagin/typeequipes/`
    );
  }

  // ── Récupérer par ID ──────────────────────────────────────
  getTypeequipeById(id: string): Observable<TypeequipelistModel> {
    return this.http.get<TypeequipelistModel>(
      `${this.apiUrl}/typeequipes/${id}/`
    );
  }

  // ── Créer ─────────────────────────────────────────────────
  createTypeequipe(
    typeequipe: Partial<TypeequipelistModel>
  ): Observable<TypeequipelistModel> {
    return this.http.post<TypeequipelistModel>(
      `${this.apiUrl}/typeequipes/`, typeequipe
    );
  }

  // ── Mettre à jour ─────────────────────────────────────────
  updateTypeequipe(
    typeequipe: TypeequipelistModel
  ): Observable<TypeequipelistModel> {
    return this.http.put<TypeequipelistModel>(
      `${this.apiUrl}/typeequipes/${typeequipe.id}/`, typeequipe
    );
  }

  // ── Supprimer un élément ──────────────────────────────────
  deleteTypeequipe(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/typeequipes/${id}/`);
  }

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleTypeequipe(ids: number[]): Observable<any> {
    return this.http.delete<any>(
      `${this.apiUrl}/typeequipes/bulk_delete/`, { body: { ids } }
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
