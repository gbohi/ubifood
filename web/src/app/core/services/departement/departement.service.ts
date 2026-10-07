import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { DepartementlistModel, ApiResponse } from 'src/app/store/Departement/departement.model';

@Injectable({ providedIn: 'root' })
export class DepartementService {

  // ✅ environment au lieu de hardcoding
  private apiUrl = `${environment.apiUrl}/api/api`;

  private currentPage  = 1;
  private totalItems   = 0;
  private itemsPerPage = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────
  // ✅ URL /services/ au lieu de /services/
  // ✅ Plus de getAuthHeaders() — JWT géré par l'intercepteur
  getAllDepartements(page: number = 1): Observable<ApiResponse<DepartementlistModel>> {
    this.currentPage = page;
    return this.http.get<ApiResponse<DepartementlistModel>>(
      `${this.apiUrl}/services/?page=${page}`
    ).pipe(
      tap(response => {
        this.totalItems  = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Liste sans pagination ─────────────────────────────────
  getListDepartements(): Observable<DepartementlistModel[]> {
    return this.http.get<DepartementlistModel[]>(
      `${this.apiUrl}/allnopagin/services/`
    );
  }

  // ── Récupérer par ID ──────────────────────────────────────
  getDepartementById(id: string): Observable<DepartementlistModel> {
    return this.http.get<DepartementlistModel>(
      `${this.apiUrl}/services/${id}/`
    );
  }

  // ── Créer ─────────────────────────────────────────────────
  createDepartement(departement: Partial<DepartementlistModel>): Observable<DepartementlistModel> {
    return this.http.post<DepartementlistModel>(
      `${this.apiUrl}/services/`, departement
    );
  }

  // ── Mettre à jour ─────────────────────────────────────────
  updateDepartement(departement: DepartementlistModel): Observable<DepartementlistModel> {
    return this.http.put<DepartementlistModel>(
      `${this.apiUrl}/services/${departement.id}/`, departement
    );
  }

  // ── Supprimer un élément ──────────────────────────────────
  deleteDepartement(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/services/${id}/`);
  }

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleDepartement(ids: number[]): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/services/bulk_delete/`, {
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
