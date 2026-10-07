import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// Component
// Component
import { ImporterSalaireComponent } from './importer-salaire/importer-salaire.component';
import { ListeSalaireComponent } from './liste-salaire/liste-salaire.component';


const routes: Routes = [
  {
    path: 'importer-salaire',
    component: ImporterSalaireComponent
  },
  {
    path: 'liste-salaire',
    component: ListeSalaireComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RessourcesHumainesRoutingModule { }