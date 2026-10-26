import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// Page Route
import { CantinesRoutingModule } from './cantines-routing.module';
import { SharedModule } from 'src/app/shared/shared.module';

// Select Droup down
import { NgSelectModule } from '@ng-select/ng-select';

// Range Slider

//Wizard

// Simplebar

// Flat Picker

// Count To

// Drop Zone
import { DropzoneModule } from 'ngx-dropzone-wrapper';
import { DROPZONE_CONFIG } from 'ngx-dropzone-wrapper';
import { DropzoneConfigInterface } from 'ngx-dropzone-wrapper';

import { PaginationModule } from 'ngx-bootstrap/pagination';
import { ModalModule } from 'ngx-bootstrap/modal';

import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';

// Component
import { ListePlatsComponent } from './liste-plats/liste-plats.component';
import { ListeMenusComponent } from './liste-menus/liste-menus.component';
import { ListeCommandesComponent } from './liste-commandes/liste-commandes.component';

import { PlanningMenuComponent } from './planningmenu/planningmenu.component';
import { GestionCommandesComponent } from './gestion-commandes/gestion-commandes.component';
import { MesCommandesComponent } from './mes-commandes/mes-commandes.component';
import { RetraitCommandeComponent } from './retrait-commande/retrait-commande/retrait-commande.component';
import { FacturationCommandeComponent } from './facturation-commande/facturation-commande.component';
import { OngletPrestatairesComponent } from './facturation-commande/onglet-prestataires/onglet-prestataires.component';
import { AvisPlatsComponent } from './avis-plats/avis-plats.component';
import { AccueilEmployeComponent } from './accueil-employe/accueil-employe.component';
import { StatistiquesComponent } from './statistiques/statistiques.component';
import { StatBlocComponent } from './statistiques/stat-bloc.component';

// Graphiques (page Statistiques)
import { NgApexchartsModule } from 'ng-apexcharts';

// Aucun envoi par Dropzone : les fichiers sont collectés côté composant puis
// envoyés au backend avec le formulaire (FormData). L'URL n'est qu'un placeholder.
const DEFAULT_DROPZONE_CONFIG: DropzoneConfigInterface = {
  url: '/',
  autoProcessQueue: false,
  maxFilesize: 5, // Mo
  acceptedFiles: '.jpg,.jpeg,.png,.webp'
};

@NgModule({
  declarations: [
    ListePlatsComponent,
    ListeMenusComponent,
    ListeCommandesComponent,
    PlanningMenuComponent,
    GestionCommandesComponent,
    MesCommandesComponent,
    RetraitCommandeComponent,
    FacturationCommandeComponent,
    OngletPrestatairesComponent,
    AvisPlatsComponent,
    AccueilEmployeComponent,
    StatistiquesComponent
  ],
  imports: [
    CommonModule,
    CantinesRoutingModule,
    SharedModule,
    PaginationModule.forRoot(),
    ModalModule.forRoot(),
    FormsModule,
    ReactiveFormsModule,
    BsDatepickerModule.forRoot(),
    DropzoneModule,
    NgSelectModule,
    NgApexchartsModule,
    StatBlocComponent
  ],
  providers: [
    DatePipe,
    {
      provide: DROPZONE_CONFIG,
      useValue: DEFAULT_DROPZONE_CONFIG
    }
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class CantinesModule { }


