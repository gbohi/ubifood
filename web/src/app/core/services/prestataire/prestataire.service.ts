import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { PrestatairelistModel, ApiResponse } from 'src/app/store/Prestataire/prestataire.model';

@Injectable({ providedIn: 'root' })
export class PrestataireService {

  // ✅ Utilisation de environment au lieu de hardcoding
  private apiUrl = `${environment.apiUrl}/api/api`;

  // Infos de pagination conservées en mémoire pour la gestion post-suppression
  private currentPage   = 1;
  private totalItems    = 0;
  private itemsPerPage  = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────
  getAllPrestataires(page: number = 1): Observable<ApiResponse<PrestatairelistModel>> {
    this.currentPage = page;
    // ✅ Plus de getAuthHeaders() — le JWT est géré par l'intercepteur HTTP
    return this.http.get<ApiResponse<PrestatairelistModel>>(
      `${this.apiUrl}/prestataires/?page=${page}`
    ).pipe(
      tap(response => {
        this.totalItems  = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Liste sans pagination ─────────────────────────────────
  getListPrestataires(): Observable<PrestatairelistModel[]> {
    return this.http.get<PrestatairelistModel[]>(`${this.apiUrl}/allnopagin/prestataires/`);
  }

  // ── Récupérer par ID ──────────────────────────────────────
  getPrestataireById(id: string): Observable<PrestatairelistModel> {
    return this.http.get<PrestatairelistModel>(`${this.apiUrl}/prestataires/${id}/`);
  }

  // ── Créer ─────────────────────────────────────────────────
  createPrestataire(prestataire: Partial<PrestatairelistModel>): Observable<PrestatairelistModel> {
    return this.http.post<PrestatairelistModel>(`${this.apiUrl}/prestataires/`, prestataire);
  }

  // ── Mettre à jour ─────────────────────────────────────────
  updatePrestataire(prestataire: PrestatairelistModel): Observable<PrestatairelistModel> {
    return this.http.put<PrestatairelistModel>(
      `${this.apiUrl}/prestataires/${prestataire.id}/`, prestataire
    );
  }

  // ── Supprimer un élément ──────────────────────────────────
  deletePrestataire(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/prestataires/${id}/`);
  }

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultiplePrestataire(ids: number[]): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/prestataires/bulk_delete/`, {
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
