// src/app/store/Commande/commande.model.ts

import { PlatModel } from '../Plat/plat.model';
import { MenulistModel } from '../Menu/menu.model';

export type CommandeStatut = 'en_attente' | 'annulee' | 'retiree';

export interface CommandeModel {
  id: number;
  statut: CommandeStatut;
  date_commande: string;
  date_annulation: string | null;
  // lecture
  plat_detail?: PlatModel;
  menu_detail?: MenulistModel;
  user_nom: string;
  user_agence: string | null;
  user_id?: number;
  user_username?: string;
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
