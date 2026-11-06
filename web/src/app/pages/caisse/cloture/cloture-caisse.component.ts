// Clôture de caisse (caissier) : opérations pas encore clôturées et montant
// théorique (espèces des reçus valides), saisie du montant compté (aide au billetage
// facultative), écart calculé en direct, motif obligatoire si écart, soumission à
// la comptabilité ; historique des clôtures et de leur traitement.
// API : GET caisse/clotures/apercu/, POST caisse/clotures/, GET caisse/clotures/.
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToastrService } from 'ngx-toastr';
import {
  ApercuCloture, CaisseService, ClotureCaisse, ICONES_RECU, STATUTS_CLOTURE, fcfa, heureIso, jourFr, jourHeureFr, messageCaisse,
} from 'src/app/core/services/caisse/caisse.service';

/** Coupures en circulation (franc CFA BCEAO) */
const BILLETS = [10000, 5000, 2000, 1000, 500];
const PIECES = [500, 250, 200, 100, 50, 25, 10, 5];

@Component({
  selector: 'app-cloture-caisse',
  templateUrl: './cloture-caisse.component.html',
})
export class ClotureCaisseComponent implements OnInit {
  private caisse = inject(CaisseService);
  private toastr = inject(ToastrService);
  private destroyRef = inject(DestroyRef);

  readonly fcfa = fcfa;
  readonly heure = heureIso;
  readonly jour = jourFr;
  readonly jourHeure = jourHeureFr;
  readonly icones = ICONES_RECU;
  readonly statuts = STATUTS_CLOTURE;

  apercu: ApercuCloture | null = null;
  chargement = true;
  erreur: string | null = null;

  montantCompte: number | null = null;
  motif = '';
  envoi = false;
  erreurEnvoi: string | null = null;
  soumise: ClotureCaisse | null = null;
  voirRecus = false;

  // Aide au billetage
  billetage = false;
  readonly coupures = [
    ...BILLETS.map(v => ({ cle: `b${v}`, valeur: v, libelle: `Billet de ${fcfa(v)}` })),
    ...PIECES.map(v => ({ cle: `p${v}`, valeur: v, libelle: `Pièce de ${fcfa(v)}` })),
  ];
  quantites: Record<string, number | null> = {};

  // Historique
  historique: ClotureCaisse[] = [];
  totalHistorique = 0;
  page = 1;

  ngOnInit(): void {
    this.chargerApercu();
    this.chargerHistorique();
  }

  chargerApercu(): void {
    this.chargement = true;
    this.caisse.apercuCloture().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: a => { this.apercu = a; this.chargement = false; this.erreur = null; },
      error: e => { this.chargement = false; this.erreur = messageCaisse(e, 'La caisse n\'a pas pu être chargée.'); },
    });
  }

  chargerHistorique(): void {
    this.caisse.clotures({ page: this.page }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: p => { this.historique = p.results; this.totalHistorique = p.count; },
      error: () => { this.historique = []; },
    });
  }

  changerPage(p: number): void { this.page = p; this.chargerHistorique(); }

  // ── Billetage ─────────────────────────────────────────────
  get totalBilletage(): number {
    return this.coupures.reduce((s, c) => s + (Number(this.quantites[c.cle]) || 0) * c.valeur, 0);
  }

  appliquerBilletage(): void {
    this.montantCompte = this.totalBilletage;
  }

  viderBilletage(): void {
    this.quantites = {};
  }

  // ── Écart ─────────────────────────────────────────────────
  get saisi(): boolean { return this.montantCompte !== null && (this.montantCompte as any) !== ''; }

  get ecart(): number {
    if (!this.apercu || !this.saisi) return 0;
    return Math.round((Number(this.montantCompte) - this.apercu.montant_theorique) * 100) / 100;
  }

  get motifRequis(): boolean { return this.saisi && this.ecart !== 0; }

  get peutSoumettre(): boolean {
    return !!this.apercu?.nb_recus && this.saisi && Number(this.montantCompte) >= 0
      && (!this.motifRequis || !!this.motif.trim()) && !this.envoi;
  }

  soumettre(): void {
    if (!this.peutSoumettre) return;
    this.envoi = true;
    this.erreurEnvoi = null;
    this.caisse.soumettreCloture(Number(this.montantCompte), this.motifRequis ? this.motif.trim() : '').subscribe({
      next: c => {
        this.envoi = false;
        this.soumise = c;
        this.montantCompte = null;
        this.motif = '';
        this.quantites = {};
        this.toastr.success(`Clôture de ${fcfa(c.montant_compte)} soumise à la comptabilité.`, 'Caisse clôturée');
        this.chargerApercu();
        this.page = 1;
        this.chargerHistorique();
      },
      error: e => { this.envoi = false; this.erreurEnvoi = messageCaisse(e); },
    });
  }
}
