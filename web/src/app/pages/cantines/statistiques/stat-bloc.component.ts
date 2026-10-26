// src/app/pages/cantines/statistiques/stat-bloc.component.ts
//
// Carte d'un bloc de la page Statistiques : titre, sous-titre et menu « ⋮ »
// d'export (Excel, image PNG du graphique, CSV). Le contenu est projeté.

import { Component, EventEmitter, Input, Output } from '@angular/core';
import { BsDropdownModule } from 'ngx-bootstrap/dropdown';

@Component({
  selector: 'app-stat-bloc',
  standalone: true,
  imports: [BsDropdownModule],
  template: `
    <section class="st-bloc">
      <header class="st-bloc-hd">
        <div class="st-bloc-titre">
          <h3><i [class]="icone"></i>{{ titre }}</h3>
          @if (sousTitre) { <p>{{ sousTitre }}</p> }
        </div>
        <div class="st-bloc-menu" dropdown placement="bottom right" container="body">
          <button type="button" class="st-points" dropdownToggle [attr.aria-label]="'Exporter le bloc ' + titre">
            <i class="ri-more-2-fill"></i>
          </button>
          <ul *dropdownMenu class="dropdown-menu dropdown-menu-end st-menu" role="menu">
            <li><button type="button" class="dropdown-item" (click)="excel.emit()"><i class="ri-file-excel-2-line st-c-vert"></i>Exporter en Excel</button></li>
            @if (image) {
              <li><button type="button" class="dropdown-item" (click)="png.emit()"><i class="ri-image-line st-c-bleu"></i>Télécharger l'image (PNG)</button></li>
            }
            <li><button type="button" class="dropdown-item" (click)="csv.emit()"><i class="ri-file-text-line st-c-gris"></i>Exporter en CSV</button></li>
          </ul>
        </div>
      </header>
      <ng-content></ng-content>
    </section>
  `,
})
export class StatBlocComponent {
  @Input() titre = '';
  @Input() sousTitre = '';
  @Input() icone = 'ri-bar-chart-2-line';
  /** Le bloc contient un graphique : propose « Télécharger l'image (PNG) » */
  @Input() image = true;
  @Output() excel = new EventEmitter<void>();
  @Output() png = new EventEmitter<void>();
  @Output() csv = new EventEmitter<void>();
}
