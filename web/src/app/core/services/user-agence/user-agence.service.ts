// src/app/core/services/user-agence/user-agence.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { UserAgenceModel } from 'src/app/store/UserAgence/user-agence.model';

interface PaginatedResponse<T> { count: number; next: string | null; previous: string | null; results: T[]; }

@Injectable({ providedIn: 'root' })
export class UserAgenceService {
  private apiUrl = `${environment.apiUrl}/api/api`;
  constructor(private http: HttpClient) {}

  getByUser(userId: number): Observable<UserAgenceModel[]> {
    return this.http.get<PaginatedResponse<UserAgenceModel>>(
      `${this.apiUrl}/user-agences/?user=${userId}`
    ).pipe(map(r => r.results));
  }
  create(data: Partial<UserAgenceModel>): Observable<UserAgenceModel> {
    return this.http.post<UserAgenceModel>(`${this.apiUrl}/user-agences/`, data);
  }
  update(id: number, data: Partial<UserAgenceModel>): Observable<UserAgenceModel> {
    return this.http.put<UserAgenceModel>(`${this.apiUrl}/user-agences/${id}/`, data);
  }
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/user-agences/${id}/`);
  }
}
