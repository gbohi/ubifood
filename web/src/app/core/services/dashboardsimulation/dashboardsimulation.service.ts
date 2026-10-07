import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { environment } from 'src/environments/environment';
import { SimulationListResponse } from 'src/app/store/Dashboardsimulation/dashboardsimulation.model';

@Injectable({
  providedIn: 'root'
})
export class DashboardsimulationService {
  private apiUrl = `${environment.apiUrl}/api/api`;

  constructor(private http: HttpClient) {}

  getDashboardSimulationNoPag(annee: number): Observable<SimulationListResponse> {
    let params = new HttpParams().set('annee', annee.toString());
    const options = { headers: this.getAuthHeaders() };
    //return this.http.get<SimulationListResponse>((`${this.apiUrl}/simulation/list/`), { params });
    return this.http.get<SimulationListResponse>((`${this.apiUrl}/simulationsalaire/list/`), options);
  }

  getDashboardSimulation(annee_debut?: number, annee_fin?: number, salaire_min?: number, salaire_max?: number): Observable<SimulationListResponse> {
    let params = new HttpParams();
   
    if (annee_debut) {
      params = params.set('annee_debut', annee_debut);
    }

    if (annee_fin) {
      params = params.set('annee_fin', annee_fin);
    }

    if (salaire_min) {
      params = params.set('salaire_min', salaire_min);
    }

    if (salaire_max) {
      params = params.set('salaire_max', salaire_max);
    }
    const options = {
      headers: this.getAuthHeaders(),
      params: params
    };
    return this.http.get<SimulationListResponse>((`${this.apiUrl}/simulation/`), options);
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


}