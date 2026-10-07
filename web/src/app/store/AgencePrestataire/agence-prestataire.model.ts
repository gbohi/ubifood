// src/app/store/AgencePrestataire/agence-prestataire.model.ts

export interface AgencePrestataireModel {
  id?:             number;
  prestataire?:    number;
  agence?:         number;
  agence_libelle?: string;   // lecture seule — retourné par le serializer
  date_debut?:     string;
  date_fin?:       string | null;
  statut?:         number;
  statut_libelle?: string;   // lecture seule — retourné par le serializer
  // Champs locaux pour gestion du tableau dynamique
  _isNew?:         boolean;
  _isDeleted?:     boolean;
  _hasError?:      boolean;
}
