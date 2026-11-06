// Écran de caisse (caissiers et administrateurs) : recherche d'un employé (nom,
// matricule ou badge scanné), fiche du compte repas (solde, repas des mois ouverts
// et leur mode de paiement), « Recharger le compte » (seule opération d'encaissement :
// la régularisation n'existe plus, l'employé choisit compte repas ou retenue sur
// salaire à la commande), reçu imprimable, reçus du jour.
// API : caisse/contexte, caisse/employes[/<id>], caisse/recharger,
// caisse/recus (?date=&caissier=), caisse/recus/<id>/pdf/?papier=ticket|a5.
import { AfterViewInit, Component, DestroyRef, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';
import {
  CaisseService, ContexteCaisse, EmployeCaisse, FicheCaisse, ICONES_RECU, ModePaiement, PapierRecu, Recu,
  STATUTS_REPAS, aujourdhuiIso, fcfa, heureIso, initiales, jourFr, messageCaisse,
} from 'src/app/core/services/caisse/caisse.service';

const COULEURS = ['#0F3A6E', '#C98A16', '#7B61FF', '#1C7F45', '#2F80ED', '#5A7090'];

@Component({
  selector: 'app-caisse',
  templateUrl: './caisse.component.html',
})
export class CaisseComponent implements OnInit, AfterViewInit {
  private caisse = inject(CaisseService);
  private toastr = inject(ToastrService);
  private destroyRef = inject(DestroyRef);

  @ViewChild('champRecherche') champRecherche?: ElementRef<HTMLInputElement>;

  readonly statuts = STATUTS_REPAS;
  readonly icones = ICONES_RECU;
  readonly montantsRapides = [5000, 10000, 20000];
  readonly fcfa = fcfa;
  readonly heure = heureIso;
  readonly jour = jourFr;
  readonly initiales = initiales;

  contexte: ContexteCaisse | null = null;
  erreurContexte: string | null = null;

  // ── Recherche ──────────────────────────────────────────────
  q = '';
  resultats: EmployeCaisse[] = [];
  rechercheEnCours = false;
  rechercheFaite = false;
  erreurRecherche: string | null = null;
  indexActif = 0;
  private saisie$ = new Subject<string>();

  // ── Employé choisi ─────────────────────────────────────────
  fiche: FicheCaisse | null = null;
  chargementFiche = false;
  erreurFiche: string | null = null;

  // ── Opérations ─────────────────────────────────────────────
  mode: ModePaiement = 'especes';
  montantRecharge: number | null = null;
  reference = '';
  envoi = false;
  erreurOperation: string | null = null;
  /** Dernière opération enregistrée : panneau « reçu » */
  dernierRecu: Recu | null = null;
  telechargement: string | null = null;

  // ── Reçus du jour (de ce caissier) ─────────────────────────
  recusDuJour: Recu[] = [];
  nbRecusDuJour = 0;

  ngOnInit(): void {
    this.caisse.contexte().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: c => {
        this.contexte = c;
        this.mode = (c.modes_paiement.find(m => m.actif)?.code ?? 'especes');
        this.chargerRecusDuJour();
      },
      error: e => this.erreurContexte = messageCaisse(e, 'La caisse n\'a pas pu être ouverte.'),
    });

    this.saisie$.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap(q => {
        if (q.trim().length < 2) { this.rechercheEnCours = false; return of(null); }
        this.rechercheEnCours = true;
        return this.caisse.rechercher(q.trim()).pipe(catchError(e => { this.erreurRecherche = messageCaisse(e); return of({ resultats: [] }); }));
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(r => {
      this.rechercheEnCours = false;
      if (r === null) { this.resultats = []; this.rechercheFaite = false; return; }
      this.resultats = r.resultats;
      this.rechercheFaite = true;
      this.indexActif = 0;
    });
  }

  ngAfterViewInit(): void {
    this.focusRecherche();
  }

  focusRecherche(): void {
    setTimeout(() => this.champRecherche?.nativeElement.focus());
  }

  // ── Recherche (clavier et lecteur de badge) ────────────────
  onSaisie(q: string): void {
    this.q = q;
    this.erreurRecherche = null;
    this.saisie$.next(q);
  }

  /**
   * Entrée : un lecteur de code-barres « tape » le matricule puis Entrée.
   * Correspondance exacte du matricule (en tête des résultats) ou résultat unique : choisi
   * directement ; sinon le résultat surligné.
   */
  valider(): void {
    const q = this.q.trim();
    if (q.length < 2) { this.erreurRecherche = 'Saisissez au moins 2 caractères (nom, prénoms ou matricule).'; return; }
    this.rechercheEnCours = true;
    this.caisse.rechercher(q).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => {
        this.rechercheEnCours = false;
        this.resultats = r.resultats;
        this.rechercheFaite = true;
        const exact = r.resultats.find(e => e.matricule.toLowerCase() === q.toLowerCase());
        const choix = exact ?? r.resultats[Math.min(this.indexActif, r.resultats.length - 1)];
        if (choix) this.choisir(choix);
      },
      error: e => { this.rechercheEnCours = false; this.erreurRecherche = messageCaisse(e); },
    });
  }

  deplacer(delta: number, ev: Event): void {
    if (!this.resultats.length) return;
    ev.preventDefault();
    this.indexActif = (this.indexActif + delta + this.resultats.length) % this.resultats.length;
  }

  choisir(e: EmployeCaisse): void {
    this.resultats = [];
    this.rechercheFaite = false;
    this.q = '';
    this.saisie$.next('');
    this.dernierRecu = null;
    this.erreurOperation = null;
    this.montantRecharge = null;
    this.reference = '';
    this.chargerFiche(e.id);
  }

  effacer(): void {
    this.fiche = null;
    this.dernierRecu = null;
    this.erreurOperation = null;
    this.q = '';
    this.resultats = [];
    this.rechercheFaite = false;
    this.focusRecherche();
  }

  private chargerFiche(id: number): void {
    this.chargementFiche = true;
    this.erreurFiche = null;
    this.caisse.fiche(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: f => { this.fiche = f; this.chargementFiche = false; },
      error: e => { this.chargementFiche = false; this.erreurFiche = messageCaisse(e, 'Fiche indisponible.'); },
    });
  }

  // ── Mode de paiement ───────────────────────────────────────
  get modes() {
    return this.contexte?.modes_paiement ?? [{ code: 'especes' as ModePaiement, libelle: 'Espèces', actif: true }];
  }

  choisirMode(code: ModePaiement, actif: boolean): void {
    if (actif) this.mode = code;
  }

  // ── Opérations ─────────────────────────────────────────────
  get peutRecharger(): boolean {
    const m = Number(this.montantRecharge);
    return !!this.fiche && this.fiche.employe.actif && m > 0 && !this.envoi;
  }

  recharger(): void {
    const f = this.fiche;
    if (!f || !this.peutRecharger) return;
    this.envoi = true;
    this.erreurOperation = null;
    this.caisse.recharger({ user_id: f.employe.id, montant: Number(this.montantRecharge), mode: this.mode, reference: this.reference.trim() })
      .subscribe({
        next: r => this.apresOperation(r, `Compte de ${f.employe.nom_prenom} rechargé de ${fcfa(r.montant)}.`),
        error: e => { this.envoi = false; this.erreurOperation = messageCaisse(e); },
      });
  }

  private apresOperation(r: Recu, message: string): void {
    this.envoi = false;
    this.dernierRecu = r;
    this.montantRecharge = null;
    this.reference = '';
    this.toastr.success(message, r.numero);
    if (this.fiche) this.chargerFiche(this.fiche.employe.id);
    this.rafraichirContexte();
    this.chargerRecusDuJour();
  }

  nouvelleOperation(): void {
    this.dernierRecu = null;
    this.erreurOperation = null;
  }

  private rafraichirContexte(): void {
    this.caisse.contexte().subscribe({ next: c => this.contexte = c, error: () => { /* chiffre indicatif */ } });
  }

  // ── Reçus ──────────────────────────────────────────────────
  chargerRecusDuJour(): void {
    const moi = this.contexte?.utilisateur.id;
    this.caisse.recus({ date: this.contexte?.aujourdhui || aujourdhuiIso(), caissier: moi, page_size: 8 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: p => { this.recusDuJour = p.results; this.nbRecusDuJour = p.count; },
        error: () => { this.recusDuJour = []; },
      });
  }

  pdf(r: Recu, papier: PapierRecu, imprimer = false): void {
    const cle = `${r.id}-${papier}`;
    if (this.telechargement) return;
    this.telechargement = cle;
    this.caisse.pdfRecu(r.id, papier).subscribe({
      next: blob => {
        this.telechargement = null;
        if (imprimer) this.caisse.imprimer(blob);
        else this.caisse.enregistrer(blob, this.caisse.nomFichier(r, papier));
      },
      error: e => { this.telechargement = null; this.toastr.error(messageCaisse(e, 'PDF indisponible.'), 'Reçu'); },
    });
  }

  // ── Affichage ──────────────────────────────────────────────
  couleur(id: number): string { return COULEURS[id % COULEURS.length]; }

  /** Mois couverts par la fiche : « octobre – novembre 2026 » */
  get periode(): string {
    const f = this.fiche;
    if (!f) return '';
    const mois = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const a = mois(f.date_debut), b = mois(f.date_fin);
    return a === b ? a : `${a} – ${b}`;
  }

  jourRepas(iso: string): string {
    return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  }

  libelleSolde(r: Recu): string {
    return `${fcfa(r.solde_avant)} → ${fcfa(r.solde_apres)}`;
  }
}
