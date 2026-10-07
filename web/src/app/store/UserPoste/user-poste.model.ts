// src/app/store/UserPoste/user-poste.model.ts

export interface UserPosteModel {
  id?:             number;
  user?:           number;
  poste?:          number;
  poste_libelle?:  string;
  statut?:         number;
  statut_libelle?: string;
  date_debut?:     string;
  date_fin?:       string | null;
  _isNew?:         boolean;
  _isDeleted?:     boolean;
  _hasError?:      boolean;
}
