import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { RoleGuard } from 'src/app/core/guards/role.guard';
import { ADMINS, GESTIONNAIRES } from 'src/app/core/helpers/roles';
import { DashboardentretienvehiculeComponent } from './dashboardentretienvehicule/dashboardentretienvehicule.component';
import { DashboardCantineComponent } from './dashboard-cantine/dashboard-cantine.component';


const routes: Routes = [
  {
    path: "",
    component: DashboardCantineComponent,
    canActivate: [RoleGuard],
    data: { roles: GESTIONNAIRES }
  },
  {
    path: "dashboardentretienvehicule",
    component: DashboardentretienvehiculeComponent,
    canActivate: [RoleGuard],
    data: { roles: ADMINS }
  },
  {
    path: "dashboardCantine",
    component: DashboardCantineComponent,
    canActivate: [RoleGuard],
    data: { roles: GESTIONNAIRES }
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class DashboardsRoutingModule { }
