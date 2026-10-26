// src/app/core/services/statistiques/statistiques.service.ts
//
// Statistiques de la cantine (gestionnaires et administrateurs) :
//   GET /api/api/statistiques/                    page « Cantine › Statistiques » (resume=1 : chiffres clés)
//   GET /api/api/statistiques/repas-categories/   service par repas et par catégorie de salarié
//   GET /api/api/statistiques/detail/             liste nominative d'un onglet (commandés, servis…)
// Définitions (serveur, api/statistiques.py) : commandés = non annulés ; servis = retirés ;
// à servir = en attente, menu aujourd'hui ou à venir ; non retirés = en attente, menu passé.

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export type ListeDetail = 'commandes' | 'servis' | 'a_servir' | 'non_retires';

export interface FiltresStats {
  debut: string;
  fin: string;
  agence?: number | string | null;
  typeequipe?: number | string | null;
}

export interface Compteurs {
  commandes: number;
  servis: number;
  a_servir: number;
  non_retires: number;
  annulees?: number;
  taux_retrait: number | null;
  note?: number | null;
  nb_avis?: number;
}

export interface Kpis extends Compteurs {
  annulees: number;
  note_moyenne: number | null;
  nb_avis: number;
}

export interface PeriodeStats {
  debut: string;
  fin: string;
  aujourdhui: string;
  en_cours: boolean;
  precedente?: { debut: string; fin: string };
}

export interface LigneRepas extends Compteurs {
  plat_id: number;
  plat: string;
  agences: string[];
}

export interface LigneCategorie extends Compteurs {
  categorie_id: number | null;
  categorie: string | null;
}

export interface LigneMois extends Compteurs {
  annee: number;
  mois: number;
  en_cours: boolean;
}

export interface LigneAgence extends Compteurs {
  agence_id: number;
  agence: string;
}

export interface Statistiques {
  periode: PeriodeStats;
  agences: string[];
  kpis: Kpis;
  precedent: Kpis;
  par_mois: LigneMois[];
  par_agence: LigneAgence[];
  evolution: { date: string; commandes: number; servis: number; futur: boolean }[];
  par_repas: LigneRepas[];
  par_categorie: LigneCategorie[];
  total_repas: Compteurs;
  par_type_plat: { type_plat: string; commandes: number }[];
  classement_plats: { plat_id: number; plat: string; note: number; nb_avis: number; commandes: number;
                      servis: number; taux_avis: number | null }[];
  non_retires_semaine: { semaine: string; non_retires: number; en_cours: boolean }[];
  perte_non_retires: { montant: number; repas: number; repas_sans_tarif: number };
  annulations: { annee: number; mois: number; par_agent: number; par_gestionnaire: number }[];
  jours: { jour: number; libelle: string; nb_jours: number; moyenne: number }[];
  jours_periode: { debut: string; fin: string };
}

export interface RepasCategories {
  periode: PeriodeStats;
  agences: string[];
  par_repas: LigneRepas[];
  par_categorie: LigneCategorie[];
  total: Compteurs;
}

export interface LigneDetail {
  commande_id: number;
  user_id: number;
  matricule: string;
  nom: string;
  prenom: string;
  categorie: string | null;
  poste: string | null;
  agence: string | null;
  equipe: string | null;
  date_menu: string;
  plat: string;
  statut: 'servi' | 'a_servir' | 'non_retire';
  heure_retrait: string | null;
}

export interface DetailService {
  liste: ListeDetail;
  periode: PeriodeStats;
  compteurs: Record<ListeDetail, number>;
  count: number;
  page: number;
  page_size: number;
  tronque: boolean;
  results: LigneDetail[];
}

export interface FiltresDetail extends FiltresStats {
  plat?: number | null;
  /** id de catégorie, ou « aucune » pour les agents sans catégorie */
  categorie?: number | 'aucune' | null;
  liste: ListeDetail;
  search?: string;
  page?: number;
  page_size?: number;
  export?: boolean;
}

@Injectable({ providedIn: 'root' })
export class StatistiquesService {
  private http = inject(HttpClient);
  private url = `${environment.apiUrl}/api/api/statistiques`;

  private params(f: Record<string, any>): HttpParams {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(f)) {
      if (v === null || v === undefined || v === '' || v === false) continue;
      p = p.set(k, v === true ? '1' : String(v));
    }
    return p;
  }

  statistiques(f: FiltresStats, resume = false): Observable<Statistiques> {
    return this.http.get<Statistiques>(`${this.url}/`, { params: this.params({ ...f, resume }) });
  }

  repasCategories(f: FiltresStats): Observable<RepasCategories> {
    return this.http.get<RepasCategories>(`${this.url}/repas-categories/`, { params: this.params(f) });
  }

  detail(f: FiltresDetail): Observable<DetailService> {
    return this.http.get<DetailService>(`${this.url}/detail/`, { params: this.params(f) });
  }
}

// ── Utilitaires d'affichage (format français) ─────────────────────

export const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
                           'septembre', 'octobre', 'novembre', 'décembre'];
export const MOIS_COURTS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août',
                            'Sept.', 'Oct.', 'Nov.', 'Déc.'];
const JOURS_LONGS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** « 1 248 » */
export function nombreFr(n: number | null | undefined, decimales = 0): string {
  if (n === null || n === undefined || isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

/** « 91 % » (arrondi) */
export function pourcentFr(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : `${nombreFr(Math.round(Number(n)))} %`;
}

/** « 4,3 » */
export function noteFr(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : nombreFr(n, 1);
}

/** Date locale AAAA-MM-JJ (sans décalage UTC) */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dateDe(iso: string): Date {
  const [a, m, j] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, j);
}

/** « 21/10 » */
export function jourMoisCourt(iso: string): string {
  const d = dateDe(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** « mercredi 21/10 » */
export function jourLibelle(iso: string): string {
  return `${JOURS_LONGS[dateDe(iso).getDay()]} ${jourMoisCourt(iso)}`;
}

/** « 12 h 41 » */
export function heureFr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Période lisible : « octobre 2026 », « septembre – octobre 2026 », « du 01/10 au 15/10/2026 » */
export function libellePeriode(debut: string, fin: string): string {
  const d = dateDe(debut), f = dateDe(fin);
  const dernierJour = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
  if (d.getDate() === 1 && f.getDate() === dernierJour) {
    if (d.getFullYear() === f.getFullYear() && d.getMonth() === f.getMonth()) {
      return `${MOIS_LONGS[d.getMonth()]} ${d.getFullYear()}`;
    }
    if (d.getMonth() === 0 && f.getMonth() === 11 && d.getFullYear() === f.getFullYear()) {
      return `année ${d.getFullYear()}`;
    }
    const an = d.getFullYear() === f.getFullYear() ? '' : ` ${d.getFullYear()}`;
    return `${MOIS_LONGS[d.getMonth()]}${an} – ${MOIS_LONGS[f.getMonth()]} ${f.getFullYear()}`;
  }
  if (debut === fin) return jourLibelle(debut);
  return `du ${jourMoisCourt(debut)} au ${jourMoisCourt(fin)}/${f.getFullYear()}`;
}

/** Libellé de comparaison : « vs septembre » (un mois entier) ou « vs période précédente » */
export function libelleComparaison(prec?: { debut: string; fin: string }, court = false): string {
  if (!prec) return '';
  const d = dateDe(prec.debut), f = dateDe(prec.fin);
  const dernierJour = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
  if (d.getDate() === 1 && f.getDate() === dernierJour && d.getMonth() === f.getMonth() && d.getFullYear() === f.getFullYear()) {
    return `vs ${court ? MOIS_COURTS[d.getMonth()].toLowerCase() : MOIS_LONGS[d.getMonth()]}`;
  }
  return 'vs période précédente';
}

/**
 * Variation d'un indicateur par rapport à la période précédente.
 * sens : +1 si une hausse est une bonne nouvelle, -1 sinon (couleur verte / rouge).
 */
export interface Variation { texte: string; classe: 'st-up-bon' | 'st-up-mal' | 'st-down-bon' | 'st-down-mal' | 'st-neutre'; icone: string; }

export function variation(actuel: number | null | undefined, precedent: number | null | undefined,
                          sens: 1 | -1, mode: 'pct' | 'diff' = 'pct'): Variation | null {
  if (actuel === null || actuel === undefined || precedent === null || precedent === undefined) return null;
  let v: number;
  let texte: string;
  if (mode === 'pct') {
    if (!precedent) return null;
    v = Math.round((actuel - precedent) / precedent * 100);
    texte = `${v > 0 ? '+' : v < 0 ? '−' : ''}${nombreFr(Math.abs(v))} %`;
  } else {
    v = Math.round((actuel - precedent) * 10) / 10;
    texte = `${v > 0 ? '+' : v < 0 ? '−' : ''}${nombreFr(Math.abs(v), 1)}`;
  }
  if (v === 0) return { texte: 'stable', classe: 'st-neutre', icone: '' };
  const hausse = v > 0;
  const bon = hausse === (sens === 1);
  return {
    texte,
    classe: hausse ? (bon ? 'st-up-bon' : 'st-up-mal') : (bon ? 'st-down-bon' : 'st-down-mal'),
    icone: hausse ? 'ri-arrow-up-line' : 'ri-arrow-down-line',
  };
}
