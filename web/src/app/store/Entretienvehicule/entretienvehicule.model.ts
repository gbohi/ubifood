export interface EntretienVehiculelistModel {
    id?: any;
    description?: string;           
    immatricule?: string;          
    date_entretien_vehicule?: string; 
    periode?: string;        
    debit?: number;              
    credit?: number;             
    solde?: number; 
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