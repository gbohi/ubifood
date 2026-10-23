// src/app/pages/parametres/accueil-parametres/accueil-parametres.component.ts
//
// Page d'accueil des paramètres (maquette « web-2-parametres ») : une carte par
// liste de paramètres, regroupées par thème, avec leur nombre d'éléments.
// Chaque carte n'est affichée qu'aux rôles autorisés par la route qu'elle ouvre
// (mêmes règles que ParametresRoutingModule).

import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { ADMINS, GESTIONNAIRES, aUnRole } from 'src/app/core/helpers/roles';

export interface CarteParametre {
  titre: string;
  description: string;
  icone: string;
  lien: string;
  roles: string[];
  /** Liste de l'API dont on affiche le nombre d'éléments (sans le préfixe /api/api/) */
  compte?: string;
  /** Mots-clés supplémentaires pour la recherche */
  motsCles?: string;
}

export interface GroupeParametres {
  titre: string;
  icone: string;
  /** Couleur de la pastille des cartes : p-bl, p-ve, p-or, p-ro */
  teinte: string;
  cartes: CarteParametre[];
}

/** Thèmes et cartes ; les rôles reprennent exactement ceux des routes */
export const GROUPES_PARAMETRES: GroupeParametres[] = [
  {
    titre: 'Société & affichage', icone: 'ri-building-2-line', teinte: 'p-bl',
    cartes: [
      { titre: 'Société', description: 'En-tête et logo des factures PDF', icone: 'ri-file-text-line',
        lien: '/parametres/societe', roles: ADMINS, motsCles: 'facture logo entreprise adresse' },
      { titre: 'Bannières mobile', description: "Images de l'accueil de l'application mobile", icone: 'ri-image-line',
        lien: '/parametres/bannieres', roles: ADMINS, compte: 'bannieres/?toutes=1', motsCles: 'mobile image accueil' },
      { titre: 'Fenêtre de connexion', description: 'Image affichée après la connexion (web et mobile)', icone: 'ri-window-line',
        lien: '/parametres/popup-connexion', roles: ADMINS, compte: 'popups-connexion/', motsCles: 'popup annonce' },
      { titre: 'Application mobile', description: 'APK Android, lien iPhone et page de téléchargement', icone: 'ri-smartphone-line',
        lien: '/parametres/application-mobile', roles: ADMINS, motsCles: 'apk android iphone ios testflight télécharger version' },
    ],
  },
  {
    titre: 'Personnel', icone: 'ri-team-line', teinte: 'p-ve',
    cartes: [
      { titre: 'Utilisateurs', description: 'Comptes, affectations, rôles, mots de passe', icone: 'ri-user-3-line',
        lien: '/parametres/user', roles: ADMINS, compte: 'users/', motsCles: 'agent employé compte mot de passe' },
      { titre: 'Rôles', description: 'Super administrateur, administrateur, gestionnaire, employé', icone: 'ri-shield-user-line',
        lien: '/parametres/role', roles: ADMINS, compte: 'groups/', motsCles: 'droits accès groupe' },
      { titre: 'Agences', description: 'Sites où la cantine est servie', icone: 'ri-map-pin-line',
        lien: '/parametres/agence', roles: ADMINS, compte: 'agences/', motsCles: 'site siège' },
      { titre: 'Départements', description: 'Services de rattachement des agents', icone: 'ri-organization-chart',
        lien: '/parametres/departement', roles: ADMINS, compte: 'services/', motsCles: 'service direction' },
      { titre: 'Postes', description: 'Postes occupés, par fonction et service', icone: 'ri-briefcase-4-line',
        lien: '/parametres/poste', roles: ADMINS, compte: 'postes/', motsCles: 'emploi métier' },
      { titre: 'Fonctions', description: 'Fonctions exercées par les agents', icone: 'ri-user-star-line',
        lien: '/parametres/fonction', roles: ADMINS, compte: 'fonctions/' },
      { titre: 'Catégories de salarié', description: 'Cadre, agent… et prix du repas par catégorie', icone: 'ri-price-tag-3-line',
        lien: '/parametres/categorie-salarie', roles: ADMINS, compte: 'categoriesalaries/', motsCles: 'tarif prix subvention' },
    ],
  },
  {
    titre: 'Cantine', icone: 'ri-restaurant-line', teinte: 'p-or',
    cartes: [
      { titre: 'Types de plat', description: 'Plat principal, dessert…', icone: 'ri-restaurant-2-line',
        lien: '/parametres/typeplat', roles: GESTIONNAIRES, compte: 'typeplats/', motsCles: 'plat menu' },
      { titre: "Types d'équipe", description: 'Journée, nuit… (services de repas)', icone: 'ri-time-line',
        lien: '/parametres/type-equipe', roles: GESTIONNAIRES, compte: 'typeequipes/', motsCles: 'équipe horaire' },
      { titre: 'Prestataires', description: 'Traiteurs, agences servies, plats et prix', icone: 'ri-truck-line',
        lien: '/parametres/prestataire', roles: GESTIONNAIRES, compte: 'prestataires/', motsCles: 'traiteur fournisseur tarif prix' },
    ],
  },
  {
    titre: 'Besoins', icone: 'ri-ticket-line', teinte: 'p-ro',
    cartes: [
      { titre: 'Types de besoin', description: 'Matériel, logiciel…', icone: 'ri-list-check-2',
        lien: '/parametres/typebesoin', roles: ADMINS, compte: 'typebesoins/' },
      { titre: 'Priorités', description: 'Urgence des besoins', icone: 'ri-flag-line',
        lien: '/parametres/priorite', roles: ADMINS, compte: 'priorites/' },
      { titre: 'Statuts', description: 'Statuts des comptes et des affectations', icone: 'ri-checkbox-circle-line',
        lien: '/parametres/statut', roles: ADMINS, compte: 'statuts/' },
      { titre: 'États', description: "Étapes de traitement d'un besoin", icone: 'ri-pulse-line',
        lien: '/parametres/etat', roles: ADMINS, compte: 'etats/' },
    ],
  },
];

@Component({
  selector: 'app-accueil-parametres',
  templateUrl: './accueil-parametres.component.html',
})
export class AccueilParametresComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly tokenStorage = inject(TokenStorageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = `${environment.apiUrl}/api/api/`;

  /** Thèmes réduits aux cartes accessibles à l'utilisateur */
  groupes: GroupeParametres[] = [];
  /** Nombre d'éléments par lien de carte (absent = en cours / indisponible) */
  comptes: Record<string, number> = {};
  recherche = '';

  ngOnInit(): void {
    const user = this.tokenStorage.getUser();
    this.groupes = GROUPES_PARAMETRES
      .map(g => ({ ...g, cartes: g.cartes.filter(c => aUnRole(user, c.roles)) }))
      .filter(g => g.cartes.length > 0);

    for (const carte of this.groupes.flatMap(g => g.cartes)) {
      if (!carte.compte) continue;
      const sep = carte.compte.includes('?') ? '&' : '?';
      this.http.get<any>(`${this.api}${carte.compte}${sep}page_size=1`).pipe(
        map(r => Array.isArray(r) ? r.length : Number(r?.count)),
        catchError(() => of(NaN)),
        takeUntilDestroyed(this.destroyRef),
      ).subscribe(n => { if (Number.isFinite(n)) this.comptes[carte.lien] = n; });
    }
  }

  get nbCartes(): number {
    return this.groupes.reduce((n, g) => n + g.cartes.length, 0);
  }

  /** Thèmes filtrés par la recherche (titre, description, mots-clés, thème) */
  get groupesFiltres(): GroupeParametres[] {
    const q = this.normaliser(this.recherche);
    if (!q) return this.groupes;
    return this.groupes
      .map(g => ({
        ...g,
        cartes: g.cartes.filter(c =>
          this.normaliser(`${g.titre} ${c.titre} ${c.description} ${c.motsCles ?? ''}`).includes(q)),
      }))
      .filter(g => g.cartes.length > 0);
  }

  private normaliser(s: string): string {
    return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }
}
