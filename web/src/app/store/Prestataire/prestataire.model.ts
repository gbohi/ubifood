// src/app/store/Prestataire/prestataire.model.ts

export interface PrestatairelistModel {
  id?:              any;
  libelle?:         string;
  date_debut?:      string;   // format YYYY-MM-DD
  date_fin?:        string | null;
  statut?:          number;   // FK vers Statut (clé primaire)
  statut_libelle?:  string;   // lecture seule — retourné par le serializer
  // Coordonnées (affichées sur la facture PDF)
  contact_nom?:        string;
  adresse?:            string;
  ville?:              string;
  telephone?:          string;
  email?:              string;
  identifiant_fiscal?: string;
  registre_commerce?:  string;
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
