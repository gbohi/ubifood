import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

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
  { path: 'liste-plats', component: ListePlatsComponent },
  { path: 'liste-menus', component: ListeMenusComponent },
  { path: 'liste-commandes', component: ListeCommandesComponent },
  { path: 'planning-menus', component: PlanningMenuComponent },
  { path: 'mes-commandes', component: MesCommandesComponent },
  { path: 'gestion-commandes', component: GestionCommandesComponent },
  { path: 'retrait-commande', component: RetraitCommandeComponent },
  { path: 'facturation-commande', component: FacturationCommandeComponent },
  { path: 'facturation-prestataire', component: FacturationPrestataireComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CantinesRoutingModule { }