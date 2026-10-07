import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// Component
// Component
import { ImporterEntretienComponent } from './importer-entretien/importer-entretien.component';
import { ListeEntretienComponent } from './liste-entretien/liste-entretien.component';
import { ListeVehiculeComponent } from './liste-vehicule/liste-vehicule.component';


const routes: Routes = [
  {
    path: 'importer-entretien',
    component: ImporterEntretienComponent
  },
  {
    path: 'liste-entretien',
    component: ListeEntretienComponent
  },
  {
    path: 'liste-vehicule',
    component: ListeVehiculeComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class MoyensGenerauxRoutingModule { }