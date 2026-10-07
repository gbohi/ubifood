// src/app/core/services/typeplat/typeplat.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { TypeplatlistModel, ApiResponse } from 'src/app/store/Typeplat/typeplat.model';

@Injectable({ providedIn: 'root' })
export class TypeplatService {

  // ✅ Utilisation de environment au lieu de hardcoding
  private apiUrl = `${environment.apiUrl}/api/api`;

  // Infos de pagination conservées en mémoire pour la gestion post-suppression
  private currentPage  = 1;
  private totalItems   = 0;
  private itemsPerPage = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────
  getAllTypeplats(page: number = 1): Observable<ApiResponse<TypeplatlistModel>> {
    this.currentPage = page;
    // ✅ Plus de getAuthHeaders() — le JWT est géré par l'intercepteur HTTP
    return this.http.get<ApiResponse<TypeplatlistModel>>(
      `${this.apiUrl}/typeplats/?page=${page}`
    ).pipe(
      tap(response => {
        this.totalItems   = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Liste sans pagination ─────────────────────────────────
  getListTypeplats(): Observable<TypeplatlistModel[]> {
    return this.http.get<TypeplatlistModel[]>(
      `${this.apiUrl}/allnopagin/typeplats/`
    );
  }

  // ── Récupérer par ID ──────────────────────────────────────
  getTypeplatById(id: string): Observable<TypeplatlistModel> {
    return this.http.get<TypeplatlistModel>(
      `${this.apiUrl}/typeplats/${id}/`
    );
  }

  // ── Créer ─────────────────────────────────────────────────
  createTypeplat(
    typeplat: Partial<TypeplatlistModel>
  ): Observable<TypeplatlistModel> {
    return this.http.post<TypeplatlistModel>(
      `${this.apiUrl}/typeplats/`, typeplat
    );
  }

  // ── Mettre à jour ─────────────────────────────────────────
  updateTypeplat(
    typeplat: TypeplatlistModel
  ): Observable<TypeplatlistModel> {
    return this.http.put<TypeplatlistModel>(
      `${this.apiUrl}/typeplats/${typeplat.id}/`, typeplat
    );
  }

  // ── Supprimer un élément ──────────────────────────────────
  deleteTypeplat(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/typeplats/${id}/`);
  }

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleTypeplat(ids: number[]): Observable<any> {
    return this.http.delete<any>(
      `${this.apiUrl}/typeplats/bulk_delete/`, { body: { ids } }
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
