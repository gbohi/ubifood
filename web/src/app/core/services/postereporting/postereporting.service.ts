// src/app/core/services/postereporting/postereporting.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { PostereportinglistModel, ApiResponse } from 'src/app/store/Postereporting/postereporting.model';

@Injectable({ providedIn: 'root' })
export class PostereportingService {

  // ✅ Utilisation de environment au lieu de hardcoding
  private apiUrl = `${environment.apiUrl}/api/api`;

  // Infos de pagination conservées en mémoire pour la gestion post-suppression
  private currentPage  = 1;
  private totalItems   = 0;
  private itemsPerPage = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────
  getAllPostereportings(page: number = 1): Observable<ApiResponse<PostereportinglistModel>> {
    this.currentPage = page;
    // ✅ Plus de getAuthHeaders() — le JWT est géré par l'intercepteur HTTP
    return this.http.get<ApiResponse<PostereportinglistModel>>(
      `${this.apiUrl}/postereportings/?page=${page}`
    ).pipe(
      tap(response => {
        this.totalItems   = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Liste sans pagination ─────────────────────────────────
  getListPostereportings(): Observable<PostereportinglistModel[]> {
    return this.http.get<PostereportinglistModel[]>(
      `${this.apiUrl}/allnopagin/postereportings/`
    );
  }

  // ── Récupérer par ID ──────────────────────────────────────
  getPostereportingById(id: string): Observable<PostereportinglistModel> {
    return this.http.get<PostereportinglistModel>(
      `${this.apiUrl}/postereportings/${id}/`
    );
  }

  // ── Créer ─────────────────────────────────────────────────
  createPostereporting(
    postereporting: Partial<PostereportinglistModel>
  ): Observable<PostereportinglistModel> {
    return this.http.post<PostereportinglistModel>(
      `${this.apiUrl}/postereportings/`, postereporting
    );
  }

  // ── Mettre à jour ─────────────────────────────────────────
  updatePostereporting(
    postereporting: PostereportinglistModel
  ): Observable<PostereportinglistModel> {
    return this.http.put<PostereportinglistModel>(
      `${this.apiUrl}/postereportings/${postereporting.id}/`, postereporting
    );
  }

  // ── Supprimer un élément ──────────────────────────────────
  deletePostereporting(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/postereportings/${id}/`);
  }

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultiplePostereporting(ids: number[]): Observable<any> {
    return this.http.delete<any>(
      `${this.apiUrl}/postereportings/bulk_delete/`, { body: { ids } }
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
