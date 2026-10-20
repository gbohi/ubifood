// src/app/core/services/user/user.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { UserModel, ApiResponse } from 'src/app/store/User/user.model';
import { paramTri } from 'src/app/shared/tri-serveur';

@Injectable({ providedIn: 'root' })
export class UserService {

  private apiUrl = `${environment.apiUrl}/api/api`;

  private currentPage  = 1;
  private currentOrdering = '';
  private currentSearch = '';
  private currentFilters: Record<string, string> = {};
  private totalItems   = 0;
  private itemsPerPage = 10;

  constructor(private http: HttpClient) {}

  // ── Liste paginée ─────────────────────────────────────────
  getAllUsers(page: number = 1, search?: string, ordering?: string, filtres?: Record<string, string>): Observable<ApiResponse<UserModel>> {
    this.currentPage = page;
    // Recherche serveur (?search= sur nom, prénom, e-mail, identifiant) : conservée lors des rechargements
    if (search !== undefined) this.currentSearch = search.trim();
    // Tri serveur (?ordering=) : conservé lors des rechargements tant qu'aucun nouveau tri n'est fourni
    if (ordering !== undefined) this.currentOrdering = ordering.trim();
    // Recherche avancée (filtres serveur) : conservée lors des rechargements et de la pagination
    if (filtres !== undefined) this.currentFilters = { ...filtres };
    const paramsFiltres = Object.entries(this.currentFilters)
      .filter(([, v]) => v !== undefined && v !== null && `${v}`.trim() !== '')
      .map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(`${v}`.trim())}`)
      .join('');
    return this.http.get<ApiResponse<UserModel>>(
      `${this.apiUrl}/users/?page=${page}${this.currentSearch ? `&search=${encodeURIComponent(this.currentSearch)}` : ''}${paramTri(this.currentOrdering)}${paramsFiltres}`
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
  /** old_password : obligatoire quand on change SON propre mot de passe */
  changerMotDePasse(id: number, password: string, old_password?: string): Observable<any> {
    const body: any = { password };
    if (old_password) body.old_password = old_password;
    return this.http.patch<any>(`${this.apiUrl}/users/${id}/changer-mot-de-passe/`, body);
  }

  // ── Mot de passe oublié (public, code par SMS) ───────────
  demanderCodeReinitialisation(username: string): Observable<{ message: string; contact_masque?: string }> {
    return this.http.post<any>(`${this.apiUrl}/users/forgot-password/`, { username });
  }

  verifierCodeReinitialisation(username: string, code: string): Observable<{ reset_token: string }> {
    return this.http.post<any>(`${this.apiUrl}/users/verify-code/`, { username, code });
  }

  reinitialiserMotDePasse(username: string, reset_token: string, password: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/users/reset-password/`, { username, reset_token, password });
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

  // ── Tri courant (conservé lors des rechargements) ──
  getCurrentOrdering(): string {
    return this.currentOrdering;
  }
}
