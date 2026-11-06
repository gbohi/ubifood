// src/app/core/services/caisse/caisse.service.ts
//
// Compte repas prépayé et caisse (étape 2) — référence : contrat d'API étape 2
// (routes /api/api/caisse/… et /api/api/compte-repas/…). Montants en francs CFA.
// Les erreurs arrivent déjà en texte (ErrorInterceptor) : voir messageCaisse().

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { saveAs } from 'file-saver';
import { environment } from 'src/environments/environment';

export type StatutRepas = 'debite_compte' | 'paye_caisse' | 'retenue' | 'non_couvert' | 'a_venir';
export type TypeRecu = 'recharge' | 'regularisation' | 'remboursement';
export type ModePaiement = 'especes' | 'mobile_money';
export type PapierRecu = 'ticket' | 'a5';
export type StatutCloture = 'soumise' | 'validee' | 'rejetee';

export interface Page<T> { count: number; next: string | null; previous: string | null; results: T[] }

export interface EmployeCaisse {
  id: number; nom: string; prenoms: string; nom_prenom: string; matricule: string;
  agence: string | null; actif: boolean; solde?: number;
}

export interface ModePaiementInfo { code: ModePaiement; libelle: string; actif: boolean }

export interface ContexteCaisse {
  utilisateur: { id: number; nom_prenom: string; roles: string[] };
  peut_encaisser: boolean;
  peut_controler: boolean;
  modes_paiement: ModePaiementInfo[];
  mobile_money_actif: boolean;
  aujourdhui: string;
  caisse_en_cours: { nb_recus: number; montant_theorique: number };
  statuts_repas: Record<StatutRepas, string>;
}

export interface RepasCompte {
  commande_id: number; date_menu: string; plat: string; agence_menu: string; statut_commande: string;
  montant: number | null; sans_tarif: boolean; statut: StatutRepas; statut_libelle: string; regularisable: boolean;
}

export interface TotalStatut { nb: number; montant: number; libelle?: string }

export interface TotauxCompte {
  consomme: TotalStatut; debite_compte: TotalStatut; paye_caisse: TotalStatut;
  retenue: TotalStatut; non_couvert: TotalStatut; a_venir: TotalStatut;
}

export interface LigneRecu { commande_id: number; date_menu: string; plat: string; montant: number }

export interface Mouvement {
  id: number; type: string; type_libelle: string; montant: number; solde_apres: number; libelle: string;
  commande_id: number | null; recu_id: number | null; recu_numero: string | null; date: string;
}

export interface Recu {
  id: number; numero: string; type: TypeRecu; type_libelle: string;
  statut: 'valide' | 'annule'; statut_libelle: string; date: string; heure?: string;
  employe: EmployeCaisse; caissier_id: number; caissier_nom: string;
  mode: ModePaiement; mode_libelle: string; reference: string;
  montant: number; montant_repas: number; montant_recu: number | null;
  monnaie: number; monnaie_creditee: boolean; encaissement: number;
  solde_avant: number; solde_apres: number; motif: string;
  cloture_caisse_id: number | null; verrouille: boolean;
  annule_par_nom: string | null; annule_le: string | null; motif_annulation: string;
  lignes?: LigneRecu[];
  mouvements?: Mouvement[];
}

export interface FicheCaisse {
  employe: EmployeCaisse;
  solde: number;
  date_debut: string; date_fin: string;
  repas: RepasCompte[];
  totaux: TotauxCompte;
  reste_a_payer_prevu: number;
  mention_reste: string;
  derniers_recus: Recu[];
}

export interface MonCompte extends Omit<FicheCaisse, 'employe' | 'derniers_recus'> {
  annee: number; mois: number; mois_cloture: boolean;
  derniers_mouvements: Mouvement[];
}

export interface ClotureCaisse {
  id: number; caissier_id: number; caissier_nom: string; jour: string; debut: string | null; soumise_le: string;
  nb_recus: number; montant_theorique: number; montant_compte: number; ecart: number; motif_ecart: string;
  statut: StatutCloture; statut_libelle: string;
  traitee_par_nom: string | null; traitee_le: string | null; commentaire: string;
  recus?: Recu[];
}

export interface ApercuCloture { nb_recus: number; debut: string | null; montant_theorique: number; recus: Recu[] }

export interface JournalCaisse {
  date: string; caissier_libelle: string;
  nb_recus: number; nb_valides: number; nb_annules: number; montant_annules: number; especes_net: number;
  par_type: { type: TypeRecu; libelle: string; nb: number; montant: number; encaissement: number }[];
  par_caissier: { caissier_id: number; caissier_nom: string; nb: number; encaissement: number }[];
  recus: Recu[];
  clotures: ClotureCaisse[];
}

export interface CompteSolde extends EmployeCaisse { solde: number; mis_a_jour: string }

/** Libellés et couleurs (classes lst-tag) des statuts de repas — contrat d'API §1 */
export const STATUTS_REPAS: Record<StatutRepas, { court: string; classe: string; icone: string }> = {
  debite_compte: { court: 'Débité du compte',  classe: 't-ve', icone: 'ri-wallet-3-line' },
  paye_caisse:   { court: 'Payé à la caisse',  classe: 't-bl', icone: 'ri-money-dollar-circle-line' },
  retenue:       { court: 'Retenu sur salaire', classe: 't-gr', icone: 'ri-lock-line' },
  non_couvert:   { court: 'Non couvert',        classe: 't-or', icone: 'ri-error-warning-line' },
  a_venir:       { court: 'À venir',            classe: 't-gr', icone: 'ri-time-line' },
};

export const STATUTS_CLOTURE: Record<StatutCloture, { court: string; classe: string; icone: string }> = {
  soumise: { court: 'À valider', classe: 't-or', icone: 'ri-time-line' },
  validee: { court: 'Validée',   classe: 't-ve', icone: 'ri-checkbox-circle-line' },
  rejetee: { court: 'Rejetée',   classe: 't-ro', icone: 'ri-close-circle-line' },
};

export const ICONES_RECU: Record<TypeRecu, string> = {
  recharge: 'ri-add-circle-line', regularisation: 'ri-restaurant-2-line', remboursement: 'ri-hand-coin-line',
};

/** Montant en francs CFA : « 12 500 F » (signe facultatif : « +5 000 F ») */
export function fcfa(n: number | null | undefined, signe = false): string {
  if (n === null || n === undefined || isNaN(Number(n))) return '—';
  const v = Number(n);
  const txt = Math.abs(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/ | /g, ' ');
  return `${v < 0 ? '−' : signe && v > 0 ? '+' : ''}${txt} F`;
}

/**
 * Message d'erreur de l'API affichable tel quel : l'intercepteur préfixe les erreurs
 * de champ (« montant_recu : … ») ; les messages de la caisse se suffisent à eux-mêmes.
 */
export function messageCaisse(e: any, defaut = 'Opération impossible.'): string {
  const txt = typeof e === 'string' ? e : defaut;
  return txt.replace(/^[a-z_]+ : /, '');
}

export function initiales(nom?: string | null): string {
  return (nom ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?';
}

export function heureIso(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** « 06/11/2026 » à partir d'une date ou d'un horodatage ISO */
export function jourFr(iso?: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function jourHeureFr(iso?: string | null): string {
  return iso ? `${jourFr(iso)} ${heureIso(iso)}` : '';
}

/** Date du jour (fuseau du navigateur) au format AAAA-MM-JJ */
export function aujourdhuiIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function params(valeurs: Record<string, any>): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(valeurs)) {
    if (v !== null && v !== undefined && v !== '') p = p.set(k, String(v));
  }
  return p;
}

@Injectable({ providedIn: 'root' })
export class CaisseService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/api`;

  // ── Caisse ────────────────────────────────────────────────
  contexte(): Observable<ContexteCaisse> {
    return this.http.get<ContexteCaisse>(`${this.api}/caisse/contexte/`);
  }

  rechercher(q: string, inactifs = false): Observable<{ resultats: EmployeCaisse[] }> {
    return this.http.get<{ resultats: EmployeCaisse[] }>(`${this.api}/caisse/employes/`,
      { params: params({ q, inactifs: inactifs ? 1 : '' }) });
  }

  fiche(id: number): Observable<FicheCaisse> {
    return this.http.get<FicheCaisse>(`${this.api}/caisse/employes/${id}/`);
  }

  recharger(d: { user_id: number; montant: number; mode: ModePaiement; reference?: string }): Observable<Recu> {
    return this.http.post<Recu>(`${this.api}/caisse/recharger/`, d);
  }

  regulariser(d: { user_id: number; commande_ids: number[]; montant_recu: number; monnaie: 'rendre' | 'crediter'; mode: ModePaiement }): Observable<Recu> {
    return this.http.post<Recu>(`${this.api}/caisse/regulariser/`, d);
  }

  rembourser(d: { user_id: number; motif: string; mode: ModePaiement }): Observable<Recu> {
    return this.http.post<Recu>(`${this.api}/caisse/rembourser/`, d);
  }

  // ── Reçus ─────────────────────────────────────────────────
  recus(filtres: Record<string, any>): Observable<Page<Recu>> {
    return this.http.get<Page<Recu>>(`${this.api}/caisse/recus/`, { params: params(filtres) });
  }

  recu(id: number): Observable<Recu> {
    return this.http.get<Recu>(`${this.api}/caisse/recus/${id}/`);
  }

  annulerRecu(id: number, motif: string): Observable<Recu> {
    return this.http.post<Recu>(`${this.api}/caisse/recus/${id}/annuler/`, { motif });
  }

  /** PDF d'un reçu (caisse / comptabilité, ou « mes reçus » pour l'employé) */
  pdfRecu(id: number, papier: PapierRecu, moi = false): Observable<Blob> {
    const url = moi ? `${this.api}/compte-repas/recus/${id}/pdf/` : `${this.api}/caisse/recus/${id}/pdf/`;
    return this.http.get(url, { params: params({ papier }), responseType: 'blob' });
  }

  // ── Clôtures de caisse ────────────────────────────────────
  apercuCloture(): Observable<ApercuCloture> {
    return this.http.get<ApercuCloture>(`${this.api}/caisse/clotures/apercu/`);
  }

  soumettreCloture(montant_compte: number, motif_ecart: string): Observable<ClotureCaisse> {
    return this.http.post<ClotureCaisse>(`${this.api}/caisse/clotures/`, { montant_compte, motif_ecart });
  }

  clotures(filtres: Record<string, any>): Observable<Page<ClotureCaisse>> {
    return this.http.get<Page<ClotureCaisse>>(`${this.api}/caisse/clotures/`, { params: params(filtres) });
  }

  cloture(id: number): Observable<ClotureCaisse> {
    return this.http.get<ClotureCaisse>(`${this.api}/caisse/clotures/${id}/`);
  }

  traiterCloture(id: number, valider: boolean, commentaire: string): Observable<ClotureCaisse> {
    return this.http.post<ClotureCaisse>(`${this.api}/caisse/clotures/${id}/${valider ? 'valider' : 'rejeter'}/`, { commentaire });
  }

  // ── Journal et soldes ─────────────────────────────────────
  journal(date: string, caissier?: number | null): Observable<JournalCaisse> {
    return this.http.get<JournalCaisse>(`${this.api}/caisse/journal/`, { params: params({ date, caissier }) });
  }

  journalPdf(date: string, caissier?: number | null): Observable<Blob> {
    return this.http.get(`${this.api}/caisse/journal/pdf/`, { params: params({ date, caissier }), responseType: 'blob' });
  }

  comptes(filtres: Record<string, any>): Observable<Page<CompteSolde> & { total_soldes: number }> {
    return this.http.get<Page<CompteSolde> & { total_soldes: number }>(`${this.api}/caisse/comptes/`, { params: params(filtres) });
  }

  // ── Espace employé ────────────────────────────────────────
  monCompte(annee: number, mois: number): Observable<MonCompte> {
    return this.http.get<MonCompte>(`${this.api}/compte-repas/`, { params: params({ annee, mois }) });
  }

  mesMouvements(page: number, page_size = 10): Observable<Page<Mouvement>> {
    return this.http.get<Page<Mouvement>>(`${this.api}/compte-repas/mouvements/`, { params: params({ page, page_size }) });
  }

  mesRecus(page: number, page_size = 10): Observable<Page<Recu>> {
    return this.http.get<Page<Recu>>(`${this.api}/compte-repas/recus/`, { params: params({ page, page_size }) });
  }

  // ── Fichiers ──────────────────────────────────────────────
  /** Nom du fichier d'un reçu : « recu-2026-000002-ticket.pdf » */
  nomFichier(recu: Pick<Recu, 'numero'>, papier: PapierRecu): string {
    const base = (recu.numero || 'recu').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    return `${base.replace(/^rec-/, 'recu-')}-${papier}.pdf`;
  }

  enregistrer(blob: Blob, nom: string): void {
    saveAs(blob, nom);
  }

  /**
   * Imprime un PDF (ticket 80 mm) : chargé dans un cadre caché puis envoyé à
   * l'imprimante ; si le navigateur refuse, le PDF s'ouvre dans un nouvel onglet.
   */
  imprimer(blob: Blob): void {
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    const cadre = document.createElement('iframe');
    cadre.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    cadre.src = url;
    cadre.onload = () => {
      try {
        cadre.contentWindow?.focus();
        cadre.contentWindow?.print();
      } catch {
        window.open(url, '_blank');
      }
      setTimeout(() => { cadre.remove(); URL.revokeObjectURL(url); }, 60_000);
    };
    document.body.appendChild(cadre);
  }
}
