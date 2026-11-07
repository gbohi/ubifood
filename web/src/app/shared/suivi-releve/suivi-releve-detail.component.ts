// src/app/shared/suivi-releve/suivi-releve-detail.component.ts
import { Component, Input, inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import {
  ACTIONS_HISTORIQUE, DepotFacture, ReleveSuivi, STATUTS_RELEVE, SuiviFacturesService, ecartFr, tailleFr,
} from 'src/app/core/services/suivi-factures/suivi-factures.service';

/**
 * Détail d'un relevé prestataire, commun à l'espace prestataire et à la
 * comptabilité : étapes, relevé PDF, contestation et réponse, facture déposée
 * (écart avec le relevé), paiement, dépôts successifs et historique complet.
 * Les boutons d'action sont projetés par la page (<ng-content>).
 */
@Component({
  selector: 'app-suivi-releve-detail',
  template: `
    @if (releve; as r) {
      <div class="sf-detail">
        <app-suivi-etapes [etapes]="r.etapes"></app-suivi-etapes>

        <div class="sf-actions"><ng-content></ng-content></div>

        <div class="sf-resume">
          <div><small>Relevé</small><b class="cs-num">{{ r.numero || '—' }}</b><span>{{ r.libelle }}</span></div>
          <div><small>Repas servis</small><b>{{ r.nb_repas }}</b><span>clôturé le {{ r.cloturee_le | date: 'dd/MM/yyyy' }}</span></div>
          <div><small>Montant du relevé</small><b>{{ montant(r.montant) }}</b><span>montant figé à la clôture</span></div>
          <div class="sf-resume-pdf">
            <button type="button" class="btn-ubi sm" [disabled]="!!telechargement" (click)="relevePdf(r)">
              @if (telechargement === 'releve') { <span class="spinner-border spinner-border-sm"></span> } @else { <i class="ri-file-pdf-line ep-c-rouge"></i> }Relevé PDF</button>
          </div>
        </div>

        @if (r.contestation; as c) {
          <div class="ep-alerte" [class.a-ro]="r.statut === 'conteste'" [class.a-bl]="r.statut !== 'conteste'">
            <i class="ri-chat-3-line"></i>
            <div>
              <b>Contestation du {{ c.date | date: 'dd/MM/yyyy à HH:mm' }}@if (c.par) { · {{ c.par }} }</b>
              <small class="sf-citation">« {{ c.commentaire }} »</small>
              @if (c.reponse) {
                <b class="mt-2 d-block">Réponse de la comptabilité · {{ c.reponse_date | date: 'dd/MM/yyyy' }}@if (c.reponse_par) { · {{ c.reponse_par }} }</b>
                <small class="sf-citation">« {{ c.reponse }} » — relevé confirmé.</small>
              } @else {
                <small>En attente de la réponse de la comptabilité.</small>
              }
            </div>
          </div>
        }

        @if (r.facture; as f) {
          <h6 class="cs-h6">Facture du prestataire</h6>
          <div class="sf-facture" [class.refusee]="f.statut === 'refusee'">
            <span class="sf-facture-ic"><i class="ri-file-pdf-line"></i></span>
            <div class="sf-facture-txt">
              <b>Facture n° {{ f.numero_facture }} <span class="lst-tag" [ngClass]="classeDepot(f)">{{ f.statut_libelle }}</span></b>
              <small>du {{ f.date_facture | date: 'dd/MM/yyyy' }} · déposée le {{ f.deposee_le | date: 'dd/MM/yyyy à HH:mm' }}@if (f.deposee_par_nom) { par {{ f.deposee_par_nom }} }</small>
              <small>{{ f.nom_fichier }} · {{ taille(f.taille) }}</small>
              @if (f.motif_refus) { <small class="cs-refus"><i class="ri-close-circle-line"></i> Refusée : {{ f.motif_refus }}</small> }
            </div>
            <div class="sf-facture-mt">
              <b>{{ montant(f.montant_ttc) }} <small>TTC</small></b>
              @if (f.conforme) { <span class="lst-tag t-ve"><i class="ri-checkbox-circle-line"></i>Montant conforme</span> }
              @else { <span class="lst-tag t-or"><i class="ri-error-warning-line"></i>Écart de {{ ecart(f.ecart) }}</span> }
            </div>
            <button type="button" class="btn-ubi sm" [disabled]="!!telechargement" (click)="fichier(r, f)" title="Télécharger la facture">
              @if (telechargement === 'depot-' + f.id) { <span class="spinner-border spinner-border-sm"></span> } @else { <i class="ri-download-2-line"></i> }PDF</button>
          </div>
        }

        @if (r.paiement; as p) {
          <h6 class="cs-h6">Paiement</h6>
          <div class="sf-facture paye">
            <span class="sf-facture-ic"><i class="ri-money-dollar-circle-line"></i></span>
            <div class="sf-facture-txt">
              <b>Payé le {{ p.date | date: 'dd/MM/yyyy' }} par {{ p.mode_libelle | lowercase }}</b>
              <small>@if (p.reference) { Référence {{ p.reference }} · }enregistré le {{ p.enregistre_le | date: 'dd/MM/yyyy' }}@if (p.enregistre_par_nom) { par {{ p.enregistre_par_nom }} }</small>
            </div>
            @if (p.justificatif) {
              <button type="button" class="btn-ubi sm" [disabled]="!!telechargement" (click)="justificatif(r)">
                @if (telechargement === 'justificatif') { <span class="spinner-border spinner-border-sm"></span> } @else { <i class="ri-attachment-2"></i> }Justificatif</button>
            }
          </div>
        }

        @if ((r.depots?.length ?? 0) > 1) {
          <h6 class="cs-h6">Factures déposées ({{ r.depots!.length }})</h6>
          <div class="sf-table-wrap"><table class="ep-sous-table">
            <thead><tr><th>Déposée le</th><th>N°</th><th class="text-end">Montant TTC</th><th class="text-end">Écart</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              @for (d of r.depots; track d.id) {
                <tr>
                  <td class="lst-nowrap">{{ d.deposee_le | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td>{{ d.numero_facture }}</td>
                  <td class="text-end">{{ montant(d.montant_ttc) }}</td>
                  <td class="text-end" [class.ep-c-orange]="!d.conforme">{{ d.conforme ? '—' : ecart(d.ecart) }}</td>
                  <td><span class="lst-tag" [ngClass]="classeDepot(d)">{{ d.statut_libelle }}</span></td>
                  <td class="text-end"><button type="button" class="ep-lien" [disabled]="!!telechargement" (click)="fichier(r, d)"><i class="ri-download-2-line"></i></button></td>
                </tr>
              }
            </tbody>
          </table></div>
        }

        <h6 class="cs-h6">Historique</h6>
        <ol class="sf-histo">
          @for (h of historiqueRecent; track h.id) {
            <li>
              <span class="sf-histo-ic" [ngClass]="icone(h.action).classe"><i [class]="icone(h.action).icone"></i></span>
              <div>
                <b>{{ h.action_libelle }}</b>
                <small>{{ h.date | date: 'dd/MM/yyyy à HH:mm' }}@if (h.user_nom) { · {{ h.user_nom }} }</small>
                @if (h.action === 'depot') {
                  <small>Facture n° {{ h.donnees['numero_facture'] }} · {{ montant(+h.donnees['montant_ttc']) }} TTC ·
                    @if (h.donnees['conforme']) { montant conforme } @else { <span class="ep-c-orange">écart de {{ ecart(+h.donnees['ecart']) }}</span> }</small>
                }
                @if (h.action === 'paiement') {
                  <small>{{ h.donnees['date'] | date: 'dd/MM/yyyy' }} · {{ libelleMode(h.donnees['mode']) }}@if (h.donnees['reference']) { · réf. {{ h.donnees['reference'] }} }</small>
                }
                @if (h.commentaire) { <p class="sf-histo-com">{{ h.commentaire }}</p> }
              </div>
            </li>
          }
        </ol>
      </div>
    }
  `,
})
export class SuiviReleveDetailComponent {
  private api = inject(SuiviFacturesService);
  private toastr = inject(ToastrService);

  @Input() releve: ReleveSuivi | null = null;
  @Input() cote: 'prestataire' | 'compta' = 'prestataire';

  telechargement: string | null = null;
  readonly statuts = STATUTS_RELEVE;
  readonly ecart = ecartFr;
  readonly taille = tailleFr;

  /** Plus récent en premier */
  get historiqueRecent() { return [...(this.releve?.historique ?? [])].reverse(); }

  montant(n: number | null | undefined): string {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return `${Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/ | /g, ' ')} F`;
  }

  icone(action: string) { return ACTIONS_HISTORIQUE[action] ?? { icone: 'ri-information-line', classe: 'gr' }; }

  libelleMode(code: string): string {
    return ({ virement: 'virement', cheque: 'chèque', especes: 'espèces' } as Record<string, string>)[code] ?? code;
  }

  classeDepot(d: DepotFacture): string {
    return { en_attente: 't-or', validee: 't-ve', refusee: 't-ro', remplacee: 't-gr' }[d.statut];
  }

  private telecharger(cle: string, obs: ReturnType<SuiviFacturesService['relevePdf']>, nom: string): void {
    if (this.telechargement) return;
    this.telechargement = cle;
    obs.subscribe({
      next: b => {
        this.telechargement = null;
        const ext = /\.[a-z0-9]+$/i.test(nom) ? '' : ({ 'application/pdf': '.pdf', 'image/png': '.png' } as Record<string, string>)[b.type] ?? '.jpg';
        this.api.enregistrer(b, nom + ext);
      },
      error: e => { this.telechargement = null; this.toastr.error(typeof e === 'string' ? e : 'Téléchargement impossible.', 'Fichier'); },
    });
  }

  relevePdf(r: ReleveSuivi): void {
    this.telecharger('releve', this.api.relevePdf(this.cote, r.id), `releve-prestations-${r.numero || r.id}.pdf`);
  }

  fichier(r: ReleveSuivi, d: DepotFacture): void {
    this.telecharger(`depot-${d.id}`, this.api.fichierDepot(this.cote, r.id, d.id), d.nom_fichier || `facture-${d.numero_facture}.pdf`);
  }

  justificatif(r: ReleveSuivi): void {
    this.telecharger('justificatif', this.api.justificatif(this.cote, r.id), `justificatif-paiement-${r.numero || r.id}`);
  }
}
