// src/app/store/Prestataire/prestataire.model.ts

export interface PrestatairelistModel {
  id?:              any;
  libelle?:         string;
  date_debut?:      string;   // format YYYY-MM-DD
  date_fin?:        string | null;
  statut?:          number;   // FK vers Statut (clé primaire)
  statut_libelle?:  string;   // lecture seule — retourné par le serializer
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
