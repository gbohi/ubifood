// src/app/core/services/plat-prestataire/plat-prestataire.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { PlatPrestataireModel } from 'src/app/store/PlatPrestataire/plat-prestataire.model';

interface PaginatedResponse<T> {
  count:    number;
  next:     string | null;
  previous: string | null;
  results:  T[];
}

@Injectable({ providedIn: 'root' })
export class PlatPrestataireService {

  private apiUrl = `${environment.apiUrl}/api/api`;

  constructor(private http: HttpClient) {}

  // ── Récupérer les tarifs d'un prestataire ─────────────────
  // ✅ Réponse paginée → on extrait results
  getByPrestataire(prestataireId: number): Observable<PlatPrestataireModel[]> {
    return this.http.get<PaginatedResponse<PlatPrestataireModel>>(
      `${this.apiUrl}/plat-prestataires/?prestataire=${prestataireId}`
    ).pipe(
      map(response => response.results)
    );
  }

  // ── Créer un tarif ────────────────────────────────────────
  create(data: Partial<PlatPrestataireModel>): Observable<PlatPrestataireModel> {
    return this.http.post<PlatPrestataireModel>(
      `${this.apiUrl}/plat-prestataires/`, data
    );
  }

  // ── Mettre à jour un tarif ────────────────────────────────
  update(id: number, data: Partial<PlatPrestataireModel>): Observable<PlatPrestataireModel> {
    return this.http.put<PlatPrestataireModel>(
      `${this.apiUrl}/plat-prestataires/${id}/`, data
    );
  }

  // ── Supprimer un tarif ────────────────────────────────────
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/plat-prestataires/${id}/`);
  }
}
