// src/app/store/PlatPrestataire/plat-prestataire.model.ts

export interface PlatPrestataireModel {
  id?:             number;
  prestataire?:    number;
  montant?:        number | string;
  /** Type de plat (Standard, Complet…) ; null : tarif « tous types » */
  type_plat?:      number | null;
  type_plat_libelle?: string;   // lecture seule
  date_debut?:     string;
  date_fin?:       string | null;
  statut?:         number;
  statut_libelle?: string;
  // Champs locaux pour gestion du tableau dynamique
  _isNew?:         boolean;   // ligne ajoutée localement, pas encore sauvegardée
  _isDeleted?:     boolean;   // marquée pour suppression
  _hasError?:      boolean;   // erreur de validation locale
}
