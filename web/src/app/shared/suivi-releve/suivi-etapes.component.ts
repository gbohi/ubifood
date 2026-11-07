// src/app/shared/suivi-releve/suivi-etapes.component.ts
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { EtapeReleve } from 'src/app/core/services/suivi-factures/suivi-factures.service';

/**
 * Les 5 étapes du suivi d'un relevé prestataire (relevé émis → bon pour accord →
 * facture déposée → facture validée → payée).
 *   - compact : mini-stepper de ligne (pastilles reliées, libellé au survol) ;
 *   - sinon : stepper complet (libellé, date, précision : contesté, écart…).
 * Sans étapes (mois pas encore clôturé) : 5 pastilles vides.
 * Styles : assets/scss/pages/_suivi-factures.scss (sf-*).
 */
@Component({
  selector: 'app-suivi-etapes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="sf-etapes" [class.compact]="compact" [attr.aria-label]="'Suivi : ' + resume">
      @for (e of liste; track e.numero) {
        <li [class]="'sf-e ' + e.etat" [attr.title]="compact ? e.numero + '. ' + e.libelle + (e.detail ? ' — ' + e.detail : '') : null">
          <span class="sf-pastille" aria-hidden="true">
            @switch (e.etat) {
              @case ('fait') { <i class="ri-check-line"></i> }
              @case ('alerte') { <i class="ri-error-warning-fill"></i> }
              @default { {{ e.numero }} }
            }
          </span>
          @if (!compact) {
            <span class="sf-e-txt">
              <b>{{ e.libelle }}</b>
              @if (e.date) { <small>{{ e.date | date: 'dd/MM/yyyy' }}</small> }
              @if (e.detail) { <em>{{ e.detail }}</em> }
            </span>
          }
        </li>
      }
    </ol>
  `,
})
export class SuiviEtapesComponent {
  @Input() etapes: EtapeReleve[] | null | undefined = null;
  @Input() compact = false;

  private static readonly LIBELLES = ['Relevé émis', 'Bon pour accord', 'Facture déposée', 'Facture validée', 'Payée'];

  get liste(): EtapeReleve[] {
    return this.etapes?.length ? this.etapes
      : SuiviEtapesComponent.LIBELLES.map((libelle, i) => ({ numero: i + 1, libelle, etat: 'a_venir', date: null, detail: '' }));
  }

  get resume(): string {
    const l = this.liste;
    const courante = l.find(e => e.etat === 'alerte') ?? l.find(e => e.etat === 'en_cours');
    if (!this.etapes?.length) return 'mois non clôturé';
    if (!courante) return 'payé';
    return `étape ${courante.numero} sur 5, ${courante.libelle}${courante.detail ? ' (' + courante.detail + ')' : ''}`;
  }
}
