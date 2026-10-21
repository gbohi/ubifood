// src/app/core/services/accueil/accueil.service.ts
//
// Écran d'accueil (employé et gestionnaire) : GET /api/api/accueil/
// renvoie en une seule requête tout ce qu'il faut afficher.

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export type StatutJourEmploye =
  'retire' | 'a_retirer' | 'reserve' | 'non_retire' | 'a_reserver' | 'ferme' | 'pas_de_menu';

export type EtatJourGestion = 'termine' | 'en_cours' | 'ouvert' | 'ferme' | 'sans_menu';

export interface AccueilCommande {
  id: number;
  statut: 'en_attente' | 'retiree' | 'annulee' | string;
  date_menu: string;
  plat: string;
  plat_image_url: string | null;
  agence: string | null;
  equipe: string | null;
  menu_id: number;
}

export interface AccueilJour {
  date: string;
  libelle: string;
  statut: StatutJourEmploye;
  plat?: string;
  commande_id?: number;
  date_limite_commande?: string;
}

export interface AccueilProchain {
  date: string;
  libelle: string;
  agence: string;
  nb_plats: number;
  menu_id: number;
  date_limite_commande: string;
  date_limite_libelle: string;
}

export interface AccueilMois {
  repas: number;
  retires: number;
  annules: number;
  montant: number | string;
  repas_sans_tarif: number;
}

export interface AccueilServiceAgence {
  agence_id: number;
  agence: string;
  equipes: string[];
  nb_plats: number;
  commandees: number;
  servies: number;
  a_servir: number;
}

export interface AccueilJourGestion {
  date: string;
  libelle: string;
  etat: EtatJourGestion;
  commandees: number;
  retirees: number;
  agences_sans_menu: string[];
}

export interface AccueilAFaire {
  type: 'menu_manquant' | 'fermeture' | 'cloture';
  titre: string;
  detail: string;
  date?: string;
  annee?: number;
  mois?: number;
}

export interface AccueilGestion {
  agences: string[];
  service_du_jour: AccueilServiceAgence[];
  semaine: AccueilJourGestion[];
  a_faire: AccueilAFaire[];
}

export interface Accueil {
  date: string;
  repas_du_jour: AccueilCommande | null;
  semaine: AccueilJour[];
  prochain_a_reserver: AccueilProchain | null;
  mois: AccueilMois;
  recentes: AccueilCommande[];
  gestion?: AccueilGestion;
}

@Injectable({ providedIn: 'root' })
export class AccueilService {
  private apiUrl = `${environment.apiUrl}/api/api`;

  constructor(private http: HttpClient) {}

  getAccueil(): Observable<Accueil> {
    return this.http.get<Accueil>(`${this.apiUrl}/accueil/`);
  }
}

// ── Aides d'affichage (pas de locale « fr » enregistrée dans l'application) ──

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_COURTS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 2026-10-21 » → Date locale (sans décalage de fuseau) */
export function dateLocale(iso: string | Date): Date {
  if (iso instanceof Date) return iso;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « Mercredi 21 octobre 2026 » (sans année si `annee` est faux) */
export function dateLongue(iso: string | Date, annee = true): string {
  const d = dateLocale(iso);
  return majuscule(`${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}${annee ? ' ' + d.getFullYear() : ''}`);
}

/** « Lun. » */
export function jourCourt(iso: string): string {
  return JOURS_COURTS[dateLocale(iso).getDay()];
}

/** « 21/10 » */
export function jourMois(iso: string): string {
  const d = dateLocale(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** « octobre » */
export function nomMois(iso: string | Date): string {
  return MOIS[dateLocale(iso).getMonth()];
}

/** 7000 → « 7 000 F » */
export function montantF(val: number | string | null | undefined): string {
  const n = Math.round(Number(val) || 0);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F';
}

/** Prénom à afficher dans « Bonjour … » */
export function prenomUtilisateur(user: any): string {
  if (!user) return '';
  const p = String(user.prenom || user.first_name || '').trim();
  if (p) {
    const mot = p.split(/\s+/)[0];
    // « KOFFI » → « Koffi » ; un prénom déjà en casse mixte est laissé tel quel
    return mot === mot.toUpperCase()
      ? mot.toLowerCase().replace(/(^|[-'])(\p{L})/gu, (_, sep, l) => sep + l.toUpperCase())
      : mot;
  }
  return user.username || '';
}
