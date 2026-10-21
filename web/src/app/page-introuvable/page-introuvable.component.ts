// src/app/page-introuvable/page-introuvable.component.ts
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Location } from '@angular/common';

/** Page 404 : adresse inconnue (route « ** »). Styles : assets/scss/pages/_introuvable.scss */
@Component({
  selector: 'app-page-introuvable',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="introuvable">
      <div class="introuvable-carte">
        <img src="assets/images/ubifood-logo-blanc.svg" alt="UbiFood">
        <div class="introuvable-code" aria-hidden="true">404</div>
        <h1>Page introuvable</h1>
        <p>L'adresse demandée n'existe pas ou a été déplacée.</p>
        <div class="introuvable-btns">
          <a routerLink="/" class="btn-ubi vert"><i class="ri-home-4-line"></i>Retour à l'accueil</a>
          <button type="button" class="btn-ubi blanc" (click)="retour()"><i class="ri-arrow-left-line"></i>Page précédente</button>
        </div>
      </div>
    </main>
  `,
})
export class PageIntrouvableComponent {
  constructor(private location: Location) {}

  retour(): void {
    this.location.back();
  }
}
