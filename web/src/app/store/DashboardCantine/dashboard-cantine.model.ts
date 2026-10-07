// src/app/store/DashboardCantine/dashboard-cantine.model.ts

export interface KpisCantine {
  total_commandes:  number;
  total_en_attente: number;
  total_retirees:   number;
  total_annulees:   number;
  total_menus:      number;
  taux_retrait:     number;
  taux_annulation:  number;
}

export interface ParMoisItem {
  total:      number;
  en_attente: number;
  retiree:    number;
  annulee:    number;
}

export interface TopPlatItem {
  nom:       string;
  type_plat: string;
  nombre:    number;
}

export interface ParAgenceItem {
  agence:     string;
  total:      number;
  en_attente: number;
  retiree:    number;
  annulee:    number;
}

export interface ParTypeEquipeItem {
  typeequipe: string;
  total:      number;
}

export interface ParTypePlatItem {
  type_plat: string;
  total:     number;
}

export interface MenuRecentItem {
  id:           number;
  date_menu:    string;
  agence:       string;
  typeequipe:   string;
  nb_commandes: number;
}

export interface EvolutionHebdoItem {
  label: string;
  total: number;
}

// ── Facturation prestataire ───────────────────────────────────

export interface FactAgenceItem {
  agence:        string;
  montant:       number;
  nb_commandes:  number;
}

export interface FactPrestataireItem {
  prestataire:  string;
  montant:      number;
  nb_commandes: number;
}

export interface FactCategorieItem {
  categorie:    string;
  montant:      number;
  nb_commandes: number;
}

export interface FactFournisseur {
  total_montant:    number;
  par_mois:         { [mois: number]: number };
  par_agence:       FactAgenceItem[];
  par_prestataire:  FactPrestataireItem[];
}

export interface FactEmploye {
  total_montant:  number;
  par_mois:       { [mois: number]: number };
  par_agence:     FactAgenceItem[];
  par_categorie:  FactCategorieItem[];
}

// ── Données globales ──────────────────────────────────────────

export interface EvolutionParDateItem {
  date:       string;
  en_attente: number;
  retiree:    number;
  annulee:    number;
}

export interface DashboardCantineData {
  kpis:             KpisCantine;
  par_mois:         { [mois: number]: ParMoisItem };
  top_plats:        TopPlatItem[];
  par_agence:       ParAgenceItem[];
  par_typeequipe:   ParTypeEquipeItem[];
  par_typeplat:     ParTypePlatItem[];
  menus_recents:    MenuRecentItem[];
  evolution_hebdo:   EvolutionHebdoItem[];
  evolution_par_date: EvolutionParDateItem[];
  fact_fournisseur: FactFournisseur;
  fact_employe:     FactEmploye;
}

export interface DashboardCantineFilters {
  date_debut?:  string;
  date_fin?:    string;
  agences?:     number[];
  typeequipes?: number[];
  statuts?:     StatutCommande[];
}

export type StatutCommande = 'en_attente' | 'retiree' | 'annulee';

export interface StatutOption {
  value: StatutCommande;
  label: string;
  color: string;
}
