import { NgModule } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule,ReactiveFormsModule } from '@angular/forms';

// Drop Zone
import { DropzoneModule } from 'ngx-dropzone-wrapper';
import { DROPZONE_CONFIG } from 'ngx-dropzone-wrapper';
import { DropzoneConfigInterface } from 'ngx-dropzone-wrapper';

// Page Route
import { AccountRoutingModule } from './account-routing.module';
import { AuthModule } from './auth/auth.module';

// Component
import { LoginComponent } from './login/login.component';
import { RegisterComponent } from './register/register.component';
import { SignalerUneAnomalieComponent } from './signaler-une-anomalie/signaler-une-anomalie.component';

const DEFAULT_DROPZONE_CONFIG: DropzoneConfigInterface = {
  // Change this to your upload POST address:
  url: 'https://httpbin.org/post',
  maxFilesize: 50,
  acceptedFiles: 'image/*'
};

@NgModule({
  declarations: [
    LoginComponent,
    RegisterComponent,
    SignalerUneAnomalieComponent
  ],
  imports: [
    CommonModule,
    AccountRoutingModule,
    AuthModule,
    FormsModule,
    ReactiveFormsModule,
    DropzoneModule,
  ],
    providers: [
      DatePipe,
      {
        provide: DROPZONE_CONFIG,
        useValue: DEFAULT_DROPZONE_CONFIG
      }
    ]
})
export class AccountModule { }
