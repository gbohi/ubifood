// src/app/core/services/espace-prestataire/espace-prestataire.service.ts
//
// Espace prestataire (rôles « prestataire » et « agent_comptoir ») — référence :
// API étape 1 (routes /api/api/prestataire/…, relevés PDF de la facturation).
// Les routes /prestataire/… ne sont pas paginées.

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { environment } from 'src/environments/environment';
import { TokenStorageService } from '../token-storage.service';

/** Commande d'un employé d'une autre agence que celle du menu */
export interface OrigineCommande {
  externe?: boolean;
  agence_origine_id?: number | null;
  agence_origine?: string | null;
}
export type FiltreOrigine = 'toutes' | 'mon_agence' | 'autres';

export interface AgencePresta {
  id: number;
  nom: string;
  nb_employes: number;
  heure_debut_service: string;
  heure_fin_service: string;
}

export interface ContextePresta {
  user: { id: number; username: string; nom: string; prenom: string; nom_complet: string; role: string; role_libelle: string };
  prestataire: { id: number; libelle: string; contact_nom: string; telephone: string; email: string };
  agences: AgencePresta[];
  acces: Record<string, boolean>;
  delai_commande_heures: number;
  tarif?: { montant: number; date_debut: string };
}

export interface PlatImagePresta { id: number; url?: string | null; image?: string; is_principale: boolean }

export interface PlatPresta {
  id: number;
  nom: string;
  description: string;
  type_plat: number;
  type_plat_libelle: string;
  agences: number[];
  agences_noms: string[];
  mentions: string[];
  images: PlatImagePresta[];
  masque: boolean;
  motif_masquage: string;
  note_moyenne: number | null;
  nb_avis: number;
  nb_servis: number;
  prix: number | null;
  created_at?: string;
  updated_at?: string;
  modifie_par?: string;
}

export interface MenuPresta {
  id: number;
  date_menu: string;
  agence: number;
  agence_nom: string;
  typeequipe: number;
  typeequipe_libelle: string;
  publie: boolean;
  date_publication: string | null;
  masque: boolean;
  motif_masquage: string;
  modifiable: boolean;
  date_limite_commande: string;
  nb_commandes: number;
  nb_employes_agence: number;
  cree_par: string | null;
  modifie_par: string | null;
  menu_plats: { id: number; menu: number; plat: any }[];
}

export interface HistoriqueMenu {
  id: number;
  menu_id: number | null;
  date_menu: string;
  agence_id: number;
  action: string;
  action_libelle: string;
  description: string;
  motif: string;
  par: string | null;
  par_prestataire: boolean;
  date: string;
}

export interface LignePlatJour {
  externes?: number;
  plat_id: number;
  plat: string;
  par_agence: Record<string, number>;
  total: number;
  servis: number;
}

export interface JourAPreparer {
  externes?: number;
  externes_par_agence?: Record<string, number>;
  date: string;
  libelle: string;
  etat: 'passe' | 'en_service' | 'fige' | 'provisoire' | 'ouvert';
  provisoire: boolean;
  date_limite_commande: string;
  libelle_limite: string;
  total: number;
  servis: number;
  totaux_par_agence: Record<string, number>;
  plats: LignePlatJour[];
  agences?: AgencePresta[];
}

export interface APreparer {
  origine?: FiltreOrigine;
  date_debut: string;
  date_fin: string;
  agences: AgencePresta[];
  jours: JourAPreparer[];
  semaine: { debut: string; fin: string; nb_repas: number; tarif: number | null; montant_estime: number | null };
}

export interface LigneListeJour extends OrigineCommande {
  commande_id: number;
  menu_id: number;
  user_id: number;
  nom: string;
  prenoms: string;
  nom_complet: string;
  matricule: string;
  agence: string;
  agence_id: number;
  plat_id: number;
  plat: string;
  statut: 'a_servir' | 'retire' | 'non_retire' | string;
  heure_retrait: string | null;
  valide_par_nom: string | null;
}

export interface ListeDuJour {
  origine?: FiltreOrigine;
  externes?: number;
  date: string;
  agence: number | null;
  total: number;
  retires: number;
  a_servir: number;
  lignes: LigneListeJour[];
}

export interface RetraitComptoir extends OrigineCommande {
  id: number;
  user_id: number;
  user_nom: string;
  matricule: string;
  menu_id: number;
  date_retrait: string;
  heure: string;
  plats: { commande_id: number; plat: string }[];
  valide_par_id: number | null;
  valide_par_nom: string | null;
  valide_par_prestataire: string | null;
  mode: string;
  annulable_par_moi: boolean;
  annulable_jusqu_a: string | null;
}

export interface ServiceComptoirPresta {
  externes?: number;
  date: string;
  agence: { id: number; nom: string; heure_debut_service: string; heure_fin_service: string };
  menus: { id: number; typeequipe_libelle: string }[];
  commandees: number;
  servies: number;
  a_servir: number;
  pct_servis: number;
  plats: { plat_id: number; nom: string; image_url: string | null; commandees: number; servies: number; a_servir: number; externes?: number }[];
  mes_retraits_aujourdhui: number;
  derniers: RetraitComptoir[];
}

export interface RechercheComptoir extends OrigineCommande {
  employe: { id: number; nom: string; prenoms: string; nom_complet: string; matricule: string; agence: string } & OrigineCommande;
  commandes: { commande_id: number; menu_id: number; plat_id: number; plat: string; plat_image_url: string | null; statut: string; date_commande: string }[];
  deja_retire: boolean;
  retrait: RetraitComptoir | null;
  a_retirer: boolean;
  menu_id: number | null;
  message: string;
}

export interface ReleveMois {
  annee: number;
  mois: number;
  libelle: string;
  date_debut: string;
  date_fin: string;
  etat: 'en_cours' | 'a_cloturer' | 'cloture';
  releve_id: number | null;
  numero: string | null;
  nb_repas: number;
  montant: number;
  cloturee_le: string | null;
  /** Suivi du relevé officiel (étape 3) : null avant la clôture */
  statut?: string | null;
  statut_libelle?: string | null;
  /** Étape en cours (2 à 5), 6 : payé, 0 : mois non clôturé */
  etape?: number;
}

export interface AccueilPresta {
  date: string;
  heure: string;
  prestataire: { id: number; libelle: string };
  agences: AgencePresta[];
  service_du_jour: {
    agence_id: number; agence_nom: string; heure_debut_service: string; heure_fin_service: string;
    /** Équipes servies aujourd'hui, avec leurs horaires de retrait */
    equipes?: { id: number; libelle: string; heure_debut_service: string; heure_fin_service: string }[];
    commandees: number; servies: number; a_servir: number; pct_servis: number;
    /** dont employés d'autres agences */
    externes?: number;
    plats: { plat_id: number; plat: string; image_url: string | null; commandees: number; servies: number; a_servir: number }[];
  }[];
  a_preparer: JourAPreparer | null;
  equipe: { total: number; agents: { user_id: number; nom: string; nb_retraits: number; agences: string[]; premier_retrait: string | null }[] };
  alertes: any[];
  releves: ReleveMois[];
  note_moyenne: { note: number | null; nb_avis: number; mois: string } | null;
}

export interface StatsPresta {
  debut: string;
  fin: string;
  agence: number | null;
  en_cours: boolean;
  kpis: { commandes: number; servis: number; a_servir: number; non_retires: number; annulees: number; taux_retrait: number | null; note_moyenne: number | null; nb_avis: number };
  par_plat: { plat_id: number; plat: string; agences: string[]; commandes: number; servis: number; a_servir: number; non_retires: number; annulees: number; taux_retrait: number | null; note: number | null; nb_avis: number }[];
}

export interface MembreEquipe {
  id: number;
  username: string;
  nom: string;
  prenom: string;
  nom_complet: string;
  role: string;
  role_libelle: string;
  is_active: boolean;
  last_login: string | null;
  retraits_aujourdhui: number;
  retraits_mois: number;
}

/** Paramètres HTTP sans les valeurs vides */
function params(valeurs: Record<string, any>): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(valeurs)) {
    if (v === null || v === undefined || v === '') continue;
    p = p.set(k, String(v));
  }
  return p;
}

@Injectable({ providedIn: 'root' })
export class EspacePrestataireService {
  private http = inject(HttpClient);
  readonly api = `${environment.apiUrl}/api/api`;
  private url = `${this.api}/prestataire`;
  private tokenStorage = inject(TokenStorageService);
  private contexte$: Observable<ContextePresta> | null = null;
  private contexteUser: any = null;

  /** Contexte de l'espace (lu une fois par utilisateur connecté, rechargeable) */
  contexte(recharger = false): Observable<ContextePresta> {
    const userId = this.tokenStorage.getUser()?.id ?? null;
    if (!this.contexte$ || recharger || userId !== this.contexteUser) {
      this.contexteUser = userId;
      this.contexte$ = this.http.get<ContextePresta>(`${this.url}/contexte/`).pipe(shareReplay({ bufferSize: 1, refCount: false }));
    }
    return this.contexte$;
  }

  accueil(): Observable<AccueilPresta> {
    return this.http.get<AccueilPresta>(`${this.url}/accueil/`);
  }

  // ── Plats ───────────────────────────────────────────────────
  plats(filtres: { type_plat?: any; agence?: any; search?: string; sans_photo?: boolean } = {}):
    Observable<{ nb_plats: number; nb_sans_photo: number; plats: PlatPresta[] }> {
    return this.http.get<any>(`${this.url}/plats/`, {
      params: params({ ...filtres, sans_photo: filtres.sans_photo ? 1 : '' }),
    });
  }

  /** JSON (champs) ou FormData (photos : new_images) */
  enregistrerPlat(id: number | null, donnees: FormData | Record<string, any>): Observable<PlatPresta> {
    return id
      ? this.http.patch<PlatPresta>(`${this.url}/plats/${id}/`, donnees)
      : this.http.post<PlatPresta>(`${this.url}/plats/`, donnees);
  }

  imagePrincipale(id: number, imageId: number): Observable<PlatPresta> {
    return this.http.post<PlatPresta>(`${this.url}/plats/${id}/image-principale/`, { image_id: imageId });
  }

  supprimerPlat(id: number): Observable<any> {
    return this.http.delete(`${this.url}/plats/${id}/`);
  }

  typesPlats(): Observable<{ id: number; libelle: string }[]> {
    return this.http.get<any[]>(`${this.api}/allnopagin/typeplats/`);
  }

  typesEquipes(): Observable<{ id: number; libelle: string }[]> {
    return this.http.get<any[]>(`${this.api}/allnopagin/typeequipes/`);
  }

  // ── Menus ───────────────────────────────────────────────────
  menus(filtres: { date_debut?: string; date_fin?: string; agence?: any; publie?: any } = {}): Observable<MenuPresta[]> {
    return this.http.get<MenuPresta[]>(`${this.url}/menus/`, { params: params(filtres) });
  }

  creerMenu(donnees: { date_menu: string; agence: number; typeequipe: number; plat_ids: number[]; publie?: boolean }): Observable<MenuPresta> {
    return this.http.post<MenuPresta>(`${this.url}/menus/`, donnees);
  }

  modifierMenu(id: number, donnees: { plat_ids?: number[]; publie?: boolean }): Observable<MenuPresta> {
    return this.http.patch<MenuPresta>(`${this.url}/menus/${id}/`, donnees);
  }

  supprimerMenu(id: number): Observable<any> {
    return this.http.delete(`${this.url}/menus/${id}/`);
  }

  publier(donnees: { ids?: number[]; agence?: number; date_debut?: string; date_fin?: string }):
    Observable<{ publies: number[]; ignores: { id: number; date_menu: string; raison: string }[]; menus: MenuPresta[] }> {
    return this.http.post<any>(`${this.url}/menus/publier/`, donnees);
  }

  copierMenu(donnees: { menu_source: number; date_menu: string; agence?: number; publie?: boolean }): Observable<MenuPresta> {
    return this.http.post<MenuPresta>(`${this.url}/menus/copier/`, donnees);
  }

  copierSemaine(donnees: { agence: number; semaine_source: string; semaine_cible: string; publie?: boolean }):
    Observable<{ crees: number[]; ignores: { date_menu: string; raison: string }[]; menus: MenuPresta[] }> {
    return this.http.post<any>(`${this.url}/menus/copier-semaine/`, donnees);
  }

  historique(filtres: { agence?: any; date_debut?: string; date_fin?: string; menu?: any } = {}): Observable<HistoriqueMenu[]> {
    return this.http.get<HistoriqueMenu[]>(`${this.url}/menus/historique/`, { params: params(filtres) });
  }

  // ── Production, liste du jour ───────────────────────────────
  aPreparer(filtres: { date_debut?: string; date_fin?: string; agence?: any; origine?: FiltreOrigine } = {}): Observable<APreparer> {
    return this.http.get<APreparer>(`${this.url}/a-preparer/`, { params: params(filtres) });
  }

  listeDuJour(filtres: { date?: string; agence?: any; statut?: string; search?: string; origine?: FiltreOrigine } = {}): Observable<ListeDuJour> {
    return this.http.get<ListeDuJour>(`${this.url}/liste-du-jour/`, { params: params(filtres) });
  }

  // ── Comptoir ────────────────────────────────────────────────
  service(agence: number | null, limite = 8): Observable<ServiceComptoirPresta> {
    return this.http.get<ServiceComptoirPresta>(`${this.url}/comptoir/service/`, { params: params({ agence, limite }) });
  }

  rechercher(badge: string, agence: number | null): Observable<RechercheComptoir> {
    return this.http.get<RechercheComptoir>(`${this.url}/comptoir/recherche/`, { params: params({ badge, agence }) });
  }

  valider(menuId: number, userId: number, mode: 'scan' | 'saisie'): Observable<RetraitComptoir> {
    return this.http.post<RetraitComptoir>(`${this.url}/comptoir/valider/`, { menu_id: menuId, user_id: userId, mode });
  }

  annulerRetrait(id: number): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(`${this.url}/comptoir/retraits/${id}/annuler/`, {});
  }

  // ── Relevés, statistiques, équipe ───────────────────────────
  releves(nbMois = 12): Observable<ReleveMois[]> {
    return this.http.get<ReleveMois[]>(`${this.url}/releves/`, { params: params({ nb_mois: nbMois }) });
  }

  /** PDF du relevé d'un mois (officiel si clôturé, sinon provisoire) */
  relevePdf(prestataireId: number, annee: number, mois: number): Observable<Blob> {
    return this.http.get(`${this.api}/facturation/prestataires/${prestataireId}/releve-pdf/`,
      { params: params({ annee, mois }), responseType: 'blob' });
  }

  statistiques(filtres: { debut?: string; fin?: string; agence?: any } = {}): Observable<StatsPresta> {
    return this.http.get<StatsPresta>(`${this.url}/statistiques/`, { params: params(filtres) });
  }

  equipe(): Observable<MembreEquipe[]> {
    return this.http.get<MembreEquipe[]>(`${this.url}/equipe/`);
  }
}

// ── Petits utilitaires d'affichage partagés par les pages ────────

export const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];

/** AAAA-MM-JJ local (pas de décalage UTC) */
export function isoJour(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function versDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function ajouterJours(iso: string, n: number): string {
  const d = versDate(iso);
  d.setDate(d.getDate() + n);
  return isoJour(d);
}

/** Lundi de la semaine d'une date */
export function lundi(iso: string): string {
  const d = versDate(iso);
  const decal = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - decal);
  return isoJour(d);
}

export function nombreFr(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('fr-FR');
}

export function montantFr(n: number | null | undefined): string {
  return `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} F`;
}

export function initiales(nom?: string | null): string {
  return (nom ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?';
}

const COULEURS = ['#C98A16', '#0F3A6E', '#7B61FF', '#3EC970', '#2F80ED', '#9AA9BE'];
export function couleur(id?: number | null): string {
  return COULEURS[(id ?? 0) % COULEURS.length];
}

/** URL absolue d'un média du serveur */
export function urlMedia(url?: string | null): string | null {
  if (!url) return null;
  return url.startsWith('http') ? url : `${environment.apiUrl}${url}`;
}

/** Message lisible d'une erreur (l'intercepteur la convertit déjà en texte) */
export function messageErreur(err: any, defaut = "L'action a échoué."): string {
  return typeof err === 'string' && err ? err : defaut;
}

/** 4,4 (une décimale, virgule) ; « — » sans valeur */
export function noteFr(n: number | null | undefined): string {
  return n == null ? '—' : (Math.round(Number(n) * 10) / 10).toFixed(1).replace('.', ',');
}

/** 96,2 % */
export function pourcentFr(n: number | null | undefined): string {
  return n == null ? '—' : `${(Math.round(Number(n) * 10) / 10).toString().replace('.', ',')} %`;
}
