// src/app/core/services/fonction/fonction.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { FonctionlistModel, ApiResponse } from 'src/app/store/Fonction/fonction.model';

@Injectable({ providedIn: 'root' })
export class FonctionService {

  // ✅ Utilisation de environment au lieu de hardcoding
  private apiUrl = `${environment.apiUrl}/api/api`;

  // Infos de pagination conservées en mémoire pour la gestion post-suppression
  private currentPage   = 1;
  private totalItems    = 0;
  private itemsPerPage  = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────
  getAllFonctions(page: number = 1): Observable<ApiResponse<FonctionlistModel>> {
    this.currentPage = page;
    // ✅ Plus de getAuthHeaders() — le JWT est géré par l'intercepteur HTTP
    return this.http.get<ApiResponse<FonctionlistModel>>(
      `${this.apiUrl}/fonctions/?page=${page}`
    ).pipe(
      tap(response => {
        this.totalItems  = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Liste sans pagination ─────────────────────────────────
  getListFonctions(): Observable<FonctionlistModel[]> {
    return this.http.get<FonctionlistModel[]>(`${this.apiUrl}/allnopagin/fonctions/`);
  }

  // ── Récupérer par ID ──────────────────────────────────────
  getFonctionById(id: string): Observable<FonctionlistModel> {
    return this.http.get<FonctionlistModel>(`${this.apiUrl}/fonctions/${id}/`);
  }

  // ── Créer ─────────────────────────────────────────────────
  createFonction(fonction: Partial<FonctionlistModel>): Observable<FonctionlistModel> {
    return this.http.post<FonctionlistModel>(`${this.apiUrl}/fonctions/`, fonction);
  }

  // ── Mettre à jour ─────────────────────────────────────────
  updateFonction(fonction: FonctionlistModel): Observable<FonctionlistModel> {
    return this.http.put<FonctionlistModel>(
      `${this.apiUrl}/fonctions/${fonction.id}/`, fonction
    );
  }

  // ── Supprimer un élément ──────────────────────────────────
  deleteFonction(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/fonctions/${id}/`);
  }

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleFonction(ids: number[]): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/fonctions/bulk_delete/`, {
      body: { ids }
    });
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
