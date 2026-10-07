import { NgModule } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';

import { PlanComptableRoutingModule } from './plan-comptable-routing.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { PaginationModule } from 'ngx-bootstrap/pagination';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ModalModule } from 'ngx-bootstrap/modal';
import { BsDropdownModule } from 'ngx-bootstrap/dropdown';
import { NgApexchartsModule } from 'ng-apexcharts';
import { TabsModule } from 'ngx-bootstrap/tabs';
import { SimplebarAngularModule } from 'simplebar-angular';
import { DROPZONE_CONFIG, DropzoneConfigInterface, DropzoneModule } from 'ngx-dropzone-wrapper';
import { CategoriecomptableComponent } from './categoriecomptable/categoriecomptable/categoriecomptable.component';
import { ClassecomptableComponent } from './classecomptable/classecomptable/classecomptable.component';
import { PostereportingComponent } from './postereporting/postereporting/postereporting.component';
import { ComptecomptableComponent } from './comptecomptable/comptecomptable/comptecomptable.component';

const DEFAULT_DROPZONE_CONFIG: DropzoneConfigInterface = {
  // Change this to your upload POST address:
  url: 'https://httpbin.org/post',
  maxFilesize: 50,
  acceptedFiles: 'image/*'
};

@NgModule({
  declarations: [
    CategoriecomptableComponent,
    ClassecomptableComponent,
    ComptecomptableComponent,
    PostereportingComponent
  ],
  imports: [
    CommonModule,
    PlanComptableRoutingModule,
    SharedModule,
    PaginationModule.forRoot(),
    FormsModule,
    ReactiveFormsModule,
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
export class PlanComptableModule { }
