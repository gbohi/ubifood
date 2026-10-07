import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// Component
import { ListBesoinComponent } from './list-besoin/list-besoin/list-besoin.component';

const routes: Routes = [
  {
    path: 'list-besoin',
    component: ListBesoinComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class BesoinsRoutingModule { }
