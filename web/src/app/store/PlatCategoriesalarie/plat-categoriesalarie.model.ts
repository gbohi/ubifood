// src/app/store/PlatCategoriesalarie/plat-categoriesalarie.model.ts

export interface PlatCategoriesalarieModel {
  id?:                  number;
  categoriesalarie?:    number;
  montant?:             number | string;
  /** Type de plat (Standard, Complet…) ; null : tarif « tous types » */
  type_plat?:      number | null;
  type_plat_libelle?: string;   // lecture seule
  date_debut?:          string;
  date_fin?:            string | null;
  statut?:              number;
  statut_libelle?:      string;   // lecture seule
  // Champs locaux pour gestion du tableau dynamique
  _isNew?:              boolean;
  _isDeleted?:          boolean;
  _hasError?:           boolean;
}
