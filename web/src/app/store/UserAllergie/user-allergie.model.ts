// src/app/store/UserAllergie/user-allergie.model.ts

export interface UserAllergieModel {
  id?:       number;
  user?:     number;
  libelle?:  string;
  _isNew?:   boolean;
  _isDeleted?: boolean;
  _hasError?:  boolean;
}
