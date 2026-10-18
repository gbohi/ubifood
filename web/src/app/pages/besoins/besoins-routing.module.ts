import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RoleGuard } from 'src/app/core/guards/role.guard';
import { ADMINS } from 'src/app/core/helpers/roles';

// Component
import { ListBesoinComponent } from './list-besoin/list-besoin/list-besoin.component';

// Module réservé aux administrateurs (super_admin, admin)
const routes: Routes = [
  {
    path: 'list-besoin',
    component: ListBesoinComponent,
    canActivate: [RoleGuard],
    data: { roles: ADMINS }
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class BesoinsRoutingModule { }
