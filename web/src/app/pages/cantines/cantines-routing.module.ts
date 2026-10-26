import { NgModule, inject } from '@angular/core';
import { Router, RouterModule, Routes } from '@angular/router';
import { RoleGuard } from 'src/app/core/guards/role.guard';
import { GESTIONNAIRES } from 'src/app/core/helpers/roles';

// Component
// Component
import { ListePlatsComponent } from './liste-plats/liste-plats.component';
import { ListeMenusComponent } from './liste-menus/liste-menus.component';
import { ListeCommandesComponent } from './liste-commandes/liste-commandes.component';
import { PlanningMenuComponent } from './planningmenu/planningmenu.component';
import { MesCommandesComponent } from './mes-commandes/mes-commandes.component';
import { GestionCommandesComponent } from './gestion-commandes/gestion-commandes.component';
import { RetraitCommandeComponent } from './retrait-commande/retrait-commande/retrait-commande.component';
import { FacturationCommandeComponent } from './facturation-commande/facturation-commande.component';
import { AvisPlatsComponent } from './avis-plats/avis-plats.component';
import { AccueilEmployeComponent } from './accueil-employe/accueil-employe.component';
import { StatistiquesComponent } from './statistiques/statistiques.component';


const routes: Routes = [
  // Accueil de l'employé (tout utilisateur connecté) — voir ACCUEIL_EMPLOYE
  { path: 'accueil', component: AccueilEmployeComponent },
  { path: 'liste-plats', component: ListePlatsComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } },
  { path: 'liste-menus', component: ListeMenusComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } },
  // Ouvert à tous : chacun commande ses repas (comme sur l'application mobile)
  { path: 'liste-commandes', component: ListeCommandesComponent },
  { path: 'planning-menus', component: PlanningMenuComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } },
  { path: 'mes-commandes', component: MesCommandesComponent },
  { path: 'gestion-commandes', component: GestionCommandesComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } },
  { path: 'retrait-commande', component: RetraitCommandeComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } },
  { path: 'facturation-commande', component: FacturationCommandeComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } },
  // Ancienne page : c'est désormais l'onglet « Prestataires » de la page Facturation
  { path: 'facturation-prestataire', redirectTo: () => inject(Router).createUrlTree(['/cantines/facturation-commande'], { queryParams: { onglet: 'prestataires' } }) },
  { path: 'avis-plats', component: AvisPlatsComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } },
  // Statistiques détaillées (graphiques, classements, exports) : gestionnaires et administrateurs
  { path: 'statistiques', component: StatistiquesComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CantinesRoutingModule { }