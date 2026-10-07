// src/app/core/services/classecomptable/classecomptable.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { ClassecomptablelistModel, ApiResponse } from 'src/app/store/Classecomptable/classecomptable.model';

@Injectable({ providedIn: 'root' })
export class ClassecomptableService {

  // ✅ Utilisation de environment au lieu de hardcoding
  private apiUrl = `${environment.apiUrl}/api/api`;

  // Infos de pagination conservées en mémoire pour la gestion post-suppression
  private currentPage  = 1;
  private totalItems   = 0;
  private itemsPerPage = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────
  getAllClassecomptables(page: number = 1): Observable<ApiResponse<ClassecomptablelistModel>> {
    this.currentPage = page;
    // ✅ Plus de getAuthHeaders() — le JWT est géré par l'intercepteur HTTP
    return this.http.get<ApiResponse<ClassecomptablelistModel>>(
      `${this.apiUrl}/classecomptables/?page=${page}`
    ).pipe(
      tap(response => {
        this.totalItems   = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Liste sans pagination ─────────────────────────────────
  getListClassecomptables(): Observable<ClassecomptablelistModel[]> {
    return this.http.get<ClassecomptablelistModel[]>(
      `${this.apiUrl}/allnopagin/classecomptables/`
    );
  }

  // ── Récupérer par ID ──────────────────────────────────────
  getClassecomptableById(id: string): Observable<ClassecomptablelistModel> {
    return this.http.get<ClassecomptablelistModel>(
      `${this.apiUrl}/classecomptables/${id}/`
    );
  }

  // ── Créer ─────────────────────────────────────────────────
  createClassecomptable(
    classecomptable: Partial<ClassecomptablelistModel>
  ): Observable<ClassecomptablelistModel> {
    return this.http.post<ClassecomptablelistModel>(
      `${this.apiUrl}/classecomptables/`, classecomptable
    );
  }

  // ── Mettre à jour ─────────────────────────────────────────
  updateClassecomptable(
    classecomptable: ClassecomptablelistModel
  ): Observable<ClassecomptablelistModel> {
    return this.http.put<ClassecomptablelistModel>(
      `${this.apiUrl}/classecomptables/${classecomptable.id}/`, classecomptable
    );
  }

  // ── Supprimer un élément ──────────────────────────────────
  deleteClassecomptable(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/classecomptables/${id}/`);
  }

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleClassecomptable(ids: number[]): Observable<any> {
    return this.http.delete<any>(
      `${this.apiUrl}/classecomptables/bulk_delete/`, { body: { ids } }
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
