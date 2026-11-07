// src/app/core/services/suivi-factures/suivi-factures.service.ts
//
// Suivi des factures prestataires (étape 3) — référence : API.md de l'étape 3.
// Un relevé officiel par prestataire et par mois clôturé suit 5 étapes :
// relevé émis → bon pour accord (ou contestation) → facture déposée →
// facture validée (ou refusée) → payée.
//   - prestataire (responsable) : /api/api/prestataire/factures/…
//   - comptabilité et administrateurs : /api/api/paiements-prestataires/…
// Les erreurs arrivent déjà en texte (ErrorInterceptor).

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { saveAs } from 'file-saver';
import { environment } from 'src/environments/environment';

export type StatutReleve = 'emis' | 'conteste' | 'accorde' | 'facture_deposee' | 'facture_refusee' | 'facture_validee' | 'payee';
export type EtatEtape = 'fait' | 'en_cours' | 'alerte' | 'a_venir';
export type ActionReleve = 'accord' | 'contester' | 'deposer' | 'repondre' | 'valider' | 'refuser' | 'payer' | 'relancer';
export type ModePaiementPresta = 'virement' | 'cheque' | 'especes';

export interface EtapeReleve { numero: number; libelle: string; etat: EtatEtape; date: string | null; detail: string }

export interface DepotFacture {
  id: number; numero_facture: string; date_facture: string;
  montant_ttc: number; montant_releve: number; ecart: number; conforme: boolean;
  statut: 'en_attente' | 'validee' | 'refusee' | 'remplacee'; statut_libelle: string;
  nom_fichier: string; taille: number;
  deposee_le: string; deposee_par_nom: string | null;
  traitee_le: string | null; traitee_par_nom: string | null; motif_refus: string;
}

export interface HistoriqueReleve {
  id: number; action: string; action_libelle: string; date: string; user_nom: string | null;
  commentaire: string; donnees: Record<string, any>;
}

export interface ReleveSuivi {
  id: number; numero: string | null; annee: number; mois: number; libelle: string;
  prestataire: { id: number; libelle: string };
  nb_repas: number; montant: number;
  statut: StatutReleve; statut_libelle: string;
  /** Étape en cours (2 à 5) ; 6 : terminé (payé) */
  etape: number;
  etapes: EtapeReleve[];
  cloturee_le: string | null;
  accord_le: string | null; accord_par_nom: string | null;
  validee_le: string | null; validee_par_nom: string | null;
  /** Dernière facture déposée (en attente, validée ou refusée) */
  facture: DepotFacture | null;
  contestation: {
    commentaire: string; date: string; par: string | null;
    reponse: string | null; reponse_date: string | null; reponse_par: string | null;
  } | null;
  paiement: {
    date: string; mode: ModePaiementPresta; mode_libelle: string; reference: string; justificatif: boolean;
    enregistre_le: string; enregistre_par_nom: string | null;
  } | null;
  derniere_relance_le: string | null;
  statut_modifie_le: string | null;
  /** Actions offertes à l'utilisateur connecté (revérifiées par le serveur) */
  actions: ActionReleve[];
  // Détail seulement
  depots?: DepotFacture[];
  historique?: HistoriqueReleve[];
}

export interface TotalSuivi { nb: number; montant: number }

export interface PaiementsPrestataires {
  annee: number | null;
  annees: number[];
  peut_agir: boolean;
  totaux: { dus: TotalSuivi; en_cours: TotalSuivi; payes: TotalSuivi; total: TotalSuivi; a_traiter: number };
  statuts: { code: StatutReleve; libelle: string }[];
  prestataires: { id: number; libelle: string }[];
  resultats: ReleveSuivi[];
}

/** Libellé court, couleur (classes lst-tag) et icône de chaque statut */
export const STATUTS_RELEVE: Record<StatutReleve, { court: string; classe: string; icone: string }> = {
  emis:            { court: 'Relevé émis',       classe: 't-bl', icone: 'ri-file-text-line' },
  conteste:        { court: 'Contesté',          classe: 't-ro', icone: 'ri-error-warning-line' },
  accorde:         { court: 'Bon pour accord',   classe: 't-bl', icone: 'ri-thumb-up-line' },
  facture_deposee: { court: 'Facture à valider', classe: 't-or', icone: 'ri-file-upload-line' },
  facture_refusee: { court: 'Facture refusée',   classe: 't-ro', icone: 'ri-close-circle-line' },
  facture_validee: { court: 'À payer',           classe: 't-or', icone: 'ri-checkbox-circle-line' },
  payee:           { court: 'Payée',             classe: 't-ve', icone: 'ri-money-dollar-circle-line' },
};

/** Icône et couleur de chaque action de l'historique */
export const ACTIONS_HISTORIQUE: Record<string, { icone: string; classe: string }> = {
  emis:         { icone: 'ri-file-text-line', classe: 'bl' },
  accord:       { icone: 'ri-thumb-up-line', classe: 've' },
  contestation: { icone: 'ri-error-warning-line', classe: 'ro' },
  reponse:      { icone: 'ri-chat-check-line', classe: 'bl' },
  depot:        { icone: 'ri-file-upload-line', classe: 'bl' },
  validation:   { icone: 'ri-checkbox-circle-line', classe: 've' },
  refus:        { icone: 'ri-close-circle-line', classe: 'ro' },
  paiement:     { icone: 'ri-money-dollar-circle-line', classe: 've' },
  relance:      { icone: 'ri-alarm-warning-line', classe: 'or' },
};

export const MODES_PAIEMENT_PRESTA: { code: ModePaiementPresta; libelle: string }[] = [
  { code: 'virement', libelle: 'Virement' },
  { code: 'cheque', libelle: 'Chèque' },
  { code: 'especes', libelle: 'Espèces' },
];

/** Taille maximale des fichiers (facture PDF, justificatif) : 10 Mo */
export const TAILLE_MAX_FICHIER = 10 * 1024 * 1024;

/** Écart signé : « +200 F » / « −1 500 F » */
export function ecartFr(n: number): string {
  const txt = Math.abs(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/ | /g, ' ');
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${txt} F`;
}

export function tailleFr(octets: number): string {
  if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} Ko`;
  return `${(octets / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}

/** Contrôle côté navigateur (le serveur revérifie : extension, signature, taille) */
export function erreurFichier(f: File | null, images = false): string | null {
  if (!f) return 'Choisissez le fichier.';
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  const ok = images ? ['pdf', 'png', 'jpg', 'jpeg'] : ['pdf'];
  if (!ok.includes(ext)) return images ? 'Fichier PDF, PNG ou JPG uniquement.' : 'Fichier PDF uniquement.';
  if (f.size > TAILLE_MAX_FICHIER) return 'Fichier trop volumineux (10 Mo au plus).';
  if (!f.size) return 'Le fichier est vide.';
  return null;
}

function params(valeurs: Record<string, any>): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(valeurs)) {
    if (v !== null && v !== undefined && v !== '') p = p.set(k, String(v));
  }
  return p;
}

@Injectable({ providedIn: 'root' })
export class SuiviFacturesService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/api`;

  /** Racine des routes d'un relevé selon le côté */
  private base(cote: 'prestataire' | 'compta', id: number): string {
    return cote === 'prestataire' ? `${this.api}/prestataire/factures/${id}` : `${this.api}/paiements-prestataires/${id}`;
  }

  // ── Prestataire ──────────────────────────────────────────
  mesReleves(): Observable<ReleveSuivi[]> {
    return this.http.get<ReleveSuivi[]>(`${this.api}/prestataire/factures/`);
  }

  accord(id: number, commentaire = ''): Observable<ReleveSuivi> {
    return this.http.post<ReleveSuivi>(`${this.base('prestataire', id)}/accord/`, { commentaire });
  }

  contester(id: number, commentaire: string): Observable<ReleveSuivi> {
    return this.http.post<ReleveSuivi>(`${this.base('prestataire', id)}/contester/`, { commentaire });
  }

  deposer(id: number, d: { fichier: File; numero_facture: string; date_facture: string; montant_ttc: number }): Observable<ReleveSuivi> {
    const fd = new FormData();
    fd.append('fichier', d.fichier, d.fichier.name);
    fd.append('numero_facture', d.numero_facture);
    fd.append('date_facture', d.date_facture);
    fd.append('montant_ttc', String(d.montant_ttc));
    return this.http.post<ReleveSuivi>(`${this.base('prestataire', id)}/deposer/`, fd);
  }

  // ── Comptabilité ─────────────────────────────────────────
  paiements(filtres: Record<string, any>): Observable<PaiementsPrestataires> {
    return this.http.get<PaiementsPrestataires>(`${this.api}/paiements-prestataires/`, { params: params(filtres) });
  }

  repondre(id: number, commentaire: string): Observable<ReleveSuivi> {
    return this.http.post<ReleveSuivi>(`${this.base('compta', id)}/repondre/`, { commentaire });
  }

  valider(id: number, commentaire = ''): Observable<ReleveSuivi> {
    return this.http.post<ReleveSuivi>(`${this.base('compta', id)}/valider/`, { commentaire });
  }

  refuser(id: number, motif: string): Observable<ReleveSuivi> {
    return this.http.post<ReleveSuivi>(`${this.base('compta', id)}/refuser/`, { motif });
  }

  payer(id: number, d: { date_paiement: string; mode: ModePaiementPresta; reference: string; justificatif?: File | null }): Observable<ReleveSuivi> {
    const fd = new FormData();
    fd.append('date_paiement', d.date_paiement);
    fd.append('mode', d.mode);
    fd.append('reference', d.reference);
    if (d.justificatif) fd.append('justificatif', d.justificatif, d.justificatif.name);
    return this.http.post<ReleveSuivi>(`${this.base('compta', id)}/payer/`, fd);
  }

  relancer(id: number, commentaire = ''): Observable<ReleveSuivi> {
    return this.http.post<ReleveSuivi>(`${this.base('compta', id)}/relancer/`, { commentaire });
  }

  // ── Les deux côtés ───────────────────────────────────────
  detail(cote: 'prestataire' | 'compta', id: number): Observable<ReleveSuivi> {
    return this.http.get<ReleveSuivi>(`${this.base(cote, id)}/`);
  }

  relevePdf(cote: 'prestataire' | 'compta', id: number): Observable<Blob> {
    return this.http.get(`${this.base(cote, id)}/releve-pdf/`, { responseType: 'blob' });
  }

  fichierDepot(cote: 'prestataire' | 'compta', id: number, depot: number): Observable<Blob> {
    return this.http.get(`${this.base(cote, id)}/depots/${depot}/fichier/`, { responseType: 'blob' });
  }

  justificatif(cote: 'prestataire' | 'compta', id: number): Observable<Blob> {
    return this.http.get(`${this.base(cote, id)}/justificatif/`, { responseType: 'blob' });
  }

  enregistrer(blob: Blob, nom: string): void {
    saveAs(blob, nom);
  }
}
