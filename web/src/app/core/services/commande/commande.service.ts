// src/app/core/services/commande/commande.service.ts

import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  CommandeModel,
  CommandeListModel,
  CommandeCreatePayload,
  CommandeParUserModel,
  RechercheParBadgeResult,
  RetraitModel,
  RetraitCreatePayload,
} from 'src/app/store/Commande/commande.model';

@Injectable({ providedIn: 'root' })
export class CommandeService {

  private apiUrl = `${environment.apiUrl}/api/api`;

  constructor(private http: HttpClient) {}

  // ── Mes commandes (agent connecté) ──────────────────────────
  getMesCommandes(filters?: { statut?: string; date_gte?: string }): Observable<CommandeModel[]> {
    let params = new HttpParams();
    if (filters?.statut)   params = params.set('statut', filters.statut);
    if (filters?.date_gte) params = params.set('menu__date_menu__gte', filters.date_gte);
    return this.http.get<CommandeModel[]>(`${this.apiUrl}/commandes/mes-commandes/`, { params });
  }

  // ── Vue gestionnaire : commandes groupées par user pour un menu
  getCommandesParMenu(menuId: number): Observable<CommandeParUserModel[]> {
    const params = new HttpParams().set('menu', menuId.toString());
    return this.http.get<CommandeParUserModel[]>(`${this.apiUrl}/commandes/par-menu/`, { params });
  }

  // ── Vue admin : commandes par agence et période (liste plate) ─
  getCommandesParAgencePeriode(filters: {
    date_debut?: string;
    date_fin?:   string;
    agence?:     number;
    typeequipe?: number;
    statut?:     string;
  }): Observable<CommandeModel[]> {
    let params = new HttpParams();
    if (filters.date_debut) params = params.set('date_debut', filters.date_debut);
    if (filters.date_fin)   params = params.set('date_fin',   filters.date_fin);
    if (filters.agence)     params = params.set('agence',     filters.agence.toString());
    if (filters.typeequipe) params = params.set('typeequipe', filters.typeequipe.toString());
    if (filters.statut)     params = params.set('statut',     filters.statut);
    return this.http.get<CommandeModel[]>(
      `${this.apiUrl}/commandes/par-agence-periode/`, { params }
    );
  }

  // ── Recherche agent par badge pour le retrait ─────────────────
  rechercheParBadge(badge: string, menuId: number): Observable<RechercheParBadgeResult> {
    const params = new HttpParams()
      .set('badge', badge)
      .set('menu',  menuId.toString());
    return this.http.get<RechercheParBadgeResult>(
      `${this.apiUrl}/commandes/recherche-par-badge/`, { params }
    );
  }

  // ── Liste paginée (admin) ──────────────────────────────────
  getCommandes(filters?: {
    page?:     number;
    menu?:     number;
    statut?:   string;
    agence?:   number;
    date_gte?: string;
    date_lte?: string;
  }): Observable<CommandeListModel> {
    let params = new HttpParams();
    if (filters?.page)     params = params.set('page',                 filters.page.toString());
    if (filters?.menu)     params = params.set('menu',                 filters.menu.toString());
    if (filters?.statut)   params = params.set('statut',               filters.statut);
    if (filters?.agence)   params = params.set('menu__agence',         filters.agence.toString());
    if (filters?.date_gte) params = params.set('menu__date_menu__gte', filters.date_gte);
    if (filters?.date_lte) params = params.set('menu__date_menu__lte', filters.date_lte);
    return this.http.get<CommandeListModel>(`${this.apiUrl}/commandes/`, { params });
  }

  // ── Créer une commande ─────────────────────────────────────
  createCommande(payload: CommandeCreatePayload): Observable<CommandeModel> {
    return this.http.post<CommandeModel>(`${this.apiUrl}/commandes/`, payload);
  }

  // ── Annuler une commande ───────────────────────────────────
  annulerCommande(id: number): Observable<CommandeModel> {
    return this.http.patch<CommandeModel>(`${this.apiUrl}/commandes/${id}/annuler/`, {});
  }

  // ── Retrait ───────────────────────────────────────────────
  createRetrait(payload: RetraitCreatePayload): Observable<RetraitModel> {
    return this.http.post<RetraitModel>(`${this.apiUrl}/retraits/`, payload);
  }

  getRetraits(filters?: { menu?: number; user?: number }): Observable<{ results: RetraitModel[] }> {
    let params = new HttpParams();
    if (filters?.menu) params = params.set('menu', filters.menu.toString());
    if (filters?.user) params = params.set('user', filters.user.toString());
    return this.http.get<{ results: RetraitModel[] }>(`${this.apiUrl}/retraits/`, { params });
  }

  // ── Utilitaire : délai 48h ────────────────────────────────
  isDelaiOk(dateMenu: string): boolean {
    const menuDate = new Date(dateMenu);
    menuDate.setHours(0, 0, 0, 0);
    const deadline = new Date(menuDate.getTime() - 48 * 60 * 60 * 1000);
    return new Date() < deadline;
  }
}
