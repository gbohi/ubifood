// src/app/store/Departement/departement.model.ts

export interface DepartementlistModel {
  id?:               any;
  libelle_service?:  string;   // champ du modèle Django Service renommé Departement
}

export interface ApiResponse<T> {
  count:    number;
  next:     string | null;
  previous: string | null;
  results:  T[];
}

export interface ApiError {
  status:   number;
  message:  string;
  errors?: { [field: string]: string[] };
}
