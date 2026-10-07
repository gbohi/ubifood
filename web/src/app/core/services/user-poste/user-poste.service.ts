// src/app/core/services/user-poste/user-poste.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { UserPosteModel } from 'src/app/store/UserPoste/user-poste.model';

interface PaginatedResponse<T> { count: number; next: string | null; previous: string | null; results: T[]; }

@Injectable({ providedIn: 'root' })
export class UserPosteService {
  private apiUrl = `${environment.apiUrl}/api/api`;
  constructor(private http: HttpClient) {}

  getByUser(userId: number): Observable<UserPosteModel[]> {
    return this.http.get<PaginatedResponse<UserPosteModel>>(
      `${this.apiUrl}/user-postes/?user=${userId}`
    ).pipe(map(r => r.results));
  }
  create(data: Partial<UserPosteModel>): Observable<UserPosteModel> {
    return this.http.post<UserPosteModel>(`${this.apiUrl}/user-postes/`, data);
  }
  update(id: number, data: Partial<UserPosteModel>): Observable<UserPosteModel> {
    return this.http.put<UserPosteModel>(`${this.apiUrl}/user-postes/${id}/`, data);
  }
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/user-postes/${id}/`);
  }
}
