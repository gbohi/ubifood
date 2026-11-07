import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RoleGuard } from 'src/app/core/guards/role.guard';
import { ACCES_CAISSE, CAISSIERS, COMPTABLES, LECTURE_COMPTES } from 'src/app/core/helpers/roles';

import { CaisseComponent } from './caisse/caisse.component';
import { JournalCaisseComponent } from './journal/journal-caisse.component';
import { ClotureCaisseComponent } from './cloture/cloture-caisse.component';
import { ValidationCloturesComponent } from './validation-clotures/validation-clotures.component';
import { RecusComponent } from './recus/recus.component';
import { ComptesRepasComponent } from './comptes/comptes-repas.component';
import { PaiementsPrestatairesComponent } from './paiements-prestataires/paiements-prestataires.component';

// Caissier : Caisse, Journal (le sien), Clôture de caisse.
// Comptabilité : Clôtures à valider, Reçus, Comptes repas, Journal (tous), Paiements prestataires.
// Gestionnaire : Comptes repas de ses agences (lecture). Administrateurs : tout.
const routes: Routes = [
  { path: '', pathMatch: 'full', component: CaisseComponent, canActivate: [RoleGuard], data: { roles: CAISSIERS }, title: 'Caisse | UbiFood' },
  { path: 'journal', component: JournalCaisseComponent, canActivate: [RoleGuard], data: { roles: ACCES_CAISSE }, title: 'Journal de caisse | UbiFood' },
  { path: 'cloture', component: ClotureCaisseComponent, canActivate: [RoleGuard], data: { roles: CAISSIERS }, title: 'Clôture de caisse | UbiFood' },
  { path: 'clotures', component: ValidationCloturesComponent, canActivate: [RoleGuard], data: { roles: COMPTABLES }, title: 'Clôtures de caisse à valider | UbiFood' },
  { path: 'recus', component: RecusComponent, canActivate: [RoleGuard], data: { roles: COMPTABLES }, title: 'Reçus de caisse | UbiFood' },
  { path: 'paiements-prestataires', component: PaiementsPrestatairesComponent, canActivate: [RoleGuard], data: { roles: COMPTABLES }, title: 'Paiements prestataires | UbiFood' },
  { path: 'comptes', component: ComptesRepasComponent, canActivate: [RoleGuard], data: { roles: LECTURE_COMPTES }, title: 'Comptes repas | UbiFood' },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CaisseRoutingModule { }
