import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// Component
// Component
import { GenerationBancaireComponent } from './generation-bancaire/generation-bancaire.component';


const routes: Routes = [
  {
    path: 'generation-bancaire',
    component: GenerationBancaireComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ComptabiliteRoutingModule { }