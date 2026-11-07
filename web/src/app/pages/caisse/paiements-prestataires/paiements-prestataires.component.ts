// Paiements prestataires (comptabilité et administrateurs) : suivi des relevés
// officiels, un par prestataire et par mois clôturé, jusqu'au paiement.
// Indicateurs de l'année : dus (factures validées à payer), en cours (relevé →
// facture), payés. Actions : répondre à une contestation, valider / refuser la
// facture déposée, marquer payée (date, mode, référence, justificatif), relancer.
// API : GET paiements-prestataires/?annee=&mois=&prestataire=&statut=, GET …/<id>/,
// POST …/<id>/repondre/ | valider/ | refuser/ | payer/ (multipart) | relancer/.
import { Component, DestroyRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import { aujourdhuiIso, fcfa, messageCaisse } from 'src/app/core/services/caisse/caisse.service';
import {
  MODES_PAIEMENT_PRESTA, ModePaiementPresta, PaiementsPrestataires, ReleveSuivi, STATUTS_RELEVE, SuiviFacturesService,
  ecartFr, erreurFichier, tailleFr,
} from 'src/app/core/services/suivi-factures/suivi-factures.service';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

type ActionCompta = 'repondre' | 'valider' | 'refuser' | 'payer' | 'relancer';

@Component({
  selector: 'app-paiements-prestataires',
  templateUrl: './paiements-prestataires.component.html',
})
export class PaiementsPrestatairesComponent implements OnInit {
  private api = inject(SuiviFacturesService);
  private toastr = inject(ToastrService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  readonly fcfa = fcfa;
  readonly ecart = ecartFr;
  readonly taille = tailleFr;
  readonly statuts = STATUTS_RELEVE;
  readonly modes = MODES_PAIEMENT_PRESTA;
  readonly mois = MOIS;

  donnees: PaiementsPrestataires | null = null;
  annee: number | 'toutes' | '' = '';
  moisFiltre: number | '' = '';
  prestataire: number | '' = '';
  statut = '';
  chargement = true;
  erreur: string | null = null;

  // Détail (tiroir)
  detail: ReleveSuivi | null = null;
  chargementDetail = false;

  // Action (fenêtre)
  @ViewChild('actionModal') actionModal?: ModalDirective;
  action: ActionCompta | null = null;
  cible: ReleveSuivi | null = null;
  texte = '';
  paiement = { date: aujourdhuiIso(), mode: 'virement' as ModePaiementPresta, reference: '' };
  justificatif: File | null = null;
  envoi = false;
  erreurAction: string | null = null;

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    if (q.get('statut')) this.statut = q.get('statut')!;
    this.charger(Number(q.get('releve')) || null);
  }

  charger(ouvrir: number | null = null): void {
    this.chargement = true;
    this.api.paiements({ annee: this.annee, mois: this.moisFiltre, prestataire: this.prestataire, statut: this.statut })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: d => {
          this.donnees = d;
          if (this.annee === '') this.annee = d.annee ?? 'toutes';
          this.chargement = false;
          this.erreur = null;
          if (ouvrir) this.ouvrir({ id: ouvrir } as ReleveSuivi);
        },
        error: e => { this.chargement = false; this.erreur = messageCaisse(e, 'Les relevés n\'ont pas pu être chargés.'); },
      });
  }

  filtrer(): void { this.charger(); }
  filtrerStatut(s: string): void { this.statut = s; this.charger(); }

  get peutAgir(): boolean { return !!this.donnees?.peut_agir; }

  /** Action principale attendue de la comptabilité sur la ligne */
  principale(r: ReleveSuivi): ActionCompta | null {
    const ordre: ActionCompta[] = ['repondre', 'valider', 'payer'];
    return ordre.find(a => r.actions.includes(a)) ?? null;
  }

  /** Actions de la comptabilité offertes sur le relevé, dans l'ordre du parcours */
  actionsCompta(r: ReleveSuivi): ActionCompta[] {
    return (['repondre', 'valider', 'refuser', 'payer', 'relancer'] as ActionCompta[]).filter(a => r.actions.includes(a));
  }

  readonly libelles: Record<ActionCompta, { libelle: string; icone: string; classe: string }> = {
    repondre: { libelle: 'Répondre', icone: 'ri-chat-check-line', classe: 'navy' },
    valider:  { libelle: 'Valider', icone: 'ri-checkbox-circle-line', classe: 'vert' },
    refuser:  { libelle: 'Refuser', icone: 'ri-close-circle-line', classe: 'rouge' },
    payer:    { libelle: 'Marquer payée', icone: 'ri-money-dollar-circle-line', classe: 'vert' },
    relancer: { libelle: 'Relancer', icone: 'ri-alarm-warning-line', classe: 'orange' },
  };

  attente(r: ReleveSuivi): string {
    switch (r.statut) {
      case 'emis': return 'Bon pour accord du prestataire attendu';
      case 'conteste': return 'Contestation à traiter';
      case 'accorde': return 'Facture du prestataire attendue';
      case 'facture_deposee': return r.facture?.conforme ? 'Facture conforme à valider' : `Facture à valider · écart ${ecartFr(r.facture?.ecart ?? 0)}`;
      case 'facture_refusee': return 'Facture corrigée attendue';
      case 'facture_validee': return 'À payer';
      default: return r.paiement ? `Payée le ${r.paiement.date.split('-').reverse().join('/')}` : 'Payée';
    }
  }

  // ── Détail ────────────────────────────────────────────────
  ouvrir(r: ReleveSuivi): void {
    if (r.etapes) this.detail = r;
    this.chargementDetail = true;
    this.api.detail('compta', r.id).subscribe({
      next: d => { this.detail = d; this.chargementDetail = false; },
      error: e => { this.chargementDetail = false; this.toastr.error(messageCaisse(e, 'Détail indisponible.'), 'Relevé'); },
    });
  }

  fermer(): void { this.detail = null; }

  // ── Actions ───────────────────────────────────────────────
  demander(action: ActionCompta, r: ReleveSuivi): void {
    this.action = action;
    this.cible = r;
    this.texte = '';
    this.paiement = { date: aujourdhuiIso(), mode: 'virement', reference: '' };
    this.justificatif = null;
    this.erreurAction = null;
    this.actionModal?.show();
  }

  choisirJustificatif(ev: Event): void {
    this.justificatif = (ev.target as HTMLInputElement).files?.[0] ?? null;
    this.erreurAction = this.justificatif ? erreurFichier(this.justificatif, true) : null;
  }

  get texteObligatoire(): boolean { return this.action === 'repondre' || this.action === 'refuser'; }
  get referenceObligatoire(): boolean { return this.paiement.mode !== 'especes'; }

  get actionValide(): boolean {
    if (this.texteObligatoire && !this.texte.trim()) return false;
    if (this.action === 'payer') {
      if (!this.paiement.date || (this.referenceObligatoire && !this.paiement.reference.trim())) return false;
      if (this.justificatif && erreurFichier(this.justificatif, true)) return false;
    }
    return true;
  }

  confirmer(): void {
    const r = this.cible;
    if (!r || !this.action || this.envoi) return;
    if (!this.actionValide) {
      this.erreurAction = this.action === 'payer' ? 'Renseignez la date et la référence du paiement.' : 'Ce champ est obligatoire.';
      return;
    }
    const t = this.texte.trim();
    const appels: Record<ActionCompta, () => Observable<ReleveSuivi>> = {
      repondre: () => this.api.repondre(r.id, t),
      valider: () => this.api.valider(r.id, t),
      refuser: () => this.api.refuser(r.id, t),
      relancer: () => this.api.relancer(r.id, t),
      payer: () => this.api.payer(r.id, { date_paiement: this.paiement.date, mode: this.paiement.mode, reference: this.paiement.reference.trim(), justificatif: this.justificatif }),
    };
    const messages: Record<ActionCompta, string> = {
      repondre: 'Réponse envoyée : le relevé est confirmé, le prestataire est notifié.',
      valider: 'Facture validée : elle passe en paiement.',
      refuser: 'Facture refusée : le prestataire doit déposer une facture corrigée.',
      relancer: 'Relance envoyée au prestataire.',
      payer: 'Paiement enregistré : le prestataire est notifié.',
    };
    const action = this.action;
    this.envoi = true;
    this.erreurAction = null;
    appels[action]().subscribe({
      next: d => {
        this.envoi = false;
        this.actionModal?.hide();
        this.toastr.success(messages[action], `${d.prestataire.libelle} · ${d.numero}`);
        if (this.detail?.id === d.id) this.detail = d;
        this.charger();
      },
      error: e => { this.envoi = false; this.erreurAction = messageCaisse(e, 'Action impossible.'); },
    });
  }
}
