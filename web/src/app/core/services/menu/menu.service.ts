// src/app/core/services/menu/menu.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { MenulistModel, ApiResponse, ApiError } from 'src/app/store/Menu/menu.model';
import { paramTri } from 'src/app/shared/tri-serveur';

@Injectable({
  providedIn: 'root'
})
export class MenuService {

  private apiUrl = `${environment.apiUrl}/api/api`;

  // Pagination locale
  private currentPage = 1;
  private currentOrdering = '';
  private currentSearch = '';
  private totalItems = 0;
  private readonly itemsPerPage = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────────

  getAllMenus(page: number = 1, search?: string, ordering?: string): Observable<ApiResponse<MenulistModel>> {
    this.currentPage = page;
    // Tri serveur (?ordering=) : conservé lors des rechargements tant qu'aucun nouveau tri n'est fourni
    if (ordering !== undefined) this.currentOrdering = ordering.trim();
    // Recherche serveur (?search= : agence, équipe) : conservée lors des rechargements
    if (search !== undefined) this.currentSearch = search.trim();
    const recherche = this.currentSearch ? `&search=${encodeURIComponent(this.currentSearch)}` : '';
    return this.http.get<ApiResponse<MenulistModel>>(`${this.apiUrl}/menus/?page=${page}${recherche}${paramTri(this.currentOrdering)}&gerees=1`)
      .pipe(
        tap((response) => { this.totalItems = response.count; }),
        catchError(this.handleError)
      );
  }

  // ── Liste sans pagination (pour les selects) ──────────────────

  getListMenus(): Observable<MenulistModel[]> {
    // On récupère tout via une grande page — à adapter si nécessaire
    return this.http.get<ApiResponse<MenulistModel>>(`${this.apiUrl}/menus/?page=1&page_size=1000`)
      .pipe(
        switchMap((response) => of(response.results)),
        catchError(this.handleError)
      );
  }

  // ── Création / mise à jour d'un menu avec ses plats ─────────
  // Le serveur enregistre le menu et ses plats (plat_ids) en une seule
  // opération : pas de menu à moitié enregistré si une requête échoue.

  createMenu(data: any): Observable<MenulistModel> {
    return this.http.post<MenulistModel>(`${this.apiUrl}/menus/`, data)
      .pipe(catchError(this.handleError));
  }

  updateMenu(data: any): Observable<MenulistModel> {
    const { id, ...menuData } = data;
    return this.http.patch<MenulistModel>(`${this.apiUrl}/menus/${id}/`, menuData)
      .pipe(catchError(this.handleError));
  }

  // ── Suppression simple ────────────────────────────────────────

  deleteMenu(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/menus/${id}/`)
      .pipe(catchError(this.handleError));
  }

  // ── Suppression multiple ──────────────────────────────────────

  deleteMultipleMenu(ids: number[]): Observable<any> {
    return this.http.request<any>('DELETE', `${this.apiUrl}/menus/bulk_delete/`, {
      body: { ids }
    }).pipe(catchError(this.handleError));
  }

  // ── Pagination ────────────────────────────────────────────────

  getCurrentPageInfo(): Observable<{ currentPage: number; totalItems: number; itemsPerPage: number }> {
    return of({
      currentPage: this.currentPage,
      totalItems: this.totalItems,
      itemsPerPage: this.itemsPerPage,
    });
  }

  // ── Gestion d'erreurs ─────────────────────────────────────────

  private handleError(error: HttpErrorResponse | string) {
    // L'ErrorInterceptor a déjà converti l'erreur en message lisible
    const apiError: ApiError = {
      status: typeof error === 'string' ? 0 : error.status,
      message: typeof error === 'string' ? error : (error.message || 'Une erreur est survenue'),
    };
    return throwError(() => apiError);
  }

  // ── Tri courant (conservé lors des rechargements) ──
  getCurrentOrdering(): string {
    return this.currentOrdering;
  }
}
