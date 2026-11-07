export interface TypeequipelistModel {
    id?: any;
    libelle?: any;
    /** Horaires de retrait propres à l'équipe (« HH:MM:SS »), vides : horaires de l'agence */
    heure_debut_retrait?: string | null;
    heure_fin_retrait?: string | null;
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