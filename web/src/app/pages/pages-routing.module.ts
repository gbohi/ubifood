import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RoleGuard } from '../core/guards/role.guard';
import { ACCES_CAISSE, ADMINS, LECTURE_COMPTES, PRESTATAIRES } from '../core/helpers/roles';

const routes: Routes = [
  {
    path: '', loadChildren: () => import('./dashboards/dashboards.module').then(m => m.DashboardsModule)
  },
  {
    // Rôle vérifié route par route dans ParametresRoutingModule
    path: 'parametres', loadChildren: () => import('./parametres/parametres.module').then(m => m.ParametresModule)
  },
  {
    // Besoins : réservé aux administrateurs
    path: 'besoins', loadChildren: () => import('./besoins/besoins.module').then(m => m.BesoinsModule),
    canActivate: [RoleGuard], data: { roles: ADMINS }
  },
  {
    path: 'cantines', loadChildren: () => import('./cantines/cantines.module').then(m => m.CantinesModule)
  },
  {
    // Espace prestataire (responsable et agents de comptoir) ; rôle vérifié route par route
    path: 'prestataire', loadChildren: () => import('./prestataire/prestataire.module').then(m => m.PrestataireModule),
    canActivate: [RoleGuard], data: { roles: PRESTATAIRES }
  },
  {
    // Caisse et comptabilité (étape 2) ; rôle vérifié route par route
    path: 'caisse', loadChildren: () => import('./caisse/caisse.module').then(m => m.CaisseModule),
    canActivate: [RoleGuard], data: { roles: [...new Set([...ACCES_CAISSE, ...LECTURE_COMPTES])] }
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PagesRoutingModule { }
