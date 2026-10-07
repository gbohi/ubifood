// src/app/store/Poste/poste.model.ts

export interface PosteModel {
  id?:               any;
  libelle?:          string;
  fonction?:         number;
  service?:          number;
  fonction_libelle?: string;   // lecture seule
  service_libelle?:  string;   // lecture seule
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
