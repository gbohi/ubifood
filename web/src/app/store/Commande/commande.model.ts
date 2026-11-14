// src/app/store/Commande/commande.model.ts

import { PlatModel } from '../Plat/plat.model';
import { MenulistModel } from '../Menu/menu.model';

export type CommandeStatut = 'en_attente' | 'annulee' | 'retiree';

/** Mode de paiement choisi à la commande */
export type ModePaiement = 'compte' | 'retenue' | 'offert';

export const MODES_PAIEMENT_LIBELLES: Record<ModePaiement, string> = {
  compte: 'Compte repas',
  retenue: 'Retenue sur salaire',
  offert: 'Repas offert',
};

/** GET /compte-repas/paiement/?menu=ID : ce que l'écran de commande propose */
export interface InfoPaiement {
  date_menu: string;
  solde: number;
  prix: number | null;
  sans_tarif: boolean;
  compte_possible: boolean;
  raison_compte_impossible: string | null;
  mode_paiement_prefere: ModePaiement;
  mode_par_defaut: ModePaiement;
  /** Équipe « repas offert » : rien à payer */
  offert?: boolean;
}

export interface CommandeModel {
  id: number;
  statut: CommandeStatut;
  date_commande: string;
  date_annulation: string | null;
  /** Annulation faite par un gestionnaire / administrateur (et non par l'agent) */
  annulee_par_nom?: string | null;
  annulee_par_gestionnaire?: boolean;
  // lecture
  plat_detail?: PlatModel;
  menu_detail?: MenulistModel;
  user_nom: string;
  user_agence: string | null;
  user_id?: number;
  user_username?: string;
  /** Paiement : mode choisi, changement possible jusqu'à la date limite de commande */
  mode_paiement?: ModePaiement;
  mode_paiement_libelle?: string;
  mode_paiement_modifiable?: boolean;
  mode_paiement_limite?: string;
  /** Règlement effectif (null : retenue sur salaire à la clôture) */
  paiement?: { mode: 'compte' | 'caisse' | 'retenue'; libelle: string; montant: number } | null;
}

export interface CommandeListModel {
  count:    number;
  next:     string | null;
  previous: string | null;
  results:  CommandeModel[];
}

/** Payload pour créer une commande */
export interface CommandeCreatePayload {
  menu_id: number;
  plat_id: number;
  user_id?: number;
  /** Absent : préférence de l'employé (compte si le solde suffit, sinon retenue) */
  mode_paiement?: ModePaiement;
}

/** Vue groupée par user (endpoint par-menu) */
export interface CommandeParUserModel {
  user_id:   number;
  user_nom:  string;
  commandes: CommandeModel[];
  a_retire:  boolean;
}

/** Résultat de la recherche par badge */
export interface RechercheParBadgeResult {
  user_id:   number;
  user_nom:  string;
  badge:     string;
  a_retire:  boolean;
  /** Heure du retrait déjà enregistré (si a_retire) */
  date_retrait?: string | null;
  /** Employé d'une autre agence que celle du menu (agence actuelle de l'employé) */
  externe?: boolean;
  agence_origine_id?: number | null;
  agence_origine?: string | null;
  commandes: CommandeModel[];
}

// ── Retrait ──────────────────────────────────────────────────

export interface RetraitModel {
  id: number;
  date_retrait: string;
  badge_matricule: string;
  user_nom: string;
  menu_detail: MenulistModel;
}

export interface RetraitCreatePayload {
  user_id: number;
  menu_id: number;
  badge_matricule: string;
}

export interface RetraitListModel {
  count:    number;
  next:     string | null;
  previous: string | null;
  results:  RetraitModel[];
}
