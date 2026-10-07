import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
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
import { FacturationPrestataireComponent } from './facturation-prestataire/facturation-prestataire.component';


const routes: Routes = [
  { path: 'liste-plats', component: ListePlatsComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } },
  { path: 'liste-menus', component: ListeMenusComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } },
  { path: 'liste-commandes', component: ListeCommandesComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } },
  { path: 'planning-menus', component: PlanningMenuComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } },
  { path: 'mes-commandes', component: MesCommandesComponent },
  { path: 'gestion-commandes', component: GestionCommandesComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } },
  { path: 'retrait-commande', component: RetraitCommandeComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } },
  { path: 'facturation-commande', component: FacturationCommandeComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } },
  { path: 'facturation-prestataire', component: FacturationPrestataireComponent, canActivate: [RoleGuard], data: { roles: GESTIONNAIRES } }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CantinesRoutingModule { }