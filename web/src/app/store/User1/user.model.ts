export interface UserlistModel {
    id?: any;
    name?: any;
    username?: any;
    password?: any;
    password2?: any;
    email?: any;
    nom?: any;
    prenom?: any;
    contact?: any;
    poste_telephone?: any;
    statut?: any;
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