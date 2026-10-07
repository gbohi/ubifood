// src/app/store/UserAgence/user-agence.model.ts

export interface UserAgenceModel {
  id?:             number;
  user?:           number;
  agence?:         number;
  agence_libelle?: string;
  statut?:         number;
  statut_libelle?: string;
  date_debut?:     string;
  date_fin?:       string | null;
  _isNew?:         boolean;
  _isDeleted?:     boolean;
  _hasError?:      boolean;
}
