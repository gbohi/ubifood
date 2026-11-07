// Comptes repas (soldes) : comptabilité et administrateurs (tous les comptes,
// détail et remboursement du solde motivé) ; gestionnaires : employés de leurs
// agences, en lecture seule.
// API : GET caisse/comptes/?q=&agence=&solde_min=&page=, GET caisse/employes/<id>/ (détail),
// POST caisse/rembourser/ { user_id, motif, mode }, PDF du reçu ;
// GET caisse/comptes/<id>/mouvements/?date_debut=&date_fin=&type=&page= (grand livre, comptabilité)
// et ses exports …/mouvements/pdf/ et …/mouvements/xlsx/.
import { Component, DestroyRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import { estComptable, filtrerAgencesGerees } from 'src/app/core/helpers/roles';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';
import {
  CaisseService, CompteSolde, FicheCaisse, ICONES_RECU, MouvementsCompte, PapierRecu, Recu, STATUTS_REPAS, fcfa, heureIso, initiales, jourFr, jourHeureFr, messageCaisse,
} from 'src/app/core/services/caisse/caisse.service';

@Component({
  selector: 'app-comptes-repas',
  templateUrl: './comptes-repas.component.html',
})
export class ComptesRepasComponent implements OnInit {
  private caisse = inject(CaisseService);
  private toastr = inject(ToastrService);
  private store = inject(Store);
  private destroyRef = inject(DestroyRef);
  private user = inject(TokenStorageService).getUser();

  readonly fcfa = fcfa;
  readonly heure = heureIso;
  readonly jour = jourFr;
  readonly jourHeure = jourHeureFr;
  readonly initiales = initiales;
  readonly statuts = STATUTS_REPAS;
  readonly icones = ICONES_RECU;
  /** Comptabilité : détail et remboursement ; gestionnaire : lecture seule */
  readonly comptable = estComptable(this.user);

  agences: any[] = [];
  q = '';
  agence: number | '' = '';
  seulementSoldes = false;
  comptes: CompteSolde[] = [];
  total = 0;
  totalSoldes = 0;
  page = 1;
  chargement = true;
  erreur: string | null = null;
  private recherche$ = new Subject<void>();

  // Détail
  detail: CompteSolde | null = null;
  fiche: FicheCaisse | null = null;
  chargementFiche = false;
  erreurFiche: string | null = null;
  @ViewChild('detailModal') detailModal?: ModalDirective;
  /** Onglet du détail : repas des mois ouverts ou historique des mouvements du compte */
  ongletDetail: 'repas' | 'mouvements' = 'repas';

  // Mouvements du compte (grand livre)
  mouvements: MouvementsCompte | null = null;
  mvtDebut = '';
  mvtFin = '';
  mvtType = '';
  mvtPage = 1;
  readonly mvtParPage = 15;
  chargementMvt = false;
  erreurMvt: string | null = null;

  // Remboursement
  aRembourser: CompteSolde | null = null;
  motif = '';
  envoi = false;
  erreurRemboursement: string | null = null;
  recuRemboursement: Recu | null = null;
  telechargement: string | null = null;
  @ViewChild('rembourserModal') rembourserModal?: ModalDirective;

  ngOnInit(): void {
    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.select(selectAllAgenceWithoutPagination).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(a => this.agences = this.comptable ? (a ?? []) : filtrerAgencesGerees(a ?? [], this.user));
    this.recherche$.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe(() => { this.page = 1; this.charger(); });
    this.charger();
  }

  charger(): void {
    this.chargement = true;
    this.caisse.comptes({ q: this.q.trim(), agence: this.agence, solde_min: this.seulementSoldes ? '0.01' : '', page: this.page })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: p => {
          this.comptes = p.results; this.total = p.count; this.totalSoldes = p.total_soldes;
          this.chargement = false; this.erreur = null;
        },
        error: e => { this.chargement = false; this.erreur = messageCaisse(e, 'Les comptes n\'ont pas pu être chargés.'); },
      });
  }

  rechercher(): void { this.recherche$.next(); }
  filtrer(): void { this.page = 1; this.charger(); }
  changerPage(p: number): void { this.page = p; this.charger(); }

  // ── Détail (comptabilité) ──────────────────────────────────
  ouvrirDetail(c: CompteSolde): void {
    if (!this.comptable) return;
    this.detail = c;
    this.fiche = null;
    this.ongletDetail = 'repas';
    this.mouvements = null;
    this.mvtDebut = this.mvtFin = this.mvtType = '';
    this.mvtPage = 1;
    this.erreurFiche = null;
    this.chargementFiche = true;
    this.detailModal?.show();
    this.caisse.fiche(c.id).subscribe({
      next: f => { this.fiche = f; this.chargementFiche = false; },
      error: e => { this.chargementFiche = false; this.erreurFiche = messageCaisse(e, 'Fiche indisponible.'); },
    });
  }

  // ── Mouvements du compte (comptabilité) ───────────────────
  ouvrirMouvements(): void {
    this.ongletDetail = 'mouvements';
    if (!this.mouvements) this.chargerMouvements();
  }

  private filtresMouvements(): Record<string, any> {
    return { date_debut: this.mvtDebut, date_fin: this.mvtFin, type: this.mvtType };
  }

  filtrerMouvements(): void { this.mvtPage = 1; this.chargerMouvements(); }
  pageMouvements(p: number): void { this.mvtPage = p; this.chargerMouvements(); }

  chargerMouvements(): void {
    const c = this.detail;
    if (!c) return;
    if (this.mvtDebut && this.mvtFin && this.mvtFin < this.mvtDebut) {
      this.erreurMvt = 'La date de fin précède la date de début.';
      return;
    }
    this.chargementMvt = true;
    this.erreurMvt = null;
    this.caisse.mouvementsCompte(c.id, { ...this.filtresMouvements(), page: this.mvtPage, page_size: this.mvtParPage }).subscribe({
      next: m => { if (this.detail?.id === c.id) { this.mouvements = m; this.chargementMvt = false; } },
      error: e => { this.chargementMvt = false; this.erreurMvt = messageCaisse(e, 'Les mouvements n\'ont pas pu être chargés.'); },
    });
  }

  exporterMouvements(format: 'pdf' | 'xlsx'): void {
    const c = this.detail;
    if (!c || this.telechargement) return;
    this.telechargement = `mvt-${format}`;
    this.caisse.exportMouvements(c.id, format, this.filtresMouvements()).subscribe({
      next: b => {
        this.telechargement = null;
        const periode = [this.mvtDebut, this.mvtFin].filter(Boolean).join('-');
        this.caisse.enregistrer(b, `mouvements-${c.matricule}${periode ? '-' + periode : ''}.${format}`.toLowerCase());
      },
      error: e => { this.telechargement = null; this.toastr.error(messageCaisse(e, 'Export indisponible.'), 'Mouvements'); },
    });
  }

  pdfRecuMouvement(recuId: number, numero: string | null): void {
    this.pdf({ id: recuId, numero: numero ?? 'recu' } as Recu, 'a5');
  }

  // ── Remboursement ──────────────────────────────────────────
  demanderRemboursement(c: CompteSolde): void {
    this.detailModal?.hide();
    this.aRembourser = c;
    this.motif = '';
    this.erreurRemboursement = null;
    this.recuRemboursement = null;
    this.rembourserModal?.show();
  }

  rembourser(): void {
    const c = this.aRembourser;
    if (!c || this.envoi) return;
    if (!this.motif.trim()) { this.erreurRemboursement = 'Le motif du remboursement est obligatoire.'; return; }
    this.envoi = true;
    this.erreurRemboursement = null;
    this.caisse.rembourser({ user_id: c.id, motif: this.motif.trim(), mode: 'especes' }).subscribe({
      next: r => {
        this.envoi = false;
        this.recuRemboursement = r;
        this.toastr.success(`${fcfa(r.montant)} remboursés à ${c.nom_prenom} : le compte repas est à zéro.`, r.numero);
        this.charger();
      },
      error: e => { this.envoi = false; this.erreurRemboursement = messageCaisse(e, 'Remboursement impossible.'); },
    });
  }

  pdf(r: Recu, papier: PapierRecu): void {
    if (this.telechargement) return;
    this.telechargement = `${r.id}-${papier}`;
    this.caisse.pdfRecu(r.id, papier).subscribe({
      next: b => { this.telechargement = null; this.caisse.enregistrer(b, this.caisse.nomFichier(r, papier)); },
      error: e => { this.telechargement = null; this.toastr.error(messageCaisse(e, 'PDF indisponible.'), 'Reçu'); },
    });
  }
}
