// src/app/core/services/typevehicule/typevehicule.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { TypevehiculelistModel, ApiResponse } from 'src/app/store/Typevehicule/typevehicule.model';

@Injectable({ providedIn: 'root' })
export class TypevehiculeService {

  // ✅ Utilisation de environment au lieu de hardcoding
  private apiUrl = `${environment.apiUrl}/api/api`;

  // Infos de pagination conservées en mémoire pour la gestion post-suppression
  private currentPage  = 1;
  private totalItems   = 0;
  private itemsPerPage = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────
  getAllTypevehicules(page: number = 1): Observable<ApiResponse<TypevehiculelistModel>> {
    this.currentPage = page;
    // ✅ Plus de getAuthHeaders() — le JWT est géré par l'intercepteur HTTP
    return this.http.get<ApiResponse<TypevehiculelistModel>>(
      `${this.apiUrl}/typevehicules/?page=${page}`
    ).pipe(
      tap(response => {
        this.totalItems   = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Liste sans pagination ─────────────────────────────────
  getListTypevehicules(): Observable<TypevehiculelistModel[]> {
    return this.http.get<TypevehiculelistModel[]>(
      `${this.apiUrl}/allnopagin/typevehicules/`
    );
  }

  // ── Récupérer par ID ──────────────────────────────────────
  getTypevehiculeById(id: string): Observable<TypevehiculelistModel> {
    return this.http.get<TypevehiculelistModel>(
      `${this.apiUrl}/typevehicules/${id}/`
    );
  }

  // ── Créer ─────────────────────────────────────────────────
  createTypevehicule(
    typevehicule: Partial<TypevehiculelistModel>
  ): Observable<TypevehiculelistModel> {
    return this.http.post<TypevehiculelistModel>(
      `${this.apiUrl}/typevehicules/`, typevehicule
    );
  }

  // ── Mettre à jour ─────────────────────────────────────────
  updateTypevehicule(
    typevehicule: TypevehiculelistModel
  ): Observable<TypevehiculelistModel> {
    return this.http.put<TypevehiculelistModel>(
      `${this.apiUrl}/typevehicules/${typevehicule.id}/`, typevehicule
    );
  }

  // ── Supprimer un élément ──────────────────────────────────
  deleteTypevehicule(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/typevehicules/${id}/`);
  }

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleTypevehicule(ids: number[]): Observable<any> {
    return this.http.delete<any>(
      `${this.apiUrl}/typevehicules/bulk_delete/`, { body: { ids } }
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
