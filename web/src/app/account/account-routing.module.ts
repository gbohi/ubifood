import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

// Component
import { LoginComponent } from './login/login.component';
import { RegisterComponent } from './register/register.component';
import { SignalerUneAnomalieComponent } from './signaler-une-anomalie/signaler-une-anomalie.component';

const routes: Routes = [
  {
    path: 'auth', loadChildren: () => import('./auth/auth.module').then(m => m.AuthModule)
  },
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: 'register',
    component: RegisterComponent
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
