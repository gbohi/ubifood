// Commander mes repas : parcours « agence → prestataire → équipe → jour » sur une
// seule page, avec un fil d'étapes. Les règles restent celles du serveur (une
// commande par jour toutes agences confondues, délais, agences ouvertes ou non) :
// l'écran affiche ce que renvoient les routes commander/… (voir l'API).

import { Component, OnInit, OnDestroy, DestroyRef, inject, ViewChild } from '@angular/core';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { Actions, ofType } from '@ngrx/effects';
import { interval } from 'rxjs';
import { environment } from 'src/environments/environment';

import {
  fetchMesCommandes,
  createCommande,
  annulerCommande,
  changerModePaiement,
  resetCommandeError,
  createCommandeSuccess,
  annulerCommandeSuccess,
  changerModePaiementSuccess,
} from 'src/app/store/Commande/commande.action';
import {
  selectMesCommandes,
  selectCommandeIsSubmitting,
  selectCommandeError,
  selectCommandeSuccess,
} from 'src/app/store/Commande/commande-selector';
import { CommandeService } from 'src/app/core/services/commande/commande.service';
import {
  ParcoursCommandeService, AgenceCommande, PrestataireCarte, EquipeCommande,
  JoursCommande, JourCommande, PlatCommande,
} from 'src/app/core/services/commande/parcours-commande.service';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import {
  CommandeModel, InfoPaiement, ModePaiement, MODES_PAIEMENT_LIBELLES,
} from 'src/app/store/Commande/commande.model';
import { DatePipe, DecimalPipe } from '@angular/common';

export type Etape = 1 | 2 | 3;

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_COURTS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
              'septembre', 'octobre', 'novembre', 'décembre'];
const DEGRADES = [
  'linear-gradient(135deg,#F9D9A7,#E9A04D)',
  'linear-gradient(135deg,#A7D3F9,#4D8FE9)',
  'linear-gradient(135deg,#B7EBC8,#3EC970)',
  'linear-gradient(135deg,#D9C7F5,#8E6FE0)',
  'linear-gradient(135deg,#F7C1B5,#E66C55)',
];
/** Choix de l'agence, gardé pour la semaine en cours le temps de la session */
const CLE_AGENCE = 'ubifood.commander.agence';

/** Ce que le choix du mode de paiement doit connaître du repas */
interface CiblePaiement {
  menuId: number; date: string; limite?: string;
  platId: number; platNom: string; prestataire: string; equipe?: string;
}

@Component({
  selector: 'app-liste-commandes',
  templateUrl: './liste-commandes.component.html',
  styleUrl: './liste-commandes.component.scss',
  providers: [DecimalPipe, DatePipe]
})
export class ListeCommandesComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);
  private actions$ = inject(Actions);
  private parcours = inject(ParcoursCommandeService);

  readonly imgBase = `${environment.apiUrl}`;
  allergies: string[] = [];

  etape: Etape = 1;

  // ── Étape 1 : agences + prestataires ─────────────────────────
  agences: AgenceCommande[] = [];
  monAgenceId: number | null = null;
  agenceId: number | null = null;
  prestataires: PrestataireCarte[] = [];
  dateListe = '';
  chargementAgences = false;
  chargementPrestataires = false;
  erreurListe: string | null = null;

  // ── Étape 2 : prestataire + équipes ──────────────────────────
  prestataire: PrestataireCarte | null = null;
  equipes: EquipeCommande[] = [];
  chargementEquipes = false;

  // ── Étape 3 : semaine + plats ────────────────────────────────
  equipe: EquipeCommande | null = null;
  semaine: JoursCommande | null = null;
  jourSelectionne = '';
  chargementJours = false;
  erreurJours: string | null = null;

  mesCommandes: CommandeModel[] = [];
  isSubmitting = false;
  error: string | null = null;
  successMessage: string | null = null;

  /** Plat en cours de commande (pour le bandeau « jour suivant ») */
  private enCours: { date: string; platNom: string } | null = null;
  derniereCommande: { date: string; platNom: string } | null = null;

  annulationEnCours: { commande: CommandeModel; platNom: string; limite?: string } | null = null;
  @ViewChild('annulationModal', { static: false }) annulationModal?: ModalDirective;

  /** Choix du mode de paiement : à la réservation ou pour changer celui d'une commande en attente */
  paiement: {
    cible: CiblePaiement; commande?: CommandeModel;
    info?: InfoPaiement; chargement: boolean; erreur?: string; mode: ModePaiement;
  } | null = null;
  @ViewChild('paiementModal', { static: false }) paiementModal?: ModalDirective;
  readonly libellesModes = MODES_PAIEMENT_LIBELLES;

  /** Heure courante (compte à rebours), rafraîchie toutes les 30 s */
  maintenant = Date.now();

  constructor(
    private store: Store,
    public commandeService: CommandeService,
    private tokenStorage: TokenStorageService,
  ) {}

  ngOnInit(): void {
    const user = this.tokenStorage.getUser();
    this.allergies = (user?.user_allergies ?? []).map((a: any) => a.libelle).filter(Boolean);

    this.store.dispatch(fetchMesCommandes({}));
    this.store.select(selectMesCommandes)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(c => this.mesCommandes = c ?? []);
    this.store.select(selectCommandeIsSubmitting)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.isSubmitting = v);
    this.store.select(selectCommandeError)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(e => { this.error = e; if (e) this.enCours = null; });
    this.store.select(selectCommandeSuccess)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(s => {
        this.successMessage = s;
        if (s && this.enCours) {
          this.derniereCommande = this.enCours;
          this.enCours = null;
        }
      });

    // Après une commande, une annulation ou un changement de mode : états des jours à jour
    this.actions$
      .pipe(ofType(createCommandeSuccess, annulerCommandeSuccess, changerModePaiementSuccess),
            takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.store.dispatch(fetchMesCommandes({}));
        if (this.etape === 3) this.chargerJours(this.semaine?.semaine.debut ?? null, this.jourSelectionne);
      });

    interval(30000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.maintenant = Date.now());

    this.chargerAgences();
  }

  ngOnDestroy(): void {
    this.store.dispatch(resetCommandeError());
  }

  // ══ Étape 1 : agences ═════════════════════════════════════════

  private chargerAgences(): void {
    this.chargementAgences = true;
    this.erreurListe = null;
    this.parcours.agences().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => {
        this.chargementAgences = false;
        this.agences = r.agences ?? [];
        this.monAgenceId = r.mon_agence_id;
        const memorisee = this.agenceMemorisee();
        const choix = this.agences.find(a => a.id === memorisee)
          ?? this.agences.find(a => a.id === r.mon_agence_id)
          ?? this.agences[0];
        if (choix) this.choisirAgence(choix.id, false);
      },
      error: err => {
        this.chargementAgences = false;
        this.erreurListe = this.message(err, 'Les agences n\'ont pas pu être chargées.');
      },
    });
  }

  get agence(): AgenceCommande | undefined {
    return this.agences.find(a => a.id === this.agenceId);
  }

  get nomMonAgence(): string {
    return this.agences.find(a => a.id === this.monAgenceId)?.nom ?? '';
  }

  /** Agence d'une autre agence que la sienne (mission) */
  get enMission(): boolean {
    return this.monAgenceId != null && this.agenceId != null && this.agenceId !== this.monAgenceId;
  }

  choisirAgence(id: number, memoriser = true): void {
    if (memoriser) this.memoriserAgence(id);
    this.agenceId = id;
    this.allerEtape(1);
    this.prestataire = null;
    this.equipe = null;
    this.semaine = null;
    this.chargementPrestataires = true;
    this.erreurListe = null;
    this.prestataires = [];
    this.parcours.prestataires(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => {
        if (this.agenceId !== id) return;
        this.chargementPrestataires = false;
        this.prestataires = r.prestataires ?? [];
        this.dateListe = r.date;
      },
      error: err => {
        if (this.agenceId !== id) return;
        this.chargementPrestataires = false;
        this.erreurListe = this.message(err, 'Les prestataires n\'ont pas pu être chargés.');
      },
    });
  }

  revenirMonAgence(): void {
    if (this.monAgenceId != null) this.choisirAgence(this.monAgenceId);
  }

  private semaineCourante(): string {
    return this.lundiDe(new Date());
  }

  private agenceMemorisee(): number | null {
    try {
      const v = JSON.parse(sessionStorage.getItem(CLE_AGENCE) ?? 'null');
      return v && v.semaine === this.semaineCourante() ? Number(v.id) : null;
    } catch { return null; }
  }

  private memoriserAgence(id: number): void {
    try {
      sessionStorage.setItem(CLE_AGENCE, JSON.stringify({ id, semaine: this.semaineCourante() }));
    } catch { /* stockage indisponible : choix non gardé */ }
  }

  // ══ Étape 2 : prestataire et équipes ══════════════════════════

  choisirPrestataire(p: PrestataireCarte): void {
    if (this.agenceId == null) return;
    this.prestataire = p;
    this.equipe = null;
    this.semaine = null;
    this.equipes = [];
    this.allerEtape(2);
    this.chargementEquipes = true;
    this.erreurListe = null;
    const agence = this.agenceId;
    this.parcours.equipes(p.id, agence).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => {
        if (this.prestataire?.id !== p.id) return;
        this.chargementEquipes = false;
        this.prestataire = { ...p, ...r.prestataire };
        this.equipes = r.equipes ?? [];
        // Une seule équipe : choisie d'office (les puces restent visibles)
        if (this.equipes.length === 1) this.choisirEquipe(this.equipes[0]);
      },
      error: err => {
        this.chargementEquipes = false;
        this.erreurListe = this.message(err, 'Les équipes n\'ont pas pu être chargées.');
      },
    });
  }

  // ══ Étape 3 : jours et plats ══════════════════════════════════

  choisirEquipe(e: EquipeCommande | null): void {
    this.equipe = e;
    this.derniereCommande = null;
    this.allerEtape(3);
    this.chargerJours(null);
  }

  chargerJours(semaine: string | null, jourVoulu: string | null = null): void {
    if (this.agenceId == null || !this.prestataire) return;
    this.chargementJours = true;
    this.erreurJours = null;
    const cle = `${this.agenceId}-${this.prestataire.id}-${this.equipe?.id ?? ''}`;
    this.parcours.jours(this.agenceId, this.prestataire.id, this.equipe?.id ?? null, semaine)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: r => {
          if (cle !== `${this.agenceId}-${this.prestataire?.id}-${this.equipe?.id ?? ''}`) return;
          this.chargementJours = false;
          this.semaine = r;
          const dates = r.jours.map(j => j.date);
          this.jourSelectionne = jourVoulu && dates.includes(jourVoulu) ? jourVoulu : r.jour_par_defaut;
        },
        error: err => {
          this.chargementJours = false;
          this.semaine = null;
          this.erreurJours = this.message(err, 'Les menus n\'ont pas pu être chargés.');
        },
      });
  }

  changerSemaine(sens: -1 | 1): void {
    if (!this.semaine) return;
    this.derniereCommande = null;
    this.chargerJours(sens < 0 ? this.semaine.semaine.precedente : this.semaine.semaine.suivante);
  }

  get jour(): JourCommande | undefined {
    return this.semaine?.jours.find(j => j.date === this.jourSelectionne);
  }

  choisirJour(j: JourCommande): void {
    this.jourSelectionne = j.date;
    this.derniereCommande = null;
  }

  get jourSuivantAReserver(): JourCommande | null {
    const jours = this.semaine?.jours ?? [];
    return jours.find(j => j.date > this.jourSelectionne && j.etat === 'a_reserver')
      ?? jours.find(j => j.date !== this.jourSelectionne && j.etat === 'a_reserver') ?? null;
  }

  allerJourSuivant(): void {
    const j = this.jourSuivantAReserver;
    this.derniereCommande = null;
    if (j) this.jourSelectionne = j.date;
    else this.changerSemaine(1);
  }

  // ══ Fil d'étapes ══════════════════════════════════════════════

  allerEtape(e: Etape): void {
    if (e < 3 && (this.successMessage || this.error)) this.store.dispatch(resetCommandeError());
    this.etape = e;
    if (e < 3) this.derniereCommande = null;
  }

  retour(): void {
    if (this.etape === 3 && this.equipes.length > 1) this.allerEtape(2);
    else this.allerEtape(1);
  }

  // ══ Libellés et images ════════════════════════════════════════

  url(chemin?: string | null): string | null {
    if (!chemin) return null;
    return chemin.startsWith('http') || chemin.startsWith('data:') ? chemin : `${this.imgBase}${chemin}`;
  }

  initiales(nom?: string | null): string {
    const mots = (nom ?? '').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(m => m.length > 1);
    const sans = mots.filter(m => !/^(le|la|les|de|du|des|chez|d|l)$/i.test(m));
    const m = sans.length ? sans : mots;
    return (m.length >= 2 ? m[0][0] + m[1][0] : (m[0] ?? '?').slice(0, 2)).toUpperCase();
  }

  note(v?: number | null): string {
    return v == null ? '' : v.toFixed(1).replace('.', ',');
  }

  degrade(i: number): string {
    return DEGRADES[Math.abs(i) % DEGRADES.length];
  }

  /** Équipes d'une carte : « Journée, Nuit » */
  nomsEquipes(p: PrestataireCarte): string {
    return (p.equipes ?? []).map(e => e.libelle).join(', ');
  }

  horaires(e: { heure_debut_service?: string | null; heure_fin_service?: string | null }): string {
    const h = (v?: string | null) => (v ?? '').slice(0, 5).replace(':', ' h ').replace(' h 00', ' h');
    return e.heure_debut_service && e.heure_fin_service ? `${h(e.heure_debut_service)} – ${h(e.heure_fin_service)}` : '';
  }

  /** Plage de jours d'une équipe : « lun. → ven. » */
  plageJours(e: EquipeCommande): string {
    const noms = Array.from(new Set((e.jours ?? []).map(d => this.versDate(d).getDay())))
      .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    if (!noms.length) return '';
    const court = (n: number) => `${JOURS_COURTS[n].toLowerCase()}.`;
    return noms.length === 1 ? court(noms[0]) : `${court(noms[0])} → ${court(noms[noms.length - 1])}`;
  }

  etatLibelle(j: JourCommande): string {
    switch (j.etat) {
      case 'reserve':    return j.commande?.statut === 'retiree' ? 'Servi' : 'Réservé';
      case 'a_reserver': return 'À réserver';
      case 'ferme':      return 'Fermé';
      default:           return 'Pas de menu';
    }
  }

  // ══ Plats et commandes ════════════════════════════════════════

  /** Commande complète (store) d'un plat commandé : paiement, annulation, mode */
  commandeDe(id?: number | null): CommandeModel | undefined {
    return id == null ? undefined : this.mesCommandes.find(c => c.id === id);
  }

  estRetire(j: JourCommande, plat: PlatCommande): boolean {
    return plat.statut === 'commande' && j.commande?.statut === 'retiree';
  }

  annulationOuverte(c?: CommandeModel): boolean {
    return !!c && c.statut === 'en_attente' && this.commandeService.annulationOuverte(c.menu_detail);
  }

  libelleLimite(limite?: string): string {
    return this.commandeService.libelleLimite(limite);
  }

  jourLimite(limite?: string): string {
    return this.libelleLimite(limite).split(' à ')[0];
  }

  compteARebours(limite?: string): string {
    if (!limite) return '';
    const reste = new Date(limite).getTime() - this.maintenant;
    if (reste <= 0 || reste > 48 * 3600000) return '';
    const h = Math.floor(reste / 3600000);
    const min = Math.floor((reste % 3600000) / 60000);
    return h > 0 ? `ferme dans ${h} h ${String(min).padStart(2, '0')}` : `ferme dans ${min} min`;
  }

  private cible(j: JourCommande, plat: PlatCommande): CiblePaiement {
    return {
      menuId: plat.menu_id, date: j.date, limite: j.date_limite_commande,
      platId: plat.id, platNom: plat.nom,
      prestataire: this.prestataire?.nom_affiche ?? '', equipe: plat.typeequipe,
    };
  }

  reserver(j: JourCommande, plat: PlatCommande): void {
    this.ouvrirPaiement(this.cible(j, plat));
  }

  changerMode(j: JourCommande, plat: PlatCommande): void {
    const commande = this.commandeDe(plat.commande_id);
    if (commande) this.ouvrirPaiement(this.cible(j, plat), commande);
  }

  private ouvrirPaiement(cible: CiblePaiement, commande?: CommandeModel): void {
    this.paiement = {
      cible, commande, chargement: true,
      mode: commande?.mode_paiement ?? this.semaine?.mode_paiement_prefere ?? 'retenue',
    };
    this.paiementModal?.show();
    this.commandeService.infoPaiement(cible.menuId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: info => {
        if (!this.paiement) return;
        this.paiement.info = info;
        this.paiement.chargement = false;
        if (!commande) this.paiement.mode = info.mode_par_defaut;
      },
      error: err => {
        if (!this.paiement) return;
        this.paiement.chargement = false;
        this.paiement.erreur = this.message(err, 'Votre solde n\'a pas pu être chargé.');
      },
    });
  }

  get comptePossible(): boolean {
    const p = this.paiement;
    if (!p?.info) return false;
    return p.commande?.mode_paiement === 'compte' || p.info.compte_possible;
  }

  get raisonCompteImpossible(): string {
    return this.paiement?.info?.raison_compte_impossible ?? '';
  }

  get paiementValidable(): boolean {
    const p = this.paiement;
    if (!p || p.chargement || this.isSubmitting) return false;
    if (p.mode === 'compte' && !this.comptePossible) return false;
    return !p.commande || p.commande.mode_paiement !== p.mode;
  }

  choisirMode(mode: ModePaiement): void {
    if (!this.paiement || (mode === 'compte' && !this.comptePossible)) return;
    this.paiement.mode = mode;
  }

  confirmerPaiement(): void {
    const p = this.paiement;
    if (!p || !this.paiementValidable) return;
    this.paiementModal?.hide();
    this.paiement = null;
    this.derniereCommande = null;
    this.store.dispatch(resetCommandeError());
    if (p.commande) {
      this.store.dispatch(changerModePaiement({ id: p.commande.id, mode: p.mode }));
    } else {
      this.enCours = { date: p.cible.date, platNom: p.cible.platNom };
      this.store.dispatch(createCommande({ payload: { menu_id: p.cible.menuId, plat_id: p.cible.platId, mode_paiement: p.mode } }));
    }
  }

  fermerPaiement(): void {
    this.paiementModal?.hide();
    this.paiement = null;
  }

  texteMode(c?: CommandeModel): string {
    if (!c?.mode_paiement) return '';
    if (c.paiement?.mode === 'compte') return `Payé par le compte repas · ${this.montant(c.paiement.montant)}`;
    if (c.paiement?.mode === 'caisse') return `Payé à la caisse · ${this.montant(c.paiement.montant)}`;
    return 'Retenue sur salaire (à la clôture du mois)';
  }

  montant(v?: number | null): string {
    if (v == null) return '—';
    return `${Math.round(v).toLocaleString('fr-FR').replace(/ | | /g, ' ')} F`;
  }

  demanderAnnulation(plat: PlatCommande): void {
    const commande = this.commandeDe(plat.commande_id);
    if (!commande) return;
    this.annulationEnCours = { commande, platNom: plat.nom, limite: commande.menu_detail?.date_limite_annulation };
    this.annulationModal?.show();
  }

  get recreditAnnulation(): number | null {
    const c = this.annulationEnCours?.commande;
    return c?.paiement && c.paiement.mode !== 'retenue' ? c.paiement.montant : null;
  }

  confirmerAnnulation(): void {
    const a = this.annulationEnCours;
    this.annulationModal?.hide();
    this.annulationEnCours = null;
    if (!a) return;
    this.derniereCommande = null;
    this.store.dispatch(resetCommandeError());
    this.store.dispatch(annulerCommande({ id: a.commande.id }));
  }

  dismissAlert(): void {
    this.store.dispatch(resetCommandeError());
  }

  // ══ Dates ═════════════════════════════════════════════════════

  titreJour(date: string): string {
    const d = this.versDate(date);
    const j = JOURS[d.getDay()];
    return `${j.charAt(0).toUpperCase()}${j.slice(1)} ${d.getDate()} ${MOIS[d.getMonth()]}`;
  }

  jourCourt(date: string): string {
    return JOURS_COURTS[this.versDate(date).getDay()];
  }

  numeroJour(date: string): number {
    return this.versDate(date).getDate();
  }

  jourLong(date: string): string {
    const d = this.versDate(date);
    return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
  }

  dateCourte(date: string): string {
    if (!date) return '';
    const d = this.versDate(date);
    const mois = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    return `${JOURS_COURTS[d.getDay()].toLowerCase()}. ${d.getDate()} ${mois[d.getMonth()]}`;
  }

  libelleSemaine(): string {
    const s = this.semaine?.semaine;
    if (!s) return '';
    const a = this.versDate(s.debut), b = this.versDate(s.fin);
    return a.getMonth() === b.getMonth()
      ? `Semaine du ${a.getDate()} au ${b.getDate()} ${MOIS[b.getMonth()]}`
      : `Semaine du ${a.getDate()} ${MOIS[a.getMonth()]} au ${b.getDate()} ${MOIS[b.getMonth()]}`;
  }

  estAujourdhui(date: string): boolean {
    return date === (this.semaine?.aujourdhui ?? this.iso(new Date()));
  }

  private message(err: any, defaut: string): string {
    if (typeof err === 'string') return err;
    return err?.error?.detail ?? defaut;
  }

  private versDate(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  private iso(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  private lundiDe(d: Date): string {
    const l = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    l.setDate(l.getDate() - ((l.getDay() + 6) % 7));
    return this.iso(l);
  }
}
