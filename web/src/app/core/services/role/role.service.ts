// src/app/core/services/role/role.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { RolelistModel, ApiResponse } from 'src/app/store/Role/role.model';

@Injectable({ providedIn: 'root' })
export class RoleService {

  private apiUrl = `${environment.apiUrl}/api/api`;

  private currentPage  = 1;
  private totalItems   = 0;
  private itemsPerPage = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────
  getAllRoles(page: number = 1): Observable<ApiResponse<RolelistModel>> {
    this.currentPage = page;
    return this.http.get<ApiResponse<RolelistModel>>(
      `${this.apiUrl}/groups/?page=${page}`
    ).pipe(
      tap(response => {
        this.totalItems   = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Liste complète sans pagination (pour le select dans User) ──
  // Django retourne toujours un objet paginé, on extrait .results
  getAllRolesNoPaginate(): Observable<RolelistModel[]> {
    return this.http.get<ApiResponse<RolelistModel>>(
      `${this.apiUrl}/groups/?page_size=1000`
    ).pipe(
      map(response => response.results ?? [])
    );
  }

  getRoleById(id: string): Observable<RolelistModel> {
    return this.http.get<RolelistModel>(`${this.apiUrl}/groups/${id}/`);
  }

  createRole(role: Partial<RolelistModel>): Observable<RolelistModel> {
    return this.http.post<RolelistModel>(`${this.apiUrl}/groups/`, role);
  }

  updateRole(role: RolelistModel): Observable<RolelistModel> {
    return this.http.put<RolelistModel>(`${this.apiUrl}/groups/${role.id}/`, role);
  }

  deleteRole(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/groups/${id}/`);
  }

  deleteMultipleRole(ids: number[]): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/groups/bulk_delete/`, {
      body: { ids }
    });
  }

  getCurrentPageInfo(): Observable<{
    currentPage:  number;
    totalItems:   number;
    itemsPerPage: number;
  }> {
    return of({
      currentPage:  this.currentPage,
      totalItems:   this.totalItems,
      itemsPerPage: this.itemsPerPage,
    });
  }
}
