// src/app/shared/page-entete/page-entete.component.ts
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/** Élément du fil d'Ariane (lien facultatif) */
export interface FilAriane {
  label: string;
  lien?: string;
}

/**
 * En-tête commun des pages de liste (maquette « web-1-listes ») :
 * fil d'Ariane, icône + titre, compteur, et boutons projetés à droite.
 *
 *   <app-page-entete titre="Agences" icone="ri-map-pin-line"
 *                    [fil]="[{label: 'Paramètres', lien: '/parametres'}, {label: 'Entreprise'}]"
 *                    [compte]="totalItems" unite="agence|agences">
 *     <button class="btn-ubi btn-ubi-vert">…</button>
 *   </app-page-entete>
 *
 * Styles : assets/scss/pages/_listes.scss (classes .pe-*).
 */
@Component({
  selector: 'app-page-entete',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pe">
      <div class="pe-txt">
        @if (fil.length) {
          <nav class="pe-fil" aria-label="Fil d'Ariane">
            @for (f of fil; track $index) {
              @if (f.lien) { <a [routerLink]="f.lien">{{ f.label }}</a> } @else { <span>{{ f.label }}</span> }
              <i class="ri-arrow-right-s-line" aria-hidden="true"></i>
            }
            <b>{{ titre }}</b>
          </nav>
        }
        <h1 class="pe-titre">
          @if (icone) { <span class="pe-ic" aria-hidden="true"><i [class]="icone"></i></span> }
          <span>{{ titre }}</span>
        </h1>
        @if (texteSousTitre; as st) { <p class="pe-sous">{{ st }}</p> }
      </div>
      <div class="pe-actions"><ng-content></ng-content></div>
    </div>
  `,
})
export class PageEnteteComponent {
  @Input() titre = '';
  /** Classe Remix Icon (ri-*) */
  @Input() icone = '';
  @Input() fil: FilAriane[] = [];
  /** Sous-titre libre (prioritaire sur le compteur) */
  @Input() sousTitre: string | null | undefined = '';
  /** Nombre d'éléments affiché en sous-titre (« 3 agences ») */
  @Input() compte: number | null | undefined = null;
  /** « singulier|pluriel » */
  @Input() unite = 'élément|éléments';
  /** Complément ajouté après le compteur (« · 58 actifs ») */
  @Input() complement = '';

  get texteSousTitre(): string {
    if (this.sousTitre) return this.sousTitre;
    if (this.compte === null || this.compte === undefined) return '';
    const [sing, plur] = this.unite.split('|');
    const n = Number(this.compte) || 0;
    const txt = `${n.toLocaleString('fr-FR')} ${n > 1 ? (plur ?? sing) : sing}`;
    return this.complement ? `${txt} · ${this.complement}` : txt;
  }
}
