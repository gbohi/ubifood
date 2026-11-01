import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalModule } from 'ngx-bootstrap/modal';

import { SharedModule } from 'src/app/shared/shared.module';
import { PrestataireRoutingModule } from './prestataire-routing.module';

import { AccueilPrestataireComponent } from './accueil/accueil-prestataire.component';
import { MesPlatsComponent } from './mes-plats/mes-plats.component';
import { MesMenusComponent } from './mes-menus/mes-menus.component';
import { APreparerComponent } from './a-preparer/a-preparer.component';
import { ListeDuJourComponent } from './liste-du-jour/liste-du-jour.component';
import { ComptoirComponent } from './comptoir/comptoir.component';
import { RelevesPrestataireComponent } from './releves/releves-prestataire.component';
import { StatistiquesPrestataireComponent } from './statistiques/statistiques-prestataire.component';
import { EquipeComponent } from './equipe/equipe.component';

/**
 * Espace prestataire (étape 1) : pages des comptes « prestataire » (responsable)
 * et « agent_comptoir ». Styles : assets/scss/pages/_espace-prestataire.scss
 * (+ gabarits communs _listes.scss et _cantine-ecrans.scss).
 */
@NgModule({
  declarations: [
    AccueilPrestataireComponent,
    MesPlatsComponent,
    MesMenusComponent,
    APreparerComponent,
    ListeDuJourComponent,
    ComptoirComponent,
    RelevesPrestataireComponent,
    StatistiquesPrestataireComponent,
    EquipeComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    SharedModule,
    ModalModule.forRoot(),
    PrestataireRoutingModule,
  ],
})
export class PrestataireModule { }
