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
import { ControleRetraitsComponent } from './controle-retraits/controle-retraits.component';
import { MonCompteRepasComponent } from './mon-compte-repas/mon-compte-repas.component';
import { PlanningEquipesComponent } from './planning-equipes/planning-equipes.component';
import { SuiviLivraisonsComponent } from './suivi-livraisons/suivi-livraisons.component';
import { GestionJeuxComponent } from './gestion-jeux/gestion-jeux.component';
import { JeuxComponent } from './jeux/jeux.component';


const routes: Routes = [
  // Accueil de l'employé (tout utilisateur connecté) — voir ACCUEIL_EMPLOYE
  { path: 'accueil', component: AccueilEmployeComponent },
  { path: 'liste-plats', component: ListePlatsComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } },
  { path: 'liste-menus', component: ListeMenusComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } },
  // Ouvert à tous : chacun commande ses repas (comme sur l'application mobile)
  { path: 'liste-commandes', component: ListeCommandesComponent },
  { path: 'planning-menus', component: PlanningMenuComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } },
  // Planning des équipes « sur planning » (ex. Nuit) : administrateurs et gestionnaires
  // (le serveur refuse les gestionnaires si Paramètres → Société ne les autorise pas)
  { path: 'planning-equipes', component: PlanningEquipesComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES }, title: 'Planning des équipes | UbiFood' },
  // Suivi des livraisons des prestataires et ponctualité
  { path: 'suivi-livraisons', component: SuiviLivraisonsComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES }, title: 'Suivi des livraisons | UbiFood' },
  // Jeux (quiz à lots) : employés (jouer) ; administration (créer, classement, lots)
  { path: 'jeux', component: JeuxComponent, title: 'Jeux | UbiFood' },
  { path: 'gestion-jeux', component: GestionJeuxComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES }, title: 'Gestion des jeux | UbiFood' },
  { path: 'mes-commandes', component: MesCommandesComponent },
  // Compte repas prépayé de l'employé connecté (solde, repas payés, reçus de caisse)
  { path: 'mon-compte-repas', component: MonCompteRepasComponent, title: 'Mon compte repas | UbiFood' },
  { path: 'gestion-commandes', component: GestionCommandesComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } },
  { path: 'retrait-commande', component: RetraitCommandeComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } },
  // Retraits validés par les agents des prestataires, contestations, anomalies
  { path: 'controle-retraits', component: ControleRetraitsComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES }, title: 'Contrôle des retraits | UbiFood' },
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