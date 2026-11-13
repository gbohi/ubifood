// Suivi des repas (backend api/suivi_repas.py) : frise des étapes d'un service
// ou du repas d'un employé.
export type CodeEtapeSuivi = 'confirmee' | 'preparation' | 'en_route' | 'arrive' | 'retire';

export interface EtapeSuivi {
  code: CodeEtapeSuivi; libelle: string; statut: 'fait' | 'en_cours' | 'a_venir';
  heure: string | null; prevu: string | null; auto: boolean; par: string | null;
}

export interface IncidentSuivi {
  id: number; type: 'retard' | 'autre'; type_libelle: string; heure_prevue: string | null;
  message: string; le: string; heure: string | null;
}

export interface EtatSuivi {
  etapes: EtapeSuivi[]; etape_courante: CodeEtapeSuivi | null;
  prochaine_action: 'preparation' | 'en_route' | 'arrive' | null; prochaine_action_libelle: string | null;
  statut: 'confirmee' | 'preparation' | 'en_route' | 'retard' | 'arrive' | 'retire'; statut_libelle: string;
  message: string; incident: IncidentSuivi | null;
  heure_debut: string; heure_fin: string; retrait_lendemain: boolean;
}

export interface ServiceSuivi extends EtatSuivi {
  menu_id: number; date_menu: string; agence_id: number; agence: string; equipe: string | null;
  prestataire_id: number | null; prestataire: string; nb_repas: number; nb_retires: number;
  ponctualite?: { statut: 'a_l_heure' | 'retard' | 'non_signale' | 'a_venir'; retard_minutes: number | null; arrivee: string | null };
}

export interface SuiviRepasEmploye extends EtatSuivi {
  commande_id: number; menu_id: number; date_menu: string; plat: string; agence: string;
  prestataire: string; equipe: string | null;
}

export interface ReglageEtape { actif: boolean; push: boolean; auto?: boolean; auto_heures?: number | null }
export type ReglagesEtapes = Record<CodeEtapeSuivi, ReglageEtape>;

export const ICONES_ETAPES: Record<CodeEtapeSuivi, string> = {
  confirmee: 'ri-check-line', preparation: 'ri-fire-line', en_route: 'ri-truck-line',
  arrive: 'ri-store-2-line', retire: 'ri-hand-heart-line',
};
