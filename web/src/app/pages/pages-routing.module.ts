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
    // Besoins : réservé aux administrateurs
    path: 'besoins', loadChildren: () => import('./besoins/besoins.module').then(m => m.BesoinsModule),
    canActivate: [RoleGuard], data: { roles: ADMINS }
  },
  {
    path: 'cantines', loadChildren: () => import('./cantines/cantines.module').then(m => m.CantinesModule)
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PagesRoutingModule { }
