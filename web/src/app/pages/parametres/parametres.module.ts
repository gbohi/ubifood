import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// Page route
import { ParametresRoutingModule } from './parametres-routing.module';
import { SharedModule } from 'src/app/shared/shared.module';

// Date Format
import { DatePipe } from '@angular/common';

// Apex Chart Package
import { NgApexchartsModule } from 'ng-apexcharts';

// dropzone
import { DropzoneModule } from 'ngx-dropzone-wrapper';
import { DROPZONE_CONFIG } from 'ngx-dropzone-wrapper';
import { DropzoneConfigInterface } from 'ngx-dropzone-wrapper';

// Simplebar
import { SimplebarAngularModule } from 'simplebar-angular';

// bootstrap component
import { PaginationModule } from 'ngx-bootstrap/pagination';
import { ModalModule } from 'ngx-bootstrap/modal';
import { BsDropdownModule } from 'ngx-bootstrap/dropdown';
import { TabsModule } from 'ngx-bootstrap/tabs';

// component
import { AgenceComponent } from './agence/agence.component';
import { EtatComponent } from './etat/etat.component';
import { PrioriteComponent } from './priorite/priorite.component';
import { StatutComponent } from './statut/statut.component';
import { TypebesoinComponent } from './typebesoin/typebesoin.component';
import { DepartementComponent } from './departement/departement.component';
import { RoleComponent } from './role/role.component';
import { UserComponent } from './user/user.component';
import { TypeplatComponent } from './typeplat/typeplat.component';
import { TypeVehiculeComponent } from './type-vehicule/type-vehicule.component';
import { TypeequipeComponent } from './typeequipe/typeequipe/typeequipe.component';
import { FonctionComponent } from './fonction/fonction.component';
import { CategoriesalarieComponent } from './categoriesalarie/categoriesalarie.component';
import { PrestataireComponent } from './prestataire/prestataire.component';
import { PosteComponent } from './poste/poste.component';

const DEFAULT_DROPZONE_CONFIG: DropzoneConfigInterface = {
  // Change this to your upload POST address:
  url: 'https://httpbin.org/post',
  maxFilesize: 50,
  acceptedFiles: 'image/*'
};

@NgModule({
  declarations: [
    AgenceComponent,
    EtatComponent,
    PrioriteComponent,
    StatutComponent,
    TypebesoinComponent,
    DepartementComponent,
    RoleComponent,
    UserComponent,
    TypeplatComponent,
    TypeVehiculeComponent,
    TypeequipeComponent,
    FonctionComponent,
    CategoriesalarieComponent,
    PrestataireComponent,
    PosteComponent
  ],
  imports: [
    CommonModule,
    SharedModule,
    PaginationModule.forRoot(),
    FormsModule,
    ReactiveFormsModule,
    ParametresRoutingModule,
    ModalModule.forRoot(),
    BsDropdownModule.forRoot(),
    NgApexchartsModule,
    TabsModule.forRoot(),
    SimplebarAngularModule,
    DropzoneModule
  ],
  providers: [
    DatePipe,
    {
      provide: DROPZONE_CONFIG,
      useValue: DEFAULT_DROPZONE_CONFIG
    }
  ],

})
export class ParametresModule { }