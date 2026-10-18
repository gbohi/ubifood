// src/app/core/services/besoin/besoin.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import {
  BesoinlistModel, ApiResponse, StatistiqueGlobale,
  BesoinDocumentModel, BesoinServiceModel,
} from 'src/app/store/Besoin/besoin.model';

@Injectable({ providedIn: 'root' })
export class BesoinService {

  private apiUrl  = `${environment.apiUrl}/api/api`;
  // Création avec pièces jointes : /api/besoins/creer/ (hors routeur DRF)
  private apiUrl1 = `${environment.apiUrl}/api`;

  // Infos de pagination conservées en mémoire pour la gestion post-suppression
  private currentPage   = 1;
  private totalItems    = 0;
  private itemsPerPage  = 10;
  private currentSearch = '';

  constructor(private http: HttpClient) {}

  // ── Liste paginée (recherche serveur : référence, titre, description) ──
  getAllBesoins(page: number = 1, search?: string): Observable<ApiResponse<BesoinlistModel>> {
    this.currentPage = page;
    this.currentSearch = (search ?? '').trim();
    return this.http.get<ApiResponse<BesoinlistModel>>(
      `${this.apiUrl}/besoins/?page=${page}`
        + (this.currentSearch ? `&search=${encodeURIComponent(this.currentSearch)}` : '')
    ).pipe(
      tap(response => {
        this.totalItems   = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  getCurrentSearch(): string | undefined {
    return this.currentSearch || undefined;
  }

  // ── Récupérer par ID ──────────────────────────────────────
  getBesoinById(id: string | number): Observable<BesoinlistModel> {
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
  // POST /api/api/besoins/{id}/ajouter-documents/ — champ documents[]
  addDocuments(besoinId: number, files: File[]): Observable<BesoinDocumentModel[]> {
    const fd = new FormData();
    files.forEach(f => fd.append('documents[]', f, f.name));
    return this.http.post<BesoinDocumentModel[]>(
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

  // ── Services affectés à un besoin (BesoinService) ─────────
  addServiceToBesoin(besoinId: number, serviceId: number): Observable<BesoinServiceModel> {
    return this.http.post<BesoinServiceModel>(`${this.apiUrl}/besoin-services/`, {
      besoin: besoinId,
      service: serviceId,
      date_creation: new Date().toISOString(),
    });
  }

  removeServiceFromBesoin(besoinServiceId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/besoin-services/${besoinServiceId}/`);
  }

  // ── Créer (JSON simple, sans documents) ───────────────────
  createBesoin(
    besoin: Partial<BesoinlistModel>
  ): Observable<BesoinlistModel> {
    return this.http.post<BesoinlistModel>(
      `${this.apiUrl}/besoins/`, besoin
    );
  }

  // ── Créer avec documents (FormData — endpoint dédié) ──────
  // Django : BesoinCreateView + BesoinWithDocumentsSerializer
  // Champs : titre, description, typebesoin, priorite, etat, user,
  //          date_debut, date_fin, commentaire + documents[] (fichiers)
  // Réponse : { message, besoin_id }
  createBesoinWithDocuments(formData: FormData): Observable<{ message: string; besoin_id: number }> {
    return this.http.post<{ message: string; besoin_id: number }>(
      `${this.apiUrl1}/besoins/creer/`, formData
    );
  }

  // ── Créer depuis « Signaler une anomalie » (même endpoint) ─
  createNoAuthBesoin(formData: FormData): Observable<any> {
    return this.createBesoinWithDocuments(formData);
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
