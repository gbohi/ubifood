// Relevés & factures du prestataire (étape 3) : un relevé par mois, provisoire
// tant que le mois n'est pas clôturé par UbiPharm, puis suivi en 5 étapes :
// relevé émis → bon pour accord (ou contestation) → dépôt de la facture (PDF) →
// facture validée (ou refusée : nouveau dépôt) → payée.
// API : GET prestataire/releves/ (mois, provisoires compris), GET prestataire/factures/
// (suivi des relevés officiels), GET prestataire/factures/<id>/ (détail),
// POST …/accord/, …/contester/, …/deposer/ (multipart) ; PDF du relevé et fichiers.
import { Component, DestroyRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import { nomFichier } from 'src/app/core/helpers/exports';
import {
  ContextePresta, EspacePrestataireService, ReleveMois, messageErreur, montantFr, nombreFr,
} from 'src/app/core/services/espace-prestataire/espace-prestataire.service';
import {
  ReleveSuivi, STATUTS_RELEVE, SuiviFacturesService, ecartFr, erreurFichier, tailleFr,
} from 'src/app/core/services/suivi-factures/suivi-factures.service';

@Component({
  selector: 'app-releves-prestataire',
  templateUrl: './releves-prestataire.component.html',
})
export class RelevesPrestataireComponent implements OnInit {
  private api = inject(EspacePrestataireService);
  private suivi = inject(SuiviFacturesService);
  private toastr = inject(ToastrService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  contexte: ContextePresta | null = null;
  releves: ReleveMois[] = [];
  /** Suivi des relevés officiels, par id */
  suivis: Record<number, ReleveSuivi> = {};
  nbMois = 12;
  chargement = true;
  erreur: string | null = null;
  telechargement: string | null = null;

  readonly nombreFr = nombreFr;
  readonly montantFr = montantFr;
  readonly statuts = STATUTS_RELEVE;
  readonly ecart = ecartFr;
  readonly taille = tailleFr;

  // Détail (tiroir)
  detail: ReleveSuivi | null = null;
  chargementDetail = false;

  // Bon pour accord / contestation
  @ViewChild('accordModal') accordModal?: ModalDirective;
  modeAccord: 'accord' | 'contester' = 'accord';
  commentaire = '';
  envoi = false;
  erreurAction: string | null = null;

  // Dépôt de la facture
  @ViewChild('depotModal') depotModal?: ModalDirective;
  depot = { numero: '', date: '', montant: null as number | null };
  fichier: File | null = null;
  erreurDepot: string | null = null;

  ngOnInit(): void {
    this.api.contexte().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: c => this.contexte = c, error: () => {} });
    this.charger(Number(this.route.snapshot.queryParamMap.get('releve')) || null);
  }

  charger(ouvrir: number | null = null): void {
    this.chargement = true;
    forkJoin({ mois: this.api.releves(this.nbMois), suivis: this.suivi.mesReleves() })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: ({ mois, suivis }) => {
          this.releves = mois ?? [];
          this.suivis = Object.fromEntries((suivis ?? []).map(s => [s.id, s]));
          this.chargement = false;
          this.erreur = null;
          if (ouvrir && this.suivis[ouvrir]) this.ouvrir(this.suivis[ouvrir]);
        },
        error: e => { this.erreur = messageErreur(e, 'Les relevés n\'ont pas pu être chargés.'); this.chargement = false; },
      });
  }

  suiviDe(r: ReleveMois): ReleveSuivi | null { return r.releve_id ? this.suivis[r.releve_id] ?? null : null; }

  // ── Indicateurs ───────────────────────────────────────────
  get aFaire(): ReleveSuivi[] { return Object.values(this.suivis).filter(s => s.actions.length > 0); }
  private somme(statuts: string[]): number {
    return Object.values(this.suivis).filter(s => statuts.includes(s.statut)).reduce((t, s) => t + (s.facture?.montant_ttc ?? s.montant), 0);
  }
  get enAttentePaiement(): number { return this.somme(['facture_deposee', 'facture_validee']); }
  get payes(): number { return this.somme(['payee']); }
  get totalProvisoire(): number { return this.releves.filter(r => r.etat !== 'cloture').reduce((s, r) => s + (r.montant || 0), 0); }

  /** Ce qui est attendu du prestataire sur ce relevé (phrase courte) */
  attente(s: ReleveSuivi): string {
    switch (s.statut) {
      case 'emis': return 'Donnez votre bon pour accord';
      case 'accorde': return 'Déposez votre facture';
      case 'facture_refusee': return 'Facture refusée : déposez une facture corrigée';
      case 'conteste': return 'Contestation envoyée à la comptabilité';
      case 'facture_deposee': return 'Facture en cours de vérification';
      case 'facture_validee': return 'Facture validée : paiement en cours';
      default: return 'Payé';
    }
  }

  etat(r: ReleveMois): { libelle: string; classe: string; icone: string } {
    const s = this.suiviDe(r);
    if (s) { const st = this.statuts[s.statut]; return { libelle: st.court, classe: st.classe, icone: st.icone }; }
    switch (r.etat) {
      case 'a_cloturer': return { libelle: 'À clôturer par UbiPharm', classe: 't-or', icone: 'ri-time-line' };
      default: return { libelle: 'En cours · provisoire', classe: 't-gr', icone: 'ri-loader-2-line' };
    }
  }

  cle(r: ReleveMois): string { return `${r.annee}-${r.mois}`; }

  telecharger(r: ReleveMois): void {
    const id = this.contexte?.prestataire?.id;
    if (!id || this.telechargement) return;
    this.telechargement = this.cle(r);
    this.api.relevePdf(id, r.annee, r.mois).subscribe({
      next: blob => {
        this.telechargement = null;
        this.suivi.enregistrer(blob, nomFichier('releve', r.numero || `${r.annee}-${String(r.mois).padStart(2, '0')}`,
          r.etat === 'cloture' ? '' : 'provisoire') + '.pdf');
      },
      error: e => { this.telechargement = null; this.toastr.error(messageErreur(e, 'Le PDF n\'a pas pu être téléchargé.'), 'Relevé'); },
    });
  }

  // ── Détail ────────────────────────────────────────────────
  ouvrir(s: ReleveSuivi): void {
    this.detail = s;
    this.chargementDetail = true;
    this.suivi.detail('prestataire', s.id).subscribe({
      next: d => { if (this.detail?.id === d.id) { this.detail = d; this.chargementDetail = false; } },
      error: e => { this.chargementDetail = false; this.toastr.error(messageErreur(e, 'Détail indisponible.'), 'Relevé'); },
    });
  }

  fermer(): void { this.detail = null; }

  private miseAJour(d: ReleveSuivi, message: string): void {
    this.envoi = false;
    this.detail = d;
    this.suivis = { ...this.suivis, [d.id]: d };
    this.releves = this.releves.map(r => r.releve_id === d.id ? { ...r, statut: d.statut, statut_libelle: d.statut_libelle, etape: d.etape } as ReleveMois : r);
    this.toastr.success(message, d.numero || d.libelle);
  }

  // ── Bon pour accord / contestation ────────────────────────
  demander(mode: 'accord' | 'contester'): void {
    this.modeAccord = mode;
    this.commentaire = '';
    this.erreurAction = null;
    this.accordModal?.show();
  }

  confirmerAccord(): void {
    const d = this.detail;
    if (!d || this.envoi) return;
    if (this.modeAccord === 'contester' && !this.commentaire.trim()) {
      this.erreurAction = 'Expliquez ce que vous contestez dans le relevé.';
      return;
    }
    this.envoi = true;
    this.erreurAction = null;
    const obs = this.modeAccord === 'accord' ? this.suivi.accord(d.id, this.commentaire.trim()) : this.suivi.contester(d.id, this.commentaire.trim());
    obs.subscribe({
      next: r => {
        this.accordModal?.hide();
        this.miseAJour(r, this.modeAccord === 'accord'
          ? 'Bon pour accord envoyé : déposez maintenant votre facture.'
          : 'Contestation envoyée à la comptabilité. Vous serez notifié de sa réponse.');
      },
      error: e => { this.envoi = false; this.erreurAction = messageErreur(e, 'Action impossible.'); },
    });
  }

  // ── Dépôt de la facture ───────────────────────────────────
  ouvrirDepot(): void {
    const d = this.detail;
    if (!d) return;
    const auj = new Date();
    this.depot = { numero: '', date: `${auj.getFullYear()}-${String(auj.getMonth() + 1).padStart(2, '0')}-${String(auj.getDate()).padStart(2, '0')}`, montant: d.montant };
    this.fichier = null;
    this.erreurDepot = null;
    this.depotModal?.show();
  }

  choisirFichier(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.fichier = input.files?.[0] ?? null;
    this.erreurDepot = this.fichier ? erreurFichier(this.fichier) : null;
  }

  /** Écart du montant saisi avec le relevé (vérification en direct) */
  get ecartSaisi(): number | null {
    if (!this.detail || this.depot.montant === null || this.depot.montant === undefined || isNaN(Number(this.depot.montant))) return null;
    return Math.round((Number(this.depot.montant) - this.detail.montant) * 100) / 100;
  }

  get depotValide(): boolean {
    return !!this.depot.numero.trim() && !!this.depot.date && Number(this.depot.montant) > 0 && !!this.fichier && !erreurFichier(this.fichier);
  }

  deposer(): void {
    const d = this.detail;
    if (!d || this.envoi) return;
    const err = erreurFichier(this.fichier);
    if (err) { this.erreurDepot = err; return; }
    if (!this.depotValide) { this.erreurDepot = 'Renseignez le numéro, la date et le montant TTC de la facture.'; return; }
    this.envoi = true;
    this.erreurDepot = null;
    this.suivi.deposer(d.id, { fichier: this.fichier!, numero_facture: this.depot.numero.trim(), date_facture: this.depot.date, montant_ttc: Number(this.depot.montant) })
      .subscribe({
        next: r => {
          this.depotModal?.hide();
          this.miseAJour(r, r.facture?.conforme ? 'Facture déposée : montant conforme au relevé.'
            : `Facture déposée avec un écart de ${ecartFr(r.facture?.ecart ?? 0)} : la comptabilité est prévenue.`);
        },
        error: e => { this.envoi = false; this.erreurDepot = messageErreur(e, 'Le dépôt a échoué.'); },
      });
  }
}
