// src/app/core/guards/role.guard.ts
import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { TokenStorageService } from '../services/token-storage.service';
import { aUnRole, accueilUtilisateur } from '../helpers/roles';

/**
 * Restreint une route aux rôles listés dans `data.roles`.
 *
 *   { path: 'user', component: UserComponent,
 *     canActivate: [RoleGuard], data: { roles: ADMINS } }
 *
 * Un utilisateur sans le rôle requis est renvoyé vers son accueil (accueilUtilisateur :
 * /cantines/accueil, tableau de bord, accueil ou comptoir de l'espace prestataire).
 * (Le backend refuse de toute façon les appels non autorisés : ce garde
 * évite d'afficher des pages vides ou en erreur.)
 */
@Injectable({ providedIn: 'root' })
export class RoleGuard {

  constructor(private router: Router, private tokenStorage: TokenStorageService) {}

  canActivate(route: ActivatedRouteSnapshot): boolean | UrlTree {
    return this.verifier(route);
  }

  canActivateChild(route: ActivatedRouteSnapshot): boolean | UrlTree {
    return this.verifier(route);
  }

  private verifier(route: ActivatedRouteSnapshot): boolean | UrlTree {
    const roles: string[] | undefined = route.data?.['roles'];
    const user = this.tokenStorage.getUser();
    if (aUnRole(user, roles)) {
      return true;
    }
    return this.router.parseUrl(accueilUtilisateur(user));
  }
}
