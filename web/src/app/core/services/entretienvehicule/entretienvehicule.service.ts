import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { EntretienVehiculelistModel, ApiResponse, ApiError } from 'src/app/store/Entretienvehicule/entretienvehicule.model';

@Injectable({
  providedIn: 'root'
})
export class EntretienvehiculeService {
  private apiUrl = `${environment.apiUrl}/api/api`;
  
  // Variables pour stocker les informations de pagination
  private currentPage = 1;
  private totalItems = 0;
  private itemsPerPage = 10; // Valeur par défaut selon votre configuration REST_FRAMEWORK.PAGE_SIZE

  constructor(private http: HttpClient) { }

  /**
   * Récupère les Entretienvehicule avec pagination
   */
  getAllEntretienvehicules(page: number = 1): Observable<ApiResponse<EntretienVehiculelistModel>> {
    const options = { headers: this.getAuthHeaders() };
    this.currentPage = page; // Mise à jour de la page courante
    
    return this.http.get<ApiResponse<EntretienVehiculelistModel>>(`${this.apiUrl}/entretienvehicules/?page=${page}`, options)
      .pipe(
        tap(response => {
          // Stocker les informations de pagination pour les utiliser plus tard
          this.totalItems = response.count;
          this.itemsPerPage = 10; // Fixe selon votre configuration REST_FRAMEWORK
          
          console.log(`Pagination: page ${this.currentPage}, total ${this.totalItems}, par page ${this.itemsPerPage}`);
        }),
        catchError(this.handleError)
      );
  }

  /**
     * Récuperer les Entretienvehicules sans pagination
     */
  
    getListEntretienvehicules(): Observable<EntretienVehiculelistModel[]> {
      //const options = { headers: this.getAuthHeaders() };
    
      return this.http.get<EntretienVehiculelistModel[]>(`${this.apiUrl}/allnopagin/entretienvehicules/`)
        .pipe(
          tap(response => {
            console.log(`Total non paginé : ${response.length}`);
          }),
          catchError(this.handleError)
        );
    }
    

  /**
   * Récupère un Entretienvehicule par son ID
   */
  getEntretienvehiculeById(id: string): Observable<EntretienVehiculelistModel> {
    const options = { headers: this.getAuthHeaders() };
    return this.http.get<EntretienVehiculelistModel>(`${this.apiUrl}/entretienvehicules/${id}/`, options)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Crée un nouveau Entretienvehicule
   */
  createEntretienvehicule(entretienvehicule: Partial<EntretienVehiculelistModel>): Observable<EntretienVehiculelistModel> {
    const options = { headers: this.getAuthHeaders() };
    return this.http.post<EntretienVehiculelistModel>(`${this.apiUrl}/entretienvehicules/`, entretienvehicule, options)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Met à jour un Entretienvehicule existant
   */
  updateEntretienvehicule(entretienvehicule: EntretienVehiculelistModel): Observable<EntretienVehiculelistModel> {
    const options = { headers: this.getAuthHeaders() };
    return this.http.put<EntretienVehiculelistModel>(`${this.apiUrl}/entretienvehicules/${entretienvehicule.id}/`, entretienvehicule, options)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Supprime un Entretienvehicule
   */
  deleteEntretienvehicule(id: string): Observable<void> {
    const options = { headers: this.getAuthHeaders() };
    return this.http.delete<void>(`${this.apiUrl}/entretienvehicules/${id}/`, options)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Supprime plusieurs Entretienvehicule
   */
  deleteMultipleEntretienvehicule(ids: number[]): Observable<any> {
    const options = { 
      headers: this.getAuthHeaders(),
      body: { ids }
    };
    return this.http.delete<any>(`${this.apiUrl}/entretienvehicules/bulk_delete/`, options)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Obtenir les informations actuelles de pagination
   * Cette méthode est utilisée après les suppressions pour déterminer 
   * si la page actuelle existe toujours
   */
  getCurrentPageInfo(): Observable<{currentPage: number, totalItems: number, itemsPerPage: number}> {
    return of({
      currentPage: this.currentPage,
      totalItems: this.totalItems,
      itemsPerPage: this.itemsPerPage
    });
  }

  /**
   * Crée les en-têtes HTTP avec le token d'authentification
   */
  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('access-token');
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token || ''}`
    });
  }

  /**
   * Gestion centralisée des erreurs HTTP
   */
  private handleError(error: HttpErrorResponse) {
    let errorMessage = '';
    let apiError: ApiError = {
      status: error.status,
      message: 'Une erreur est survenue'
    };
    
    if (error.error instanceof ErrorEvent) {
      // Erreur côté client
      apiError.message = `Erreur: ${error.error.message}`;
    } else {
      // Erreur côté serveur
      apiError = {
        status: error.status,
        message: error.message
      };
      
      // Extraction des erreurs de validation si disponibles
      if (error.error && typeof error.error === 'object') {
        if (error.error.message) {
          apiError.message = error.error.message;
        }
        if (error.error.errors) {
          apiError.errors = error.error.errors;
        }
      }
    }
    
    console.error('Erreur API:', apiError);
    return throwError(() => apiError);
  }
}

