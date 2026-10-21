// src/app/shared/liste-pied/liste-pied.component.ts
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';

/**
 * Pied des listes paginées : « Affichage de 1–10 sur 62 » + pagination
 * « Précédent / Suivant » (ngx-bootstrap). Masqué quand la liste est vide.
 *
 *   <app-liste-pied [total]="totalItems" [page]="currentPage" [nbAffiches]="agences.length"
 *                   (pageChanged)="pageChanged($event)"></app-liste-pied>
 */
@Component({
  selector: 'app-liste-pied',
  template: `
    @if (total > 0 && nbAffiches > 0) {
      <div class="lst-pied">
        <span class="lst-pied-info">
          Affichage de <b>{{ debut }}–{{ fin }}</b> sur <b>{{ total }}</b> {{ total > 1 ? 'résultats' : 'résultat' }}
        </span>
        @if (total > parPage) {
          <pagination class="pagination-wrap lst-pages"
                      [totalItems]="total" [itemsPerPage]="parPage" [maxSize]="5" [rotate]="true"
                      previousText="Précédent" nextText="Suivant"
                      [ngModel]="page" (pageChanged)="changer($event)">
          </pagination>
        }
      </div>
    }
  `,
})
export class ListePiedComponent {
  @Input() total = 0;
  @Input() page = 1;
  @Input() parPage = 10;
  /** Nombre de lignes de la page affichée */
  @Input() nbAffiches = 0;
  @Output() pageChanged = new EventEmitter<PageChangedEvent>();

  get debut(): number { return (Math.max(1, this.page) - 1) * this.parPage + 1; }
  get fin(): number { return Math.min(this.total, this.debut + this.nbAffiches - 1); }

  changer(event: PageChangedEvent): void {
    // La pagination émet aussi quand la page lui est imposée (rechargement, recherche) :
    // seul un vrai changement demandé par l'utilisateur est transmis.
    if (event.page === this.page) return;
    this.pageChanged.emit(event);
  }
}
