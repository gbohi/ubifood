// Parcours de commande « agence → prestataire → équipe → jour » (routes commander/…),
// ouverture d'une agence aux autres agences, profil public du prestataire et
// seuil d'avis pour afficher une note.

import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ModePaiement } from 'src/app/store/Commande/commande.model';

export interface AgenceCommande {
  id: number; nom: string; code: string; mon_agence: boolean;
  accepter_autres_agences: boolean;
  /** Agence où l'utilisateur est programmé en mission (équipe sur planning seulement) */
  mission?: boolean;
  nb_prestataires_aujourdhui: number; nb_prestataires_semaine: number;
  heure_debut_service: string | null; heure_fin_service: string | null;
}

/** Horaires de retrait effectifs : ceux de l'équipe, sinon de l'agence, sinon par défaut */
export interface EquipeResume {
  id: number; libelle: string; heure_debut_service?: string | null; heure_fin_service?: string | null;
  /** Équipe de l'utilisateur (null : aucune équipe ne lui est attribuée) */
  mon_equipe?: boolean | null;
  /** Équipe réservée aux employés programmés (ex. Nuit) et période de l'utilisateur */
  sur_planning?: boolean;
  programmation?: { du: string; au: string | null; jours: number[]; libelle: string } | null;
}

/** Équipe de l'utilisateur (Paramètres → Utilisateurs), null s'il n'en a pas */
export type EquipeUtilisateur = { id: number; libelle: string } | null;

export interface ProfilPublic {
  id: number; libelle: string; nom_affiche: string; cantine_ubipharm?: boolean;
  logo_url: string | null; photo_couverture_url: string | null;
  description_courte: string; cuisine: string; tags: string[];
  note: number | null; nb_avis: number; nouveau: boolean;
}

export interface PrestataireCarte extends ProfilPublic {
  photos_plats?: string[];
  nb_plats_jour?: number;
  equipes?: EquipeResume[];
  commande_aujourdhui?: boolean;
  prochain_jour_a_reserver?: { date: string; libelle: string; date_limite_commande: string; libelle_limite: string } | null;
}

export interface EquipeCommande extends EquipeResume {
  mon_equipe: boolean | null; jours: string[]; nb_jours: number; prochain_menu: string | null;
}

/** non_programme : équipe sur planning, l'employé n'y est pas programmé ce jour-là (motif_indisponible) */
export type EtatJourCommande = 'pas_de_menu' | 'reserve' | 'a_reserver' | 'ferme' | 'non_programme';
export type StatutPlat = 'commande' | 'autre_plat_commande' | 'ferme' | 'disponible';

export interface PlatCommande {
  id: number; nom: string; description: string;
  type_plat_id: number; type_plat: string; mentions: string[];
  photo_url: string | null; photos: string[];
  note: number | null; nb_avis: number; nouveau: boolean;
  prix: number | null;
  /** Équipe « repas offert » : rien à payer */
  offert?: boolean;
  menu_id: number; typeequipe_id: number; typeequipe: string;
  mon_equipe?: boolean | null;
  /** Annulation possible jusqu'à cette date (affichée avant de commander) */
  date_limite_annulation?: string; libelle_annulation?: string;
  statut: StatutPlat; commande_id: number | null;
}

export interface CommandeJour {
  id: number; statut: 'en_attente' | 'retiree'; plat_id: number; plat: string; menu_id: number;
  date_menu: string; agence_id: number; agence: string;
  prestataire_id: number | null; prestataire: string; typeequipe_id: number;
  mode_paiement: ModePaiement; ici: boolean;
}

export interface JourCommande {
  date: string; libelle: string; etat: EtatJourCommande;
  date_limite_commande?: string; libelle_limite?: string;
  date_limite_annulation?: string; libelle_annulation?: string; annulable?: boolean;
  motif_indisponible?: string | null;
  menus: { id: number; typeequipe_id: number; typeequipe: string; mon_equipe?: boolean | null }[];
  commande: CommandeJour | null;
  plats: PlatCommande[];
}

export interface JoursCommande {
  agence: { id: number; nom: string };
  prestataire: ProfilPublic;
  equipe: { id: number; libelle: string; mon_equipe?: boolean | null; sur_planning?: boolean;
            programmation?: { du: string; au: string | null; jours: number[]; libelle: string } | null } | null;
  equipe_utilisateur?: EquipeUtilisateur;
  semaine: { debut: string; fin: string; precedente: string; suivante: string };
  aujourdhui: string;
  jour_par_defaut: string;
  mode_paiement_prefere: ModePaiement;
  jours: JourCommande[];
}

export interface ProfilPrestataire extends ProfilPublic {
  nom_public: string; seuil_avis_note: number; photos_plats: string[];
}

export interface ParametresCantine {
  delai_commande_heures: number; delai_annulation_heures: number; seuil_avis_note: number;
}

@Injectable({ providedIn: 'root' })
export class ParcoursCommandeService {
  private api = `${environment.apiUrl}/api/api`;

  constructor(private http: HttpClient) {}

  /** sans_agence : employé sans agence (il ne commande que dans les agences ouvertes) */
  agences(): Observable<{ date: string; mon_agence_id: number | null; sans_agence?: boolean;
                          equipe_utilisateur?: EquipeUtilisateur; agences: AgenceCommande[] }> {
    return this.http.get<any>(`${this.api}/commander/agences/`);
  }

  prestataires(agence: number, date?: string): Observable<{
    agence: { id: number; nom: string; code: string }; date: string; seuil_avis_note: number;
    equipe_utilisateur?: EquipeUtilisateur; prestataires: PrestataireCarte[];
  }> {
    let params = new HttpParams().set('agence', String(agence));
    if (date) params = params.set('date', date);
    return this.http.get<any>(`${this.api}/commander/prestataires/`, { params });
  }

  equipes(prestataire: number, agence: number): Observable<{
    agence: { id: number; nom: string }; prestataire: ProfilPublic;
    equipe_utilisateur: EquipeUtilisateur; equipes: EquipeCommande[];
  }> {
    return this.http.get<any>(`${this.api}/commander/prestataires/${prestataire}/equipes/`,
      { params: new HttpParams().set('agence', String(agence)) });
  }

  jours(agence: number, prestataire: number, equipe: number | null, semaine: string | null): Observable<JoursCommande> {
    let params = new HttpParams().set('agence', String(agence)).set('prestataire', String(prestataire));
    if (equipe != null) params = params.set('equipe', String(equipe));
    if (semaine) params = params.set('semaine', semaine);
    return this.http.get<JoursCommande>(`${this.api}/commander/jours/`, { params });
  }

  // ── Ouverture d'une agence aux employés des autres agences ──────
  ouverture(agence: number): Observable<{ id: number; nom_agence: string; accepter_autres_agences: boolean }> {
    return this.http.get<any>(`${this.api}/agences/${agence}/ouverture/`);
  }

  changerOuverture(agence: number, ouverte: boolean): Observable<{ id: number; nom_agence: string; accepter_autres_agences: boolean }> {
    return this.http.patch<any>(`${this.api}/agences/${agence}/ouverture/`, { accepter_autres_agences: ouverte });
  }

  // ── Profil public du prestataire (espace prestataire) ──────────
  monProfil(): Observable<ProfilPrestataire> {
    return this.http.get<ProfilPrestataire>(`${this.api}/prestataire/profil/`);
  }

  enregistrerMonProfil(donnees: FormData): Observable<ProfilPrestataire> {
    return this.http.patch<ProfilPrestataire>(`${this.api}/prestataire/profil/`, donnees);
  }

  /** Administrateurs : Paramètres → Prestataires (mêmes champs) */
  enregistrerProfil(prestataire: number, donnees: FormData): Observable<any> {
    return this.http.patch<any>(`${this.api}/prestataires/${prestataire}/`, donnees);
  }

  // ── Seuil d'avis avant d'afficher la note ──────────────────────
  parametresCantine(): Observable<ParametresCantine> {
    return this.http.get<ParametresCantine>(`${this.api}/parametres-cantine/`);
  }

  changerSeuilAvis(seuil: number): Observable<ParametresCantine> {
    return this.http.patch<ParametresCantine>(`${this.api}/parametres-cantine/`, { seuil_avis_note: seuil });
  }
}
