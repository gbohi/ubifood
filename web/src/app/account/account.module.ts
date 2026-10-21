import { NgModule } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule,ReactiveFormsModule } from '@angular/forms';

// Page Route
import { AccountRoutingModule } from './account-routing.module';

// Component
import { LoginComponent } from './login/login.component';
import { MotDePasseOublieComponent } from './mot-de-passe-oublie/mot-de-passe-oublie.component';

import { AuthPanneauComponent } from './auth-panneau/auth-panneau.component';

@NgModule({
  declarations: [
    LoginComponent,
    MotDePasseOublieComponent,
    AuthPanneauComponent
  ],
  imports: [
    CommonModule,
    AccountRoutingModule,
    FormsModule,
    ReactiveFormsModule,
  ],
    providers: [
      DatePipe
    ]
})
export class AccountModule { }
