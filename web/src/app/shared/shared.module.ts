import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PaginationModule } from 'ngx-bootstrap/pagination';
import { BsDropdownModule } from 'ngx-bootstrap/dropdown';

// component
import { BreadcrumbsComponent } from './breadcrumbs/breadcrumbs.component';
import { PageEnteteComponent } from './page-entete/page-entete.component';
import { ListePiedComponent } from './liste-pied/liste-pied.component';
import { ProfilPrestataireEditeurComponent } from './profil-prestataire/profil-prestataire-editeur.component';

@NgModule({
  declarations: [
    BreadcrumbsComponent,
    PageEnteteComponent,
    ListePiedComponent,
    ProfilPrestataireEditeurComponent,
  ],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    PaginationModule,
    BsDropdownModule,
  ],
  // BsDropdownModule : menu « ⋮ » des actions de ligne (gabarit commun des listes)
  exports: [BreadcrumbsComponent, PageEnteteComponent, ListePiedComponent, ProfilPrestataireEditeurComponent, BsDropdownModule, RouterModule]
})
export class SharedModule { }
