export interface BesoinlistModel {
  id?: number;                 // Identifiant du besoin (optionnel si c’est une création)
  reference?: string;           // Référence unique
  titre?: string;               // Titre du besoin
  description?: string;         // Description du besoin
  commentaire?: string;        // Commentaire éventuel
  typebesoin?: number;          // ID du type de besoin
  date_debut?: string;          // Date de début (format ISO string)
  date_fin?: string;            // Date de fin (format ISO string)
  etat?: number;                // ID de l’état
  priorite?: number;            // ID de la priorité
  user?: number;                // ID de l’utilisateur
}


export interface ApiResponse<T> {
    count: number;        // Nombre total d'éléments disponibles
    next: string | null;  // URL de la page suivante (null s'il n'y en a pas)
    previous: string | null; // URL de la page précédente (null s'il n'y en a pas)
    results: T[];         // Tableau contenant les données
  }
  
  /**
   * Interface pour représenter un objet d'erreur API
   */
  export interface ApiError {
    status: number;      // Code d'état HTTP
    message: string;     // Message d'erreur
    errors?: {           // Erreurs de validation par champ (optionnel)
      [field: string]: string[];
    };
  }

  /**
   * Statisqtique globale
   */
  export interface StatistiqueGlobale {
    par_etat: { etat: string; nombre: number }[];
    par_priorite: { priorite: string; nombre: number }[];
    total_non_cloture: number;
    total_besoin: number;
  }
  