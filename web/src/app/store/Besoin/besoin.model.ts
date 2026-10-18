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

  // ── Champs en lecture seule renvoyés par BesoinSerializer ──
  created_at?: string;
  typebesoin_libelle?: string;
  etat_libelle?: string;
  priorite_libelle?: string;
  user_username?: string;
  user_nom?: string;
  user_prenom?: string;
  documents?: BesoinDocumentModel[];
  services?: BesoinServiceModel[];
}

/** Pièce jointe d'un besoin (BesoinDocumentSerializer) */
export interface BesoinDocumentModel {
  id: number;
  besoin: number;
  document: string;            // URL du fichier (/media/documents_besoins/...)
  date_creation?: string;
}

/** Service affecté à un besoin (BesoinServiceSerializer) */
export interface BesoinServiceModel {
  id: number;
  besoin: number;
  service: number;
  service_libelle?: string;
  date_creation?: string;
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
  