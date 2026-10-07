import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RoleGuard } from '../core/guards/role.guard';
import { ADMINS } from '../core/helpers/roles';

const routes: Routes = [
  {
    path: '', loadChildren: () => import('./dashboards/dashboards.module').then(m => m.DashboardsModule)
  },
  {
    // Rôle vérifié route par route dans ParametresRoutingModule
    path: 'parametres', loadChildren: () => import('./parametres/parametres.module').then(m => m.ParametresModule)
  },
  {
    path: 'besoins', loadChildren: () => import('./besoins/besoins.module').then(m => m.BesoinsModule)
  },
  {
    path: 'cantines', loadChildren: () => import('./cantines/cantines.module').then(m => m.CantinesModule)
  },/*
  {
    path: 'comptabilite', loadChildren: () => import('./comptabilite/comptabilite.module').then(m => m.ComptabiliteModule)
  },*/
  {
    path: 'moyens-generaux', loadChildren: () => import('./moyens-generaux/moyens-generaux.module').then(m => m.MoyensgenerauxModule),
    canActivate: [RoleGuard], data: { roles: ADMINS }
  },
  /*{
    path: 'ressources-humaines', loadChildren: () => import('./ressources-humaines/ressources-humaines.module').then(m => m.RessourcesHumainesModule)
  },*/
  {
    path: 'plan-comptable', loadChildren: () => import('./plan-comptable/plan-comptable.module').then(m => m.PlanComptableModule),
    canActivate: [RoleGuard], data: { roles: ADMINS }
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PagesRoutingModule { }
