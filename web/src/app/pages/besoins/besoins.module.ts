import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// Page Route
import { BesoinsRoutingModule } from './besoins-routing.module';
import { SharedModule } from 'src/app/shared/shared.module';

// Count To
import { CountUpModule } from 'ngx-countup';

// Drop Zone
import { DropzoneModule } from 'ngx-dropzone-wrapper';
import { DROPZONE_CONFIG } from 'ngx-dropzone-wrapper';
import { DropzoneConfigInterface } from 'ngx-dropzone-wrapper';

import { PaginationModule } from 'ngx-bootstrap/pagination';
import { ModalModule } from 'ngx-bootstrap/modal';
import { ProgressbarModule } from 'ngx-bootstrap/progressbar';
import { TooltipModule } from 'ngx-bootstrap/tooltip';

// Component
import { ListBesoinComponent } from './list-besoin/list-besoin/list-besoin.component';

// Les fichiers ne sont jamais envoyés par Dropzone (autoProcessQueue: false) :
// ils sont joints au FormData du besoin. Dropzone exige toutefois une URL.
const DEFAULT_DROPZONE_CONFIG: DropzoneConfigInterface = {
  url: '/',
  autoProcessQueue: false,
  maxFilesize: 50,
  // Mêmes extensions que le validateur du modèle BesoinDocument
  acceptedFiles: '.pdf,.docx,.jpg,.jpeg,.png',
  dictInvalidFileType: 'Type de fichier non autorisé (PDF, DOCX, JPG, PNG).',
  dictFileTooBig: 'Fichier trop volumineux ({{filesize}} Mo, maximum {{maxFilesize}} Mo).',
};

@NgModule({
  declarations: [
    ListBesoinComponent
  ],
  imports: [
    CommonModule,
    BesoinsRoutingModule,
    SharedModule,
    PaginationModule.forRoot(),
    ModalModule.forRoot(),
    FormsModule,
    ReactiveFormsModule,
    ProgressbarModule.forRoot(),
    TooltipModule.forRoot(),
    CountUpModule,
    DropzoneModule,
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
export class BesoinsModule { }
