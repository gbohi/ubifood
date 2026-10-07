// src/app/core/services/user-categoriesalarie/user-categoriesalarie.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { UserCategoriesalarieModel } from 'src/app/store/UserCategoriesalarie/user-categoriesalarie.model';

interface PaginatedResponse<T> { count: number; next: string | null; previous: string | null; results: T[]; }

@Injectable({ providedIn: 'root' })
export class UserCategoriesalarieService {
  private apiUrl = `${environment.apiUrl}/api/api`;
  constructor(private http: HttpClient) {}

  getByUser(userId: number): Observable<UserCategoriesalarieModel[]> {
    return this.http.get<PaginatedResponse<UserCategoriesalarieModel>>(
      `${this.apiUrl}/user-categoriesalaries/?user=${userId}`
    ).pipe(map(r => r.results));
  }
  create(data: Partial<UserCategoriesalarieModel>): Observable<UserCategoriesalarieModel> {
    return this.http.post<UserCategoriesalarieModel>(`${this.apiUrl}/user-categoriesalaries/`, data);
  }
  update(id: number, data: Partial<UserCategoriesalarieModel>): Observable<UserCategoriesalarieModel> {
    return this.http.put<UserCategoriesalarieModel>(`${this.apiUrl}/user-categoriesalaries/${id}/`, data);
  }
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/user-categoriesalaries/${id}/`);
  }
}
