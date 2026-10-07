import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// Page Route
import { CantinesRoutingModule } from './cantines-routing.module';
import { SharedModule } from 'src/app/shared/shared.module';

// Select Droup down
import { NgSelectModule } from '@ng-select/ng-select';

// Range Slider
import { NgxSliderModule } from 'ngx-slider-v2';

//Wizard
import { CdkStepperModule } from '@angular/cdk/stepper';
import { NgStepperModule } from 'angular-ng-stepper';

// Simplebar
import { SimplebarAngularModule } from 'simplebar-angular';

// Flat Picker
import { FlatpickrModule } from 'angularx-flatpickr';

// Count To
import { CountUpModule } from 'ngx-countup';

// Drop Zone
import { DropzoneModule } from 'ngx-dropzone-wrapper';
import { DROPZONE_CONFIG } from 'ngx-dropzone-wrapper';
import { DropzoneConfigInterface } from 'ngx-dropzone-wrapper';

import { BsDropdownModule } from 'ngx-bootstrap/dropdown';
import { PaginationModule } from 'ngx-bootstrap/pagination';
import { ModalModule } from 'ngx-bootstrap/modal';
import { AccordionModule } from 'ngx-bootstrap/accordion';
import { TabsModule } from 'ngx-bootstrap/tabs';
import { RatingModule } from 'ngx-bootstrap/rating';

import { ProgressbarModule } from 'ngx-bootstrap/progressbar';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';

// Component
import { ListePlatsComponent } from './liste-plats/liste-plats.component';
import { ListeMenusComponent } from './liste-menus/liste-menus.component';
import { ListeCommandesComponent } from './liste-commandes/liste-commandes.component';

import { NgxEditorModule } from 'ngx-editor';
import { PlanningMenuComponent } from './planningmenu/planningmenu.component';
import { GestionCommandesComponent } from './gestion-commandes/gestion-commandes.component';
import { MesCommandesComponent } from './mes-commandes/mes-commandes.component';
import { RetraitCommandeComponent } from './retrait-commande/retrait-commande/retrait-commande.component';
import { FacturationCommandeComponent } from './facturation-commande/facturation-commande.component';
import { FacturationPrestataireComponent } from './facturation-prestataire/facturation-prestataire.component';

const DEFAULT_DROPZONE_CONFIG: DropzoneConfigInterface = {
  // Change this to your upload POST address:
  url: 'https://httpbin.org/post',
  maxFilesize: 50,
  acceptedFiles: 'image/*'
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
    FacturationPrestataireComponent
  ],
  imports: [
    CommonModule,
    CantinesRoutingModule,
    SharedModule,
    BsDropdownModule.forRoot(),
    PaginationModule.forRoot(),
    ModalModule.forRoot(),
    FormsModule,
    ReactiveFormsModule,
    AccordionModule.forRoot(),
    TabsModule.forRoot(),
    ProgressbarModule.forRoot(),
    TooltipModule.forRoot(),
    BsDatepickerModule.forRoot(),
    CountUpModule,
    SimplebarAngularModule,
    NgxEditorModule,
    DropzoneModule,
    NgStepperModule,
    CdkStepperModule,
    RatingModule,
    NgSelectModule,
    NgxSliderModule,
    FlatpickrModule.forRoot()
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


