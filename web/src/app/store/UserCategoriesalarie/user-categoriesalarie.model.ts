// src/app/store/UserCategoriesalarie/user-categoriesalarie.model.ts

export interface UserCategoriesalarieModel {
  id?:                       number;
  user?:                     number;
  categoriesalarie?:         number;
  categoriesalarie_libelle?: string;
  statut?:                   number;
  statut_libelle?:           string;
  date_debut?:               string;
  date_fin?:                 string | null;
  _isNew?:                   boolean;
  _isDeleted?:               boolean;
  _hasError?:                boolean;
}
