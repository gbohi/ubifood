// src/app/core/guards/espace.guard.ts
import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { TokenStorageService } from '../services/token-storage.service';
import { ESPACE_CAISSE, ESPACE_PRESTATAIRE, accueilUtilisateur, estCaisseSeule, estPrestataire } from '../helpers/roles';

/**
 * Cloisonnement des espaces (posé sur toutes les pages connectées) :
 *  - un compte prestataire / agent de comptoir ne peut ouvrir que /prestataire/… :
 *    toute autre adresse (tableau de bord, commandes, paramètres…) le renvoie
 *    vers son accueil (le serveur refuserait de toute façon ces appels : 403) ;
 *  - un compte UbiPharm qui ouvre /prestataire/… est renvoyé vers son accueil ;
 *  - un compte limité à la caisse (caissier ou comptabilité sans rôle employé ni
 *    de gestion) reste dans /caisse/… (les autres écrans ne le concernent pas).
 * Les rôles fins (responsable / agent, caissier / comptabilité) sont vérifiés
 * route par route (RoleGuard).
 */
@Injectable({ providedIn: 'root' })
export class EspaceGuard {

  constructor(private router: Router, private tokenStorage: TokenStorageService) {}

  canActivateChild(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree {
    const user = this.tokenStorage.getUser();
    const chemin = state.url.split(/[?#]/)[0];
    const dans = (prefixe: string) => chemin === prefixe || chemin.startsWith(prefixe + '/');
    const dansEspace = dans(ESPACE_PRESTATAIRE);
    let autorise = estPrestataire(user) === dansEspace;
    if (autorise && estCaisseSeule(user)) autorise = dans(ESPACE_CAISSE);
    if (autorise) return true;
    const accueil = accueilUtilisateur(user);
    // Pas de boucle : l'accueil est toujours dans le bon espace
    return chemin === accueil ? true : this.router.parseUrl(accueil);
  }
}
