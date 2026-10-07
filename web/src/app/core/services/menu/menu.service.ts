// src/app/core/services/menu/menu.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, of, forkJoin, EMPTY } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { MenulistModel, ApiResponse, ApiError } from 'src/app/store/Menu/menu.model';

@Injectable({
  providedIn: 'root'
})
export class MenuService {

  private apiUrl = `${environment.apiUrl}/api/api`;

  // Pagination locale
  private currentPage = 1;
  private totalItems = 0;
  private readonly itemsPerPage = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────────

  getAllMenus(page: number = 1): Observable<ApiResponse<MenulistModel>> {
    this.currentPage = page;
    return this.http.get<ApiResponse<MenulistModel>>(`${this.apiUrl}/menus/?page=${page}`)
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

  // ── Création d'un menu avec ses plats ─────────────────────────
  /**
   * Le workflow Django est :
   *   1. POST /menus/         → crée le Menu (retourne l'objet avec son ID)
   *   2. POST /menu-plats/ x N → crée un MenuPlat par plat sélectionné
   *
   * On envoie { date_menu, agence, typeequipe, plat_ids[] } depuis le composant.
   * Le service sépare les champs Menu des plat_ids.
   */
  createMenu(data: any): Observable<MenulistModel> {
    const { plat_ids, ...menuData } = data;

    return this.http.post<MenulistModel>(`${this.apiUrl}/menus/`, menuData).pipe(
      switchMap((menu) => {
        // Si aucun plat sélectionné, on retourne le menu directement
        if (!plat_ids || plat_ids.length === 0) {
          return of(menu);
        }

        // Créer un MenuPlat par plat sélectionné (en parallèle avec forkJoin)
        const menuPlatRequests = plat_ids.map((platId: number) =>
          this.http.post(`${this.apiUrl}/menu-plats/`, {
            menu: menu.id,
            plat_id: platId   // ← corrigé : plat_id (write_only dans MenuPlatSerializer)
          })
        );

        return forkJoin(menuPlatRequests).pipe(
          switchMap(() => of(menu)) // Retourne le menu après création des MenuPlats
        );
      }),
      catchError(this.handleError)
    );
  }

  // ── Mise à jour d'un menu avec ses plats ──────────────────────
  /**
   * Workflow :
   *   1. PATCH /menus/{id}/           → met à jour les champs du Menu
   *   2. Supprime tous les anciens MenuPlat du menu
   *   3. Recrée les MenuPlat selon la nouvelle sélection
   */
  updateMenu(data: any): Observable<MenulistModel> {
    const { id, plat_ids, ...menuData } = data;

    return this.http.patch<MenulistModel>(`${this.apiUrl}/menus/${id}/`, menuData).pipe(
      switchMap((menu) => {
        if (!plat_ids) {
          // Pas de changement des plats — retourner directement
          return of(menu);
        }

        // Récupérer les MenuPlat existants pour ce menu
        return this.http.get<ApiResponse<any>>(`${this.apiUrl}/menu-plats/?menu=${id}`).pipe(
          switchMap((response) => {
            const existing = response.results;

            // Supprimer tous les anciens MenuPlat
            const deleteRequests = existing.length > 0
              ? existing.map((mp: any) =>
                  this.http.delete(`${this.apiUrl}/menu-plats/${mp.id}/`)
                )
              : [of(null)];

            return forkJoin(deleteRequests).pipe(
              switchMap(() => {
                // Recréer les nouveaux MenuPlat
                if (!plat_ids || plat_ids.length === 0) {
                  return of(menu);
                }

                const createRequests = plat_ids.map((platId: number) =>
                  this.http.post(`${this.apiUrl}/menu-plats/`, {
                    menu: id,
                    plat_id: platId   // ← corrigé : plat_id
                  })
                );

                return forkJoin(createRequests).pipe(
                  switchMap(() => of(menu))
                );
              })
            );
          })
        );
      }),
      catchError(this.handleError)
    );
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

  private handleError(error: HttpErrorResponse) {
    const apiError: ApiError = {
      status: error.status,
      message: 'Une erreur est survenue',
    };

    if (error.error instanceof ErrorEvent) {
      apiError.message = `Erreur réseau : ${error.error.message}`;
    } else {
      apiError.message = error.message;
      if (error.error && typeof error.error === 'object') {
        if (error.error.message) apiError.message = error.error.message;
        if (error.error.errors)  apiError.errors  = error.error.errors;
      }
    }

    console.error('Erreur API Menu :', apiError);
    return throwError(() => apiError);
  }
}
