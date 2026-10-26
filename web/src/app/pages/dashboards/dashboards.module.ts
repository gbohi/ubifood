import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// Page route
import { DashboardsRoutingModule } from './dashboards-routing.module';
import { SharedModule } from 'src/app/shared/shared.module';

// Fenêtre « Voir le détail » du service du jour (BsModalService)
import { ModalModule } from 'ngx-bootstrap/modal';

// component
import { DashboardCantineComponent } from './dashboard-cantine/dashboard-cantine.component';

// Les graphiques ont rejoint la page Cantine › Statistiques (module cantines).
@NgModule({
  declarations: [
    DashboardCantineComponent
  ],
  imports: [
    CommonModule,
    DashboardsRoutingModule,
    SharedModule,
    FormsModule,
    ReactiveFormsModule,
    ModalModule.forRoot()
  ]
})
export class DashboardsModule { }
