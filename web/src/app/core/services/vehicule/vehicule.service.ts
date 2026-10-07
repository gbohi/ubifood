// src/app/core/services/vehicule/vehicule.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { VehiculelistModel, ApiResponse } from 'src/app/store/Vehicule/vehicule.model';

@Injectable({ providedIn: 'root' })
export class VehiculeService {

  // ✅ Utilisation de environment au lieu de hardcoding
  private apiUrl = `${environment.apiUrl}/api/api`;

  // Infos de pagination conservées en mémoire pour la gestion post-suppression
  private currentPage  = 1;
  private totalItems   = 0;
  private itemsPerPage = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────
  getAllVehicules(page: number = 1): Observable<ApiResponse<VehiculelistModel>> {
    this.currentPage = page;
    // ✅ Plus de getAuthHeaders() — le JWT est géré par l'intercepteur HTTP
    return this.http.get<ApiResponse<VehiculelistModel>>(
      `${this.apiUrl}/vehicules/?page=${page}`
    ).pipe(
      tap(response => {
        this.totalItems   = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Liste sans pagination ─────────────────────────────────
  getListVehicules(): Observable<VehiculelistModel[]> {
    return this.http.get<VehiculelistModel[]>(
      `${this.apiUrl}/allnopagin/vehicules/`
    );
  }

  // ── Récupérer par ID ──────────────────────────────────────
  getVehiculeById(id: string): Observable<VehiculelistModel> {
    return this.http.get<VehiculelistModel>(
      `${this.apiUrl}/vehicules/${id}/`
    );
  }

  // ── Créer ─────────────────────────────────────────────────
  createVehicule(
    vehicule: Partial<VehiculelistModel>
  ): Observable<VehiculelistModel> {
    return this.http.post<VehiculelistModel>(
      `${this.apiUrl}/vehicules/`, vehicule
    );
  }

  // ── Mettre à jour ─────────────────────────────────────────
  updateVehicule(
    vehicule: VehiculelistModel
  ): Observable<VehiculelistModel> {
    return this.http.put<VehiculelistModel>(
      `${this.apiUrl}/vehicules/${vehicule.id}/`, vehicule
    );
  }

  // ── Supprimer un élément ──────────────────────────────────
  deleteVehicule(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/vehicules/${id}/`);
  }

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleVehicule(ids: number[]): Observable<any> {
    return this.http.delete<any>(
      `${this.apiUrl}/vehicules/bulk_delete/`, { body: { ids } }
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
