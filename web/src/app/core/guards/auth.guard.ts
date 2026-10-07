// src/app/core/guards/auth.guard.ts
import { Injectable } from '@angular/core';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { TokenStorageService } from '../services/token-storage.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard {

  constructor(
    private router: Router,
    private tokenStorage: TokenStorageService
  ) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    if (this.tokenStorage.getAccessToken()) {
      return true;
    }

    /**
     * CORRIGÉ : '/login' → '/auth/login'
     *
     * Dans app-routing.module.ts, AccountModule est chargé sous '/auth'.
     * AccountRoutingModule définit 'login' → LoginComponent.
     * La route complète est donc '/auth/login'.
     *
     * Résumé des routes disponibles :
     *   /auth/login          → LoginComponent
     *   /auth/register       → RegisterComponent
     *   /auth/auth/signin    → SigninComponent  (template Themeforest)
     *   /auth/auth/pass-reset → PassResetComponent
     */
    this.router.navigate(['/auth/login'], {
      queryParams: { returnUrl: state.url }
    });
    return false;
  }
}
