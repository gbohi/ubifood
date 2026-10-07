// src/app/core/services/agence-prestataire/agence-prestataire.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { AgencePrestataireModel } from 'src/app/store/AgencePrestataire/agence-prestataire.model';

interface PaginatedResponse<T> {
  count:    number;
  next:     string | null;
  previous: string | null;
  results:  T[];
}

@Injectable({ providedIn: 'root' })
export class AgencePrestataireService {

  private apiUrl = `${environment.apiUrl}/api/api`;

  constructor(private http: HttpClient) {}

  // ── Récupérer les agences d'un prestataire ────────────────
  // ✅ Réponse paginée → on extrait results
  getByPrestataire(prestataireId: number): Observable<AgencePrestataireModel[]> {
    return this.http.get<PaginatedResponse<AgencePrestataireModel>>(
      `${this.apiUrl}/agence-prestataires/?prestataire=${prestataireId}`
    ).pipe(
      map(response => response.results)
    );
  }

  // ── Créer une liaison agence-prestataire ──────────────────
  create(data: Partial<AgencePrestataireModel>): Observable<AgencePrestataireModel> {
    return this.http.post<AgencePrestataireModel>(
      `${this.apiUrl}/agence-prestataires/`, data
    );
  }

  // ── Mettre à jour une liaison ─────────────────────────────
  update(id: number, data: Partial<AgencePrestataireModel>): Observable<AgencePrestataireModel> {
    return this.http.put<AgencePrestataireModel>(
      `${this.apiUrl}/agence-prestataires/${id}/`, data
    );
  }

  // ── Supprimer une liaison ─────────────────────────────────
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/agence-prestataires/${id}/`);
  }
}
