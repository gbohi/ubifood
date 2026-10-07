// src/app/store/PlatPrestataire/plat-prestataire.model.ts

export interface PlatPrestataireModel {
  id?:             number;
  prestataire?:    number;
  montant?:        number | string;
  date_debut?:     string;
  date_fin?:       string | null;
  statut?:         number;
  statut_libelle?: string;
  // Champs locaux pour gestion du tableau dynamique
  _isNew?:         boolean;   // ligne ajoutée localement, pas encore sauvegardée
  _isDeleted?:     boolean;   // marquée pour suppression
  _hasError?:      boolean;   // erreur de validation locale
}
