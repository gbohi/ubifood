import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

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
    component: AgenceComponent
  },
  {
    path: 'etat',
    component: EtatComponent
  }, 
  {
    path: 'priorite',
    component: PrioriteComponent
  },
  {
    path: 'statut',
    component: StatutComponent
  }, 
  {
    path: 'typebesoin',
    component: TypebesoinComponent
  },
  {
    path: 'departement',
    component: DepartementComponent
  },
  {
    path: 'role',
    component: RoleComponent
  },
  {
    path: 'user',
    component: UserComponent
  },
  {
    path: 'typeplat',
    component: TypeplatComponent
  },
  {
    path: 'type-vehicule',
    component: TypeVehiculeComponent
  },
  {
    path: 'type-equipe',
    component: TypeequipeComponent
  },
  {
    path: 'fonction',
    component: FonctionComponent
  },
  {
    path: 'categorie-salarie',
    component: CategoriesalarieComponent
  },
  {
    path: 'prestataire',
    component: PrestataireComponent
  },
  {
    path: 'poste',
    component: PosteComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ParametresRoutingModule { }
