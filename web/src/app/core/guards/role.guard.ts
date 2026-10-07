// src/app/core/guards/role.guard.ts
import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { TokenStorageService } from '../services/token-storage.service';
import { ACCUEIL_EMPLOYE, aUnRole } from '../helpers/roles';

/**
 * Restreint une route aux rôles listés dans `data.roles`.
 *
 *   { path: 'user', component: UserComponent,
 *     canActivate: [RoleGuard], data: { roles: ADMINS } }
 *
 * Un utilisateur sans le rôle requis est renvoyé vers « Mes commandes ».
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
    if (aUnRole(this.tokenStorage.getUser(), roles)) {
      return true;
    }
    return this.router.parseUrl(ACCUEIL_EMPLOYE);
  }
}
