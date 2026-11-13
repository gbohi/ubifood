// Frise des étapes du suivi d'un repas (accueil de l'employé, suivi des
// livraisons du gestionnaire). Styles : _suivi-repas.scss (.fs-*).
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { EtapeSuivi, ICONES_ETAPES } from './suivi-repas.model';

@Component({
  selector: 'app-frise-suivi',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="fs" [class.fs-compact]="compact" [class.fs-retard]="retard" aria-label="Suivi du repas">
      @for (e of etapes; track e.code) {
        <li class="fs-e" [attr.data-statut]="e.statut" [attr.aria-current]="e.statut === 'en_cours' ? 'step' : null">
          <span class="fs-d"><i [class]="e.statut === 'fait' ? 'ri-check-line' : icones[e.code]"></i></span>
          <b>{{ e.libelle }}</b>
          <small>{{ e.heure || (e.prevu ? (compact ? e.prevu : 'prévu ' + e.prevu) : ' ') }}@if (e.auto && e.heure && !compact) { · auto }</small>
        </li>
      }
    </ol>`,
})
export class FriseSuiviComponent {
  @Input() etapes: EtapeSuivi[] = [];
  @Input() compact = false;
  @Input() retard = false;
  readonly icones = ICONES_ETAPES;
}
