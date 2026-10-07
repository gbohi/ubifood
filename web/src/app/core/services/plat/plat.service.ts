// src/app/core/services/plat/plat.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { PlatModel, ApiResponse, ApiError, StatistiqueGlobale } from 'src/app/store/Plat/plat.model';

@Injectable({
  providedIn: 'root'
})
export class PlatService {

  private apiUrl = `${environment.apiUrl}/api`;

  // Pagination locale — mise à jour à chaque appel getAllPlats()
  private currentPage = 1;
  private totalItems = 0;
  private readonly itemsPerPage = 10;

  constructor(private http: HttpClient) {}

  /**
   * Liste paginée des plats.
   * Le token JWT est injecté automatiquement par AuthInterceptor.
   */
  getAllPlats(page: number = 1): Observable<ApiResponse<PlatModel>> {
    this.currentPage = page;

    return this.http.get<ApiResponse<PlatModel>>(`${this.apiUrl}/api/plats/?page=${page}`)
      .pipe(
        tap((response) => {
          this.totalItems = response.count;
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Détail d'un plat par son ID
   */
  getPlatById(id: string): Observable<PlatModel> {
    return this.http.get<PlatModel>(`${this.apiUrl}/api/plats/${id}/`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Statistiques globales des plats
   */
  /*getStatistiquesGlobales(): Observable<StatistiqueGlobale> {
    return this.http.get<StatistiqueGlobale>(`${this.apiUrl}/api/plats/statistiques-globales/`)
      .pipe(catchError(this.handleError));
  }*/

  /**
   * Création d'un plat avec images (FormData).
   *
   * IMPORTANT : on ne passe PAS Content-Type manuellement.
   * Quand on envoie un FormData, le navigateur génère automatiquement
   * le header multipart/form-data avec le bon boundary.
   * Si on force Content-Type: application/json, le backend reçoit
   * un body mal formaté et ne peut pas lire les fichiers.
   *
   * AuthInterceptor ajoute uniquement Authorization: Bearer <token>,
   * sans toucher à Content-Type — c'est pour ça qu'on ne force pas
   * le Content-Type dans l'intercepteur.
   */
  createPlatWithFiles(formData: FormData): Observable<PlatModel> {
    return this.http.post<PlatModel>(`${this.apiUrl}/api/plats/`, formData)
      .pipe(catchError(this.handleError));
  }

  /**
   * Mise à jour partielle d'un plat avec images (PATCH + FormData)
   */
  updatePlatWithFiles(id: number, formData: FormData): Observable<PlatModel> {
    return this.http.patch<PlatModel>(`${this.apiUrl}/api/plats/${id}/`, formData)
      .pipe(catchError(this.handleError));
  }

  /**
   * Mise à jour complète d'un plat sans fichier (PUT + JSON)
   */
  updatePlat(plat: PlatModel): Observable<PlatModel> {
    return this.http.put<PlatModel>(`${this.apiUrl}/api/plats/${plat.id}/`, plat)
      .pipe(catchError(this.handleError));
  }

  /**
   * Suppression d'un plat
   */
  deletePlat(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/api/plats/${id}/`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Suppression multiple (bulk delete)
   *
   * HttpClient.delete() n'accepte pas de body nativement.
   * On utilise http.request() pour passer { ids } dans le body du DELETE.
   */
  deleteMultiplePlat(ids: number[]): Observable<any> {
    return this.http.request<any>('DELETE', `${this.apiUrl}/api/plats/bulk_delete/`, {
      body: { ids }
    }).pipe(catchError(this.handleError));
  }

  /**
   * Retourne les informations de pagination courantes.
   * Utilisé dans les effects après une suppression pour calculer
   * si on doit revenir à une page précédente.
   */
  getCurrentPageInfo(): Observable<{ currentPage: number; totalItems: number; itemsPerPage: number }> {
    return of({
      currentPage: this.currentPage,
      totalItems: this.totalItems,
      itemsPerPage: this.itemsPerPage,
    });
  }

  /**
   * Gestion centralisée des erreurs HTTP.
   * Transforme toute erreur Angular/HTTP en ApiError uniforme.
   */
  private handleError(error: HttpErrorResponse) {
    const apiError: ApiError = {
      status: error.status,
      message: 'Une erreur est survenue',
    };

    if (error.error instanceof ErrorEvent) {
      // Erreur réseau côté client
      apiError.message = `Erreur réseau : ${error.error.message}`;
    } else {
      // Erreur retournée par le serveur
      apiError.message = error.message;
      if (error.error && typeof error.error === 'object') {
        if (error.error.message) apiError.message = error.error.message;
        if (error.error.errors)  apiError.errors  = error.error.errors;
      }
    }

    console.error('Erreur API Plat :', apiError);
    return throwError(() => apiError);
  }
}
