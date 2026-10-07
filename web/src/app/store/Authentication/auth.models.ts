// src/app/store/Authentication/auth.models.ts

export class User {
  id?: number;
  username?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  email?: string;

  /**
   * CORRIGÉ : champ token supprimé.
   * AVANT : token était sur le modèle User → on mélangeait les données
   *         utilisateur et les tokens d'authentification dans le même objet.
   * APRÈS : les tokens (access/refresh) sont gérés exclusivement par
   *         TokenStorageService. User ne contient que les données métier.
   */
}
