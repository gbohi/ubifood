import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// Component
import { AnalyticsComponent } from './analytics/analytics.component';
import { CrmComponent } from './crm/crm.component';
import { IndexComponent } from './index/index.component';
import { LearningComponent } from './learning/learning.component';
import { RealEstateComponent } from './real-estate/real-estate.component';

//UBICI
import { DashboardentretienvehiculeComponent } from './dashboardentretienvehicule/dashboardentretienvehicule.component';
import { DashboardCantineComponent } from './dashboard-cantine/dashboard-cantine.component';


const routes: Routes = [
  {
    path: "",
    //component: IndexComponent
    component: DashboardCantineComponent
  },
  {
    path: "dashboardentretienvehicule",
    component: DashboardentretienvehiculeComponent
  },
  {
    path: "dashboardCantine",
    component: DashboardCantineComponent
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class DashboardsRoutingModule { }
