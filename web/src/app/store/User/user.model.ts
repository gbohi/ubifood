// src/app/store/User/user.model.ts

export interface UserModel {
  id?:               any;
  username?:         string;
  password?:         string;
  password2?:        string;
  email?:            string;
  nom?:              string;
  prenom?:           string;
  contact?:          string;
  poste_telephone?:  string;
  first_name?:       string;
  last_name?:        string;
  statut?:           number;
  statut_libelle?:   string;
  is_active?:        boolean;
  last_login?:       string;
  last_logout?:      string;
  // Groupes Django
  groups?:           number[];
  // Listes complètes (historique) — utilisées dans le détail / modification
  user_services?:          any[];
  user_agences?:           any[];
  user_postes?:            any[];
  user_categoriesalaries?: any[];
  user_allergies?:         any[];
  // ✅ Dernières lignes calculées par Django (SerializerMethodField)
  // Utilisées directement dans la LISTE pour l'affichage
  dernier_service?:           DernierServiceModel  | null;
  derniere_agence?:           DerniereAgenceModel  | null;
  dernier_poste?:             DernierPosteModel    | null;
  derniere_categoriesalarie?: DerniereCategorieModel | null;
}

// ── Interfaces des dernières lignes retournées par Django ──────

export interface DernierServiceModel {
  id:              number;
  service:         number;
  service_libelle: string | null;
  date_debut:      string | null;
  statut:          number;
  statut_libelle:  string | null;
}

export interface DerniereAgenceModel {
  id:           number;
  agence:       number;
  agence_nom:   string | null;
  date_debut:   string | null;
  statut:       number;
  statut_libelle: string | null;
}

export interface DernierPosteModel {
  id:            number;
  poste:         number;
  poste_libelle: string | null;
  date_debut:    string | null;
  statut:        number;
  statut_libelle: string | null;
}

export interface DerniereCategorieModel {
  id:                       number;
  categoriesalarie:         number;
  categoriesalarie_libelle: string | null;
  date_debut:               string | null;
  statut:                   number;
  statut_libelle:           string | null;
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
