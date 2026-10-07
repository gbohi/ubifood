// src/app/core/services/besoin/besoin.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { BesoinlistModel, ApiResponse, StatistiqueGlobale } from 'src/app/store/Besoin/besoin.model';

@Injectable({ providedIn: 'root' })
export class BesoinService {

  // ✅ Utilisation de environment au lieu de hardcoding
  private apiUrl  = `${environment.apiUrl}/api/api`;
  // ⚠️ Endpoint public sans /api/api (pour createNoAuthBesoin)
  private apiUrl1 = `${environment.apiUrl}/api`;

  // Infos de pagination conservées en mémoire pour la gestion post-suppression
  private currentPage  = 1;
  private totalItems   = 0;
  private itemsPerPage = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────
  getAllBesoins(page: number = 1): Observable<ApiResponse<BesoinlistModel>> {
    this.currentPage = page;
    // ✅ Plus de getAuthHeaders() — le JWT est géré par l'intercepteur HTTP
    return this.http.get<ApiResponse<BesoinlistModel>>(
      `${this.apiUrl}/besoins/?page=${page}`
    ).pipe(
      tap(response => {
        this.totalItems   = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Récupérer par ID ──────────────────────────────────────
  getBesoinById(id: string): Observable<BesoinlistModel> {
    return this.http.get<BesoinlistModel>(
      `${this.apiUrl}/besoins/${id}/`
    );
  }

  // ── Statistiques globales ─────────────────────────────────
  getStatistiquesGlobales(): Observable<StatistiqueGlobale> {
    return this.http.get<StatistiqueGlobale>(
      `${this.apiUrl}/besoins/statistiques-globales/`
    );
  }

  // ── Ajouter des documents à un besoin existant ───────────
  // POST /api/api/besoins/{id}/ajouter-documents/
  // Champ : documents[] (fichiers)
  addDocuments(besoinId: number, files: File[]): Observable<any> {
    const fd = new FormData();
    files.forEach(f => fd.append('documents[]', f, f.name));
    return this.http.post<any>(
      `${this.apiUrl}/besoins/${besoinId}/ajouter-documents/`, fd
    );
  }

  // ── Supprimer un document spécifique ─────────────────────
  // DELETE /api/api/besoins/{besoinId}/supprimer-document/?document_id={docId}
  deleteDocument(besoinId: number, documentId: number): Observable<any> {
    return this.http.delete<any>(
      `${this.apiUrl}/besoins/${besoinId}/supprimer-document/?document_id=${documentId}`
    );
  }

  // ── Créer (authentifié — JSON simple, sans documents) ────────
  createBesoin(
    besoin: Partial<BesoinlistModel>
  ): Observable<BesoinlistModel> {
    return this.http.post<BesoinlistModel>(
      `${this.apiUrl}/besoins/`, besoin
    );
  }

  // ── Créer avec documents (FormData — endpoint dédié) ──────
  // ✅ Utilisé par le formulaire admin avec pièces jointes
  // Django : BesoinCreateView + BesoinWithDocumentsSerializer
  // Champs : titre, description, typebesoin, priorite, etat, user,
  //          date_debut, date_fin, commentaire + documents[] (fichiers)
  createBesoinWithDocuments(formData: FormData): Observable<any> {
    return this.http.post<any>(
      `${this.apiUrl1}/besoins/creer/`, formData
    );
  }

  // ── Créer (sans authentification — FormData public) ───────
  // ⚠️ Endpoint public — pas d'intercepteur JWT
  createNoAuthBesoin(formData: FormData): Observable<any> {
    return this.http.post<any>(
      `${this.apiUrl1}/besoins/creer/`, formData
    );
  }

  // ── Mettre à jour ─────────────────────────────────────────
  updateBesoin(
    besoin: BesoinlistModel
  ): Observable<BesoinlistModel> {
    return this.http.put<BesoinlistModel>(
      `${this.apiUrl}/besoins/${besoin.id}/`, besoin
    );
  }

  // ── Supprimer un élément ──────────────────────────────────
  deleteBesoin(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/besoins/${id}/`);
  }

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleBesoin(ids: number[]): Observable<any> {
    return this.http.delete<any>(
      `${this.apiUrl}/besoins/bulk_delete/`, { body: { ids } }
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
