import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CategoriecomptableComponent } from './categoriecomptable/categoriecomptable/categoriecomptable.component';
import { ClassecomptableComponent } from './classecomptable/classecomptable/classecomptable.component';
import { ComptecomptableComponent } from './comptecomptable/comptecomptable/comptecomptable.component';
import { PostereportingComponent } from './postereporting/postereporting/postereporting.component';

const routes: Routes = [
  {
    path: 'categoriecomptable',
    component: CategoriecomptableComponent
  },
  {
    path: 'classecomptable',
    component: ClassecomptableComponent
  },
  {
    path: 'comptecomptable',
    component: ComptecomptableComponent
  },
  {
    path: 'postereporting',
    component: PostereportingComponent
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PlanComptableRoutingModule { }
