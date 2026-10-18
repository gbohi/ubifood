import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { RoleGuard } from 'src/app/core/guards/role.guard';
import { GESTIONNAIRES } from 'src/app/core/helpers/roles';
import { DashboardCantineComponent } from './dashboard-cantine/dashboard-cantine.component';


const routes: Routes = [
  {
    path: "",
    component: DashboardCantineComponent,
    canActivate: [RoleGuard],
    data: { roles: GESTIONNAIRES }
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
