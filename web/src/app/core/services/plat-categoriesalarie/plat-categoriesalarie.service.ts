// src/app/core/services/plat-categoriesalarie/plat-categoriesalarie.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { PlatCategoriesalarieModel } from 'src/app/store/PlatCategoriesalarie/plat-categoriesalarie.model';

interface PaginatedResponse<T> {
  count:    number;
  next:     string | null;
  previous: string | null;
  results:  T[];
}

@Injectable({ providedIn: 'root' })
export class PlatCategoriesalarieService {

  private apiUrl = `${environment.apiUrl}/api/api`;

  constructor(private http: HttpClient) {}

  // ── Récupérer les tarifs d'une catégorie salarié ──────────
  // ✅ Réponse paginée → on extrait results
  getByCategoriesalarie(categoriesalarieId: number): Observable<PlatCategoriesalarieModel[]> {
    return this.http.get<PaginatedResponse<PlatCategoriesalarieModel>>(
      `${this.apiUrl}/plat-categoriesalaries/?categoriesalarie=${categoriesalarieId}`
    ).pipe(
      map(response => response.results)
    );
  }

  // ── Créer un tarif ────────────────────────────────────────
  create(data: Partial<PlatCategoriesalarieModel>): Observable<PlatCategoriesalarieModel> {
    return this.http.post<PlatCategoriesalarieModel>(
      `${this.apiUrl}/plat-categoriesalaries/`, data
    );
  }

  // ── Mettre à jour un tarif ────────────────────────────────
  update(id: number, data: Partial<PlatCategoriesalarieModel>): Observable<PlatCategoriesalarieModel> {
    return this.http.put<PlatCategoriesalarieModel>(
      `${this.apiUrl}/plat-categoriesalaries/${id}/`, data
    );
  }

  // ── Supprimer un tarif ────────────────────────────────────
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/plat-categoriesalaries/${id}/`);
  }
}
