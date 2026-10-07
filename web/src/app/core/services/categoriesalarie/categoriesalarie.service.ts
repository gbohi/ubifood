import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { CategoriesalarielistModel, ApiResponse } from 'src/app/store/Categoriesalarie/categoriesalarie.model';

@Injectable({ providedIn: 'root' })
export class CategoriesalarieService {

  // ✅ Utilisation de environment au lieu de hardcoding
  private apiUrl = `${environment.apiUrl}/api/api`;

  // Infos de pagination conservées en mémoire pour la gestion post-suppression
  private currentPage   = 1;
  private totalItems    = 0;
  private itemsPerPage  = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────
  getAllCategoriesalaries(page: number = 1): Observable<ApiResponse<CategoriesalarielistModel>> {
    this.currentPage = page;
    // ✅ Plus de getAuthHeaders() — le JWT est géré par l'intercepteur HTTP
    return this.http.get<ApiResponse<CategoriesalarielistModel>>(
      `${this.apiUrl}/categoriesalaries/?page=${page}`
    ).pipe(
      tap(response => {
        this.totalItems  = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Liste sans pagination ─────────────────────────────────
  getListCategoriesalaries(): Observable<CategoriesalarielistModel[]> {
    return this.http.get<CategoriesalarielistModel[]>(`${this.apiUrl}/allnopagin/categoriesalaries/`);
  }

  // ── Récupérer par ID ──────────────────────────────────────
  getCategoriesalarieById(id: string): Observable<CategoriesalarielistModel> {
    return this.http.get<CategoriesalarielistModel>(`${this.apiUrl}/categoriesalaries/${id}/`);
  }

  // ── Créer ─────────────────────────────────────────────────
  createCategoriesalarie(categoriesalarie: Partial<CategoriesalarielistModel>): Observable<CategoriesalarielistModel> {
    return this.http.post<CategoriesalarielistModel>(`${this.apiUrl}/categoriesalaries/`, categoriesalarie);
  }

  // ── Mettre à jour ─────────────────────────────────────────
  updateCategoriesalarie(categoriesalarie: CategoriesalarielistModel): Observable<CategoriesalarielistModel> {
    return this.http.put<CategoriesalarielistModel>(
      `${this.apiUrl}/categoriesalaries/${categoriesalarie.id}/`, categoriesalarie
    );
  }

  // ── Supprimer un élément ──────────────────────────────────
  deleteCategoriesalarie(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/categoriesalaries/${id}/`);
  }

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleCategoriesalarie(ids: number[]): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/categoriesalaries/bulk_delete/`, {
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
