import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// Page route
import { DashboardsRoutingModule } from './dashboards-routing.module';
import { SharedModule } from 'src/app/shared/shared.module';

// Apex Chart Package
// Pas de TooltipModule (ngx-bootstrap) ici : son sélecteur [tooltip] s'appliquait
// aux <apx-chart [tooltip]="..."> et affichait « [object Object] » au survol.
import { NgApexchartsModule } from 'ng-apexcharts';
import { NgSelectModule } from '@ng-select/ng-select';

// component
import { DashboardCantineComponent } from './dashboard-cantine/dashboard-cantine.component';

@NgModule({
  declarations: [
    DashboardCantineComponent
  ],
  imports: [
    CommonModule,
    DashboardsRoutingModule,
    SharedModule,
    NgApexchartsModule,
    FormsModule,
    ReactiveFormsModule,
    NgSelectModule
  ]
})
export class DashboardsModule { }
