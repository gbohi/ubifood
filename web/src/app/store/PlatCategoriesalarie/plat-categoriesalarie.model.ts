// src/app/store/PlatCategoriesalarie/plat-categoriesalarie.model.ts

export interface PlatCategoriesalarieModel {
  id?:                  number;
  categoriesalarie?:    number;
  montant?:             number | string;
  date_debut?:          string;
  date_fin?:            string | null;
  statut?:              number;
  statut_libelle?:      string;   // lecture seule
  // Champs locaux pour gestion du tableau dynamique
  _isNew?:              boolean;
  _isDeleted?:          boolean;
  _hasError?:           boolean;
}
