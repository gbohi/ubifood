import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalModule } from 'ngx-bootstrap/modal';

import { SharedModule } from 'src/app/shared/shared.module';
import { CaisseRoutingModule } from './caisse-routing.module';

import { CaisseComponent } from './caisse/caisse.component';
import { JournalCaisseComponent } from './journal/journal-caisse.component';
import { ClotureCaisseComponent } from './cloture/cloture-caisse.component';
import { ValidationCloturesComponent } from './validation-clotures/validation-clotures.component';
import { RecusComponent } from './recus/recus.component';
import { ComptesRepasComponent } from './comptes/comptes-repas.component';

/**
 * Compte repas et caisse (étape 2) : écran de caisse, journal et clôture de caisse
 * (caissiers), contrôle par la comptabilité (clôtures, reçus, comptes repas).
 * Styles : assets/scss/pages/_caisse.scss (+ gabarits _listes.scss et _espace-prestataire.scss).
 */
@NgModule({
  declarations: [
    CaisseComponent,
    JournalCaisseComponent,
    ClotureCaisseComponent,
    ValidationCloturesComponent,
    RecusComponent,
    ComptesRepasComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    SharedModule,
    ModalModule.forRoot(),
    CaisseRoutingModule,
  ],
})
export class CaisseModule { }
