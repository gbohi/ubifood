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
        this.totalItems  = response.count;
        this.itemsPerPage = 10;
      })
    );
  }

  // ── Créer ─────────────────────────────────────────────────
  createUser(user: Partial<UserModel>): Observable<UserModel> {
    return this.http.post<UserModel>(`${this.apiUrl}/users/`, user);
  }

  // ── Mettre à jour ─────────────────────────────────────────
  updateUser(user: UserModel): Observable<UserModel> {
    return this.http.put<UserModel>(`${this.apiUrl}/users/${user.id}/`, user);
  }

  // ── Supprimer un élément ──────────────────────────────────
  deleteUser(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/users/${id}/`);
  }

  // ── Supprimer plusieurs éléments ──────────────────────────
  deleteMultipleUser(ids: number[]): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/users/bulk_delete/`, {
      body: { ids }
    });
  }

  // ── Activer un utilisateur ────────────────────────────────
  activerUser(id: number): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/users/${id}/activer/`, {});
  }

  // ── Désactiver un utilisateur ─────────────────────────────
  desactiverUser(id: number): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/users/${id}/desactiver/`, {});
  }

  // ── Activer plusieurs utilisateurs ───────────────────────
  activerMultipleUsers(ids: number[]): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/users/activer-multiple/`, { ids });
  }

  // ── Désactiver plusieurs utilisateurs ────────────────────
  desactiverMultipleUsers(ids: number[]): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/users/desactiver-multiple/`, { ids });
  }

  // ── Changer le mot de passe ───────────────────────────────
  changerMotDePasse(id: number, password: string): Observable<any> {
    return this.http.patch<any>(
      `${this.apiUrl}/users/${id}/changer-mot-de-passe/`, { password }
    );
  }

  // ── Info pagination courante ──────────────────────────────
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
