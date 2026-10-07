// src/app/core/services/poste/poste.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { PosteModel, ApiResponse } from 'src/app/store/Poste/poste.model';

@Injectable({ providedIn: 'root' })
export class PosteService {

  private apiUrl = `${environment.apiUrl}/api/api`;

  private currentPage  = 1;
  private totalItems   = 0;
  private itemsPerPage = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────
  getAllPostes(page: number = 1): Observable<ApiResponse<PosteModel>> {
    this.currentPage = page;
    return this.http.get<ApiResponse<PosteModel>>(
      `${this.apiUrl}/postes/?page=${page}`
    ).pipe(
      tap(response => {
        this.totalItems  = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Liste sans pagination ─────────────────────────────────
  getListPostes(): Observable<PosteModel[]> {
    return this.http.get<PosteModel[]>(`${this.apiUrl}/allnopagin/postes/`);
  }

  // ── Créer ─────────────────────────────────────────────────
  createPoste(poste: Partial<PosteModel>): Observable<PosteModel> {
    return this.http.post<PosteModel>(`${this.apiUrl}/postes/`, poste);
  }

  // ── Mettre à jour ─────────────────────────────────────────
  updatePoste(poste: PosteModel): Observable<PosteModel> {
    return this.http.put<PosteModel>(`${this.apiUrl}/postes/${poste.id}/`, poste);
  }

  // ── Supprimer un élément ──────────────────────────────────
  deletePoste(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/postes/${id}/`);
  }

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultiplePoste(ids: number[]): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/postes/bulk_delete/`, {
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
