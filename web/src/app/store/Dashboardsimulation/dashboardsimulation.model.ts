// Un item d'une simulation
export interface Simulation {
  id: number;
  matricule: string;
  categorie: string;
  date_naissance: string;
  salaire_base: string;
  sursalaire: string;
  salaire_brut_2025: string;
  created_at: string;
  historique: HistoriqueSimulation[];
  total_matricule: Totaux;
  state?: boolean; // ajouté côté frontend
}

// Données annuelles d'une simulation
export interface HistoriqueSimulation {
  id: number;
  annee: number;
  age: number;
  salaire: string;
  taux_augmentation: string;
  augmentation: string;
  cotisation: string;
  simulation: number;
}

// Totaux génériques (utilisés pour total_matricule, total_global, total_par_annee)
export interface Totaux {
  salaire: number;
  augmentation: number;
  cotisation: number;
}

// Contenu du champ "results" dans le JSON
export interface SimulationResultsWrapper {
  results: Simulation[];
  total_global: Totaux;
  total_par_annee: { [annee: number]: Totaux }; // exemple : { "2028": {...}, "2029": {...} }
}

// Réponse complète du backend
export interface SimulationListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: SimulationResultsWrapper;
}
