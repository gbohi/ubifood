import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

// Component
import { LoginComponent } from './login/login.component';
import { MotDePasseOublieComponent } from './mot-de-passe-oublie/mot-de-passe-oublie.component';
import { SignalerUneAnomalieComponent } from './signaler-une-anomalie/signaler-une-anomalie.component';

const routes: Routes = [
  {
    path: 'mot-de-passe-oublie',
    component: MotDePasseOublieComponent
  },
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: 'signaler-une-anomalie',
    component: SignalerUneAnomalieComponent
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AccountRoutingModule { }
