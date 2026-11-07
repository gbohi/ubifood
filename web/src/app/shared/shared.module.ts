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
import { SuiviEtapesComponent } from './suivi-releve/suivi-etapes.component';
import { SuiviReleveDetailComponent } from './suivi-releve/suivi-releve-detail.component';

@NgModule({
  declarations: [
    BreadcrumbsComponent,
    PageEnteteComponent,
    ListePiedComponent,
    ProfilPrestataireEditeurComponent,
    SuiviEtapesComponent,
    SuiviReleveDetailComponent,
  ],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    PaginationModule,
    BsDropdownModule,
  ],
  // BsDropdownModule : menu « ⋮ » des actions de ligne (gabarit commun des listes)
  // SuiviEtapes / SuiviReleveDetail : suivi des factures prestataires (espace prestataire et comptabilité)
  exports: [BreadcrumbsComponent, PageEnteteComponent, ListePiedComponent, ProfilPrestataireEditeurComponent,
            SuiviEtapesComponent, SuiviReleveDetailComponent, BsDropdownModule, RouterModule]
})
export class SharedModule { }
