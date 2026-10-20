import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// Page route
import { ParametresRoutingModule } from './parametres-routing.module';
import { SharedModule } from 'src/app/shared/shared.module';

// Date Format
import { DatePipe } from '@angular/common';

// bootstrap component
import { PaginationModule } from 'ngx-bootstrap/pagination';
import { ModalModule } from 'ngx-bootstrap/modal';

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
import { TypeequipeComponent } from './typeequipe/typeequipe/typeequipe.component';
import { FonctionComponent } from './fonction/fonction.component';
import { CategoriesalarieComponent } from './categoriesalarie/categoriesalarie.component';
import { PrestataireComponent } from './prestataire/prestataire.component';
import { PosteComponent } from './poste/poste.component';
import { SocieteComponent } from './societe/societe.component';
import { BannieresComponent } from './bannieres/bannieres.component';
import { PopupConnexionComponent } from './popup-connexion/popup-connexion.component';

@NgModule({
  declarations: [
    SocieteComponent,
    BannieresComponent,
    PopupConnexionComponent,
    AgenceComponent,
    EtatComponent,
    PrioriteComponent,
    StatutComponent,
    TypebesoinComponent,
    DepartementComponent,
    RoleComponent,
    UserComponent,
    TypeplatComponent,
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
  ],
  providers: [
    DatePipe
  ],

})
export class ParametresModule { }