// src/app/store/UserService/user-service.model.ts

export interface UserServiceModel {
  id?:              number;
  user?:            number;
  service?:         number;
  service_libelle?: string;
  statut?:          number;
  statut_libelle?:  string;
  date_debut?:      string;
  date_fin?:        string | null;
  _isNew?:          boolean;
  _isDeleted?:      boolean;
  _hasError?:       boolean;
}
