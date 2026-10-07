// src/app/core/services/user-service/user-service.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { UserServiceModel } from 'src/app/store/UserService/user-service.model';

interface PaginatedResponse<T> { count: number; next: string | null; previous: string | null; results: T[]; }

@Injectable({ providedIn: 'root' })
export class UserServiceService {
  private apiUrl = `${environment.apiUrl}/api/api`;
  constructor(private http: HttpClient) {}

  getByUser(userId: number): Observable<UserServiceModel[]> {
    return this.http.get<PaginatedResponse<UserServiceModel>>(
      `${this.apiUrl}/user-services/?user=${userId}`
    ).pipe(map(r => r.results));
  }
  create(data: Partial<UserServiceModel>): Observable<UserServiceModel> {
    return this.http.post<UserServiceModel>(`${this.apiUrl}/user-services/`, data);
  }
  update(id: number, data: Partial<UserServiceModel>): Observable<UserServiceModel> {
    return this.http.put<UserServiceModel>(`${this.apiUrl}/user-services/${id}/`, data);
  }
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/user-services/${id}/`);
  }
}
