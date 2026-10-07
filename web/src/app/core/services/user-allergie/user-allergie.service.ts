// src/app/core/services/user-allergie/user-allergie.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { UserAllergieModel } from 'src/app/store/UserAllergie/user-allergie.model';

interface PaginatedResponse<T> { count: number; next: string | null; previous: string | null; results: T[]; }

@Injectable({ providedIn: 'root' })
export class UserAllergieService {
  private apiUrl = `${environment.apiUrl}/api/api`;
  constructor(private http: HttpClient) {}

  getByUser(userId: number): Observable<UserAllergieModel[]> {
    return this.http.get<PaginatedResponse<UserAllergieModel>>(
      `${this.apiUrl}/user-allergies/?user=${userId}`
    ).pipe(map(r => r.results));
  }
  create(data: Partial<UserAllergieModel>): Observable<UserAllergieModel> {
    return this.http.post<UserAllergieModel>(`${this.apiUrl}/user-allergies/`, data);
  }
  update(id: number, data: Partial<UserAllergieModel>): Observable<UserAllergieModel> {
    return this.http.put<UserAllergieModel>(`${this.apiUrl}/user-allergies/${id}/`, data);
  }
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/user-allergies/${id}/`);
  }
}
