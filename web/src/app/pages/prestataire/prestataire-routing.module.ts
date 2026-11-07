import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RoleGuard } from 'src/app/core/guards/role.guard';
import { PRESTATAIRES, RESPONSABLES_PRESTATAIRE } from 'src/app/core/helpers/roles';

import { AccueilPrestataireComponent } from './accueil/accueil-prestataire.component';
import { MesPlatsComponent } from './mes-plats/mes-plats.component';
import { MesMenusComponent } from './mes-menus/mes-menus.component';
import { APreparerComponent } from './a-preparer/a-preparer.component';
import { ListeDuJourComponent } from './liste-du-jour/liste-du-jour.component';
import { ComptoirComponent } from './comptoir/comptoir.component';
import { RelevesPrestataireComponent } from './releves/releves-prestataire.component';
import { StatistiquesPrestataireComponent } from './statistiques/statistiques-prestataire.component';
import { EquipeComponent } from './equipe/equipe.component';
import { ProfilPrestataireComponent } from './profil/profil-prestataire.component';

// Responsable : tout l'espace ; agent de comptoir : Comptoir et Liste du jour
const RESP = { roles: RESPONSABLES_PRESTATAIRE };
const TOUS = { roles: PRESTATAIRES };

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'accueil' },
  { path: 'accueil', component: AccueilPrestataireComponent, canActivate: [RoleGuard], data: RESP, title: 'Accueil | Espace prestataire' },
  { path: 'plats', component: MesPlatsComponent, canActivate: [RoleGuard], data: RESP, title: 'Mes plats | Espace prestataire' },
  { path: 'menus', component: MesMenusComponent, canActivate: [RoleGuard], data: RESP, title: 'Mes menus | Espace prestataire' },
  { path: 'a-preparer', component: APreparerComponent, canActivate: [RoleGuard], data: RESP, title: 'À préparer | Espace prestataire' },
  { path: 'liste-du-jour', component: ListeDuJourComponent, canActivate: [RoleGuard], data: TOUS, title: 'Liste du jour | Espace prestataire' },
  { path: 'comptoir', component: ComptoirComponent, canActivate: [RoleGuard], data: TOUS, title: 'Comptoir | Espace prestataire' },
  { path: 'releves', component: RelevesPrestataireComponent, canActivate: [RoleGuard], data: RESP, title: 'Relevés | Espace prestataire' },
  { path: 'statistiques', component: StatistiquesPrestataireComponent, canActivate: [RoleGuard], data: RESP, title: 'Statistiques | Espace prestataire' },
  { path: 'profil', component: ProfilPrestataireComponent, canActivate: [RoleGuard], data: RESP, title: 'Mon profil prestataire | Espace prestataire' },
  { path: 'equipe', component: EquipeComponent, canActivate: [RoleGuard], data: RESP, title: 'Mon équipe | Espace prestataire' },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PrestataireRoutingModule { }
