// src/app/core/services/user/user.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { UserModel, ApiResponse } from 'src/app/store/User/user.model';

@Injectable({ providedIn: 'root' })
export class UserService {

  private apiUrl = `${environment.apiUrl}/api/api`;

  private currentPage  = 1;
  private totalItems   = 0;
  private itemsPerPage = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────
  getAllUsers(page: number = 1): Observable<ApiResponse<UserModel>> {
    this.currentPage = page;
    return this.http.get<ApiResponse<UserModel>>(
      `${this.apiUrl}/users/?page=${page}`
    ).pipe(
      tap(response => {
        this.totalItems   = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── ✅ Liste complète sans pagination (pour les selects) ──
  // Django : AllUserNopginListAPIView → /api/allnopagin/users/
  // Si cet endpoint n'existe pas encore, il faut l'ajouter dans urls.py + views.py
  getListUsers(): Observable<UserModel[]> {
    return this.http.get<UserModel[]>(`${this.apiUrl}/allnopagin/users/`);
  }

  // ── CRUD ──────────────────────────────────────────────────
  createUser(user: Partial<UserModel>): Observable<UserModel> {
    return this.http.post<UserModel>(`${this.apiUrl}/users/`, user);
  }

  updateUser(user: UserModel): Observable<UserModel> {
    return this.http.put<UserModel>(`${this.apiUrl}/users/${user.id}/`, user);
  }

  deleteUser(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/users/${id}/`);
  }

  deleteMultipleUser(ids: number[]): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/users/bulk_delete/`, {
      body: { ids }
    });
  }

  // ── Activation ────────────────────────────────────────────
  activerUser(id: number): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/users/${id}/activer/`, {});
  }

  desactiverUser(id: number): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/users/${id}/desactiver/`, {});
  }

  activerMultipleUsers(ids: number[]): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/users/activer-multiple/`, { ids });
  }

  desactiverMultipleUsers(ids: number[]): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/users/desactiver-multiple/`, { ids });
  }

  // ── Mot de passe ──────────────────────────────────────────
  changerMotDePasse(id: number, password: string): Observable<any> {
    return this.http.patch<any>(
      `${this.apiUrl}/users/${id}/changer-mot-de-passe/`, { password }
    );
  }

  // ── Pagination info ───────────────────────────────────────
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
