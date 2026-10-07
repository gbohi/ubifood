import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RoleGuard } from 'src/app/core/guards/role.guard';
import { ADMINS, GESTIONNAIRES } from 'src/app/core/helpers/roles';

import { AgenceComponent } from './agence/agence.component';
import { EtatComponent } from './etat/etat.component';
import { PrioriteComponent } from './priorite/priorite.component';
import { ServiceComponent } from './service/service.component';
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


const routes: Routes = [
  {
    path: 'agence',
    component: AgenceComponent,
    canActivate: [RoleGuard],
    data: { roles: ADMINS }
  },
  {
    path: 'etat',
    component: EtatComponent,
    canActivate: [RoleGuard],
    data: { roles: ADMINS }
  }, 
  {
    path: 'priorite',
    component: PrioriteComponent,
    canActivate: [RoleGuard],
    data: { roles: ADMINS }
  },
  {
    path: 'statut',
    component: StatutComponent,
    canActivate: [RoleGuard],
    data: { roles: ADMINS }
  }, 
  {
    path: 'typebesoin',
    component: TypebesoinComponent,
    canActivate: [RoleGuard],
    data: { roles: ADMINS }
  },
  {
    path: 'departement',
    component: DepartementComponent,
    canActivate: [RoleGuard],
    data: { roles: ADMINS }
  },
  {
    path: 'role',
    component: RoleComponent,
    canActivate: [RoleGuard],
    data: { roles: ADMINS }
  },
  {
    path: 'user',
    component: UserComponent,
    canActivate: [RoleGuard],
    data: { roles: ADMINS }
  },
  {
    path: 'typeplat',
    component: TypeplatComponent,
    canActivate: [RoleGuard],
    data: { roles: GESTIONNAIRES }
  },
  {
    path: 'type-vehicule',
    component: TypeVehiculeComponent,
    canActivate: [RoleGuard],
    data: { roles: ADMINS }
  },
  {
    path: 'type-equipe',
    component: TypeequipeComponent,
    canActivate: [RoleGuard],
    data: { roles: GESTIONNAIRES }
  },
  {
    path: 'fonction',
    component: FonctionComponent,
    canActivate: [RoleGuard],
    data: { roles: ADMINS }
  },
  {
    path: 'categorie-salarie',
    component: CategoriesalarieComponent,
    canActivate: [RoleGuard],
    data: { roles: ADMINS }
  },
  {
    path: 'prestataire',
    component: PrestataireComponent,
    canActivate: [RoleGuard],
    data: { roles: GESTIONNAIRES }
  },
  {
    path: 'poste',
    component: PosteComponent,
    canActivate: [RoleGuard],
    data: { roles: ADMINS }
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ParametresRoutingModule { }
