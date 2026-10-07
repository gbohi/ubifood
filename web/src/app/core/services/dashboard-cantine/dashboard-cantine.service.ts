// src/app/core/services/dashboard-cantine/dashboard-cantine.service.ts

import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  DashboardCantineData,
  DashboardCantineFilters,
} from 'src/app/store/DashboardCantine/dashboard-cantine.model';

@Injectable({ providedIn: 'root' })
export class DashboardCantineService {

  private apiUrl = `${environment.apiUrl}/api/api`;

  constructor(private http: HttpClient) {}

  getDashboard(filters: DashboardCantineFilters): Observable<DashboardCantineData> {
    let params = new HttpParams();

    if (filters.date_debut) {
      params = params.set('date_debut', filters.date_debut);
    }
    if (filters.date_fin) {
      params = params.set('date_fin', filters.date_fin);
    }
    if (filters.agences && filters.agences.length > 0) {
      params = params.set('agences', filters.agences.join(','));
    }
    if (filters.typeequipes && filters.typeequipes.length > 0) {
      params = params.set('typeequipes', filters.typeequipes.join(','));
    }
    if (filters.statuts && filters.statuts.length > 0) {
      params = params.set('statuts', filters.statuts.join(','));
    }

    return this.http.get<DashboardCantineData>(
      `${this.apiUrl}/dashboard-cantine/`, { params }
    );
  }
}
