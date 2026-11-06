// Commander mes repas : un jour à la fois, dans un bandeau de la semaine.
// Les règles restent celles du serveur (une commande par jour, délais de
// commande et d'annulation paramétrés) ; ici on ne fait que les afficher.

import { Component, OnInit, OnDestroy, DestroyRef, inject, ViewChild } from '@angular/core';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { HttpClient, HttpParams } from '@angular/common/http';
import { selectAllTypeequipeWithoutPagination } from 'src/app/store/Typeequipe/typeequipe-selector';
import { fetchtypeequipeNoPaginateData } from 'src/app/store/Typeequipe/typeequipe.action';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { interval } from 'rxjs';
import { environment } from 'src/environments/environment';

import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';

import {
  fetchMesCommandes,
  createCommande,
  annulerCommande,
  changerModePaiement,
  resetCommandeError,
} from 'src/app/store/Commande/commande.action';
import {
  selectMesCommandes,
  selectCommandeIsSubmitting,
  selectCommandeIsLoading,
  selectCommandeError,
  selectCommandeSuccess,
} from 'src/app/store/Commande/commande-selector';
import { CommandeService } from 'src/app/core/services/commande/commande.service';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { estGestionnaire } from 'src/app/core/helpers/roles';
import { MenulistModel } from 'src/app/store/Menu/menu.model';
import {
  CommandeModel, InfoPaiement, ModePaiement, MODES_PAIEMENT_LIBELLES,
} from 'src/app/store/Commande/commande.model';
import { DatePipe, DecimalPipe } from '@angular/common';

export type EtatJour = 'commande' | 'retire' | 'a_reserver' | 'ferme' | 'pas_de_menu';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_COURTS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
              'septembre', 'octobre', 'novembre', 'décembre'];
const DEGRADES = [
  'linear-gradient(135deg,#F9D9A7,#E9A04D)',
  'linear-gradient(135deg,#A7D3F9,#4D8FE9)',
  'linear-gradient(135deg,#B7EBC8,#3EC970)',
  'linear-gradient(135deg,#D9C7F5,#8E6FE0)',
  'linear-gradient(135deg,#F7C1B5,#E66C55)',
];

@Component({
  selector: 'app-liste-commandes',
  templateUrl: './liste-commandes.component.html',
  styleUrl: './liste-commandes.component.scss',
  providers: [DecimalPipe, DatePipe]
})
export class ListeCommandesComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private destroyRef = inject(DestroyRef);
  private apiUrl = `${environment.apiUrl}/api/api`;

  /** Gestionnaire / administrateur : peut choisir l'agence et l'équipe */
  estGestion = false;
  agences: any[] = [];
  equipes: any[] = [];
  filtreAgence = '';
  filtreEquipe = '';
  allergies: string[] = [];

  // ── Semaine affichée ─────────────────────────────────────────
  lundi = '';
  jours: string[] = [];
  jourSelectionne = '';
  menusSemaine: MenulistModel[] = [];
  isLoadingMenus = false;
  erreurMenus: string | null = null;

  mesCommandes: CommandeModel[] = [];
  isLoadingCommandes = false;
  isSubmitting       = false;
  error:          string | null = null;
  successMessage: string | null = null;

  /** Plat en cours de commande (pour le bandeau « jour suivant ») */
  private enCours: { date: string; platNom: string } | null = null;
  derniereCommande: { date: string; platNom: string } | null = null;

  annulationEnCours: { menuId: number; platId: number; platNom: string; limite?: string } | null = null;
  @ViewChild('annulationModal', { static: false }) annulationModal?: ModalDirective;

  /**
   * Choix du mode de paiement : à la réservation (commande absente) ou pour
   * changer le mode d'une commande en attente (jusqu'à la date limite).
   */
  paiement: {
    menu: MenulistModel; plat: any; commande?: CommandeModel;
    info?: InfoPaiement; chargement: boolean; erreur?: string; mode: ModePaiement;
  } | null = null;
  @ViewChild('paiementModal', { static: false }) paiementModal?: ModalDirective;
  readonly libellesModes = MODES_PAIEMENT_LIBELLES;

  /** Heure courante (compte à rebours), rafraîchie toutes les 30 s */
  maintenant = Date.now();
  imgBase = `${environment.apiUrl}`;

  get isLoading(): boolean {
    return this.isLoadingMenus || (this.isLoadingCommandes && this.mesCommandes.length === 0);
  }

  constructor(
    private store: Store,
    public commandeService: CommandeService,
    private tokenStorage: TokenStorageService,
  ) {}

  ngOnInit(): void {
    const user = this.tokenStorage.getUser();
    this.estGestion = estGestionnaire(user);
    this.allergies = (user?.user_allergies ?? []).map((a: any) => a.libelle).filter(Boolean);
    const agence = this.agenceUtilisateur();
    this.filtreAgence = agence ? String(agence) : '';

    if (this.estGestion || !agence) {
      this.store.dispatch(fetchtypeequipeNoPaginateData());
      this.store.select(selectAllTypeequipeWithoutPagination)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(e => this.equipes = e ?? []);
      this.store.dispatch(fetchagenceNoPaginateData());
      this.store.select(selectAllAgenceWithoutPagination)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(a => this.agences = a ?? []);
    }

    this.store.dispatch(fetchMesCommandes({}));
    this.store.select(selectMesCommandes)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(c => this.mesCommandes = c ?? []);

    this.store.select(selectCommandeIsLoading)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.isLoadingCommandes = v);

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

    interval(30000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.maintenant = Date.now());

    this.allerSemaine(this.lundiDe(new Date()));
  }

  ngOnDestroy(): void {
    this.store.dispatch(resetCommandeError());
  }

  /** Agence de rattachement en cours de l'utilisateur connecté (fiche /users/me/) */
  private agenceUtilisateur(): number | null {
    const today = this.iso(new Date());
    const lignes: any[] = this.tokenStorage.getUser()?.user_agences ?? [];
    const active = lignes.find(l =>
      String(l.date_debut).slice(0, 10) <= today && (!l.date_fin || String(l.date_fin).slice(0, 10) >= today));
    const id = active?.agence_id ?? active?.agence;
    return id ? Number(id) : null;
  }

  get nomAgence(): string {
    const lignes: any[] = this.tokenStorage.getUser()?.user_agences ?? [];
    const l = lignes.find(x => String(x.agence_id ?? x.agence) === this.filtreAgence);
    return l?.agence_nom ?? this.agences.find(a => String(a.id) === this.filtreAgence)?.nom_agence ?? '';
  }

  // ── Semaine ──────────────────────────────────────────────────

  allerSemaine(lundi: string, jourVoulu: string | null = null): void {
    this.lundi = lundi;
    const l = this.versDate(lundi);
    this.jours = Array.from({ length: 5 }, (_, i) => this.iso(new Date(l.getFullYear(), l.getMonth(), l.getDate() + i)));
    this.chargerMenus(jourVoulu);
  }

  semaine(decalage: number): void {
    const l = this.versDate(this.lundi);
    l.setDate(l.getDate() + 7 * decalage);
    this.derniereCommande = null;
    this.allerSemaine(this.iso(l));
  }

  chargerMenus(jourVoulu: string | null = null): void {
    let params = new HttpParams()
      .set('date_menu__gte', this.jours[0]).set('date_menu__lte', this.jours[4]).set('page_size', '200');
    if (this.filtreAgence) params = params.set('agence', this.filtreAgence);
    if (this.filtreEquipe) params = params.set('typeequipe', this.filtreEquipe);
    this.isLoadingMenus = true;
    this.erreurMenus = null;
    this.http.get<any>(`${this.apiUrl}/menus/`, { params }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => {
        this.menusSemaine = (r?.results ?? r ?? []) as MenulistModel[];
        this.isLoadingMenus = false;
        if (jourVoulu && this.jours.includes(jourVoulu)) {
          this.jourSelectionne = jourVoulu;
        } else if (!this.jours.includes(this.jourSelectionne)) {
          this.jourSelectionne = this.jourParDefaut();
        }
      },
      error: err => {
        this.isLoadingMenus = false;
        this.menusSemaine = [];
        this.erreurMenus = typeof err === 'string' ? err : 'Les menus n\'ont pas pu être chargés.';
      },
    });
  }

  /** Premier jour à réserver à partir d'aujourd'hui, sinon aujourd'hui, sinon lundi */
  private jourParDefaut(): string {
    const auj = this.iso(new Date());
    return this.jours.find(j => j >= auj && this.etatJour(j) === 'a_reserver')
      ?? (this.jours.includes(auj) ? auj : this.jours[0]);
  }

  choisirJour(j: string): void {
    this.jourSelectionne = j;
    this.derniereCommande = null;
  }

  menusDuJour(date: string): MenulistModel[] {
    return this.menusSemaine.filter(m => m.date_menu === date)
      .sort((a, b) => `${a.agence_nom}${a.typeequipe_libelle}`.localeCompare(`${b.agence_nom}${b.typeequipe_libelle}`));
  }

  // ── État d'un jour (bandeau) ─────────────────────────────────

  commandeDuJour(date: string): CommandeModel | undefined {
    return this.mesCommandes.find(c => c.menu_detail?.date_menu === date
      && (c.statut === 'en_attente' || c.statut === 'retiree'));
  }

  etatJour(date: string): EtatJour {
    const c = this.commandeDuJour(date);
    if (c) return c.statut === 'retiree' ? 'retire' : 'commande';
    const menus = this.menusDuJour(date);
    if (!menus.length) return 'pas_de_menu';
    return menus.some(m => this.commandeOuverte(m)) ? 'a_reserver' : 'ferme';
  }

  texteJour(date: string): string {
    const c = this.commandeDuJour(date);
    switch (this.etatJour(date)) {
      case 'commande':   return `${c?.plat_detail?.nom ?? 'Plat'} commandé`;
      case 'retire':     return `${c?.plat_detail?.nom ?? 'Plat'} retiré`;
      case 'a_reserver': return 'Pas encore choisi';
      case 'ferme':      return 'Commandes fermées';
      default:           return date < this.iso(new Date()) ? 'Pas de menu' : 'Menu pas encore publié';
    }
  }

  tagJour(date: string): { texte: string; classe: string; icone?: string } {
    const etat = this.etatJour(date);
    const c = this.commandeDuJour(date);
    if (etat === 'commande' && c) {
      const menu = this.menusSemaine.find(m => m.id === c.menu_detail?.id) ?? c.menu_detail;
      return this.annulationOuverte(menu!)
        ? { texte: `Modifiable jusqu'au ${this.jourLimite(menu?.date_limite_annulation)}`, classe: 'ce-tag-ve' }
        : { texte: 'Confirmé', classe: 'ce-tag-gr', icone: 'ri-lock-line' };
    }
    if (etat === 'retire') return { texte: 'Servi', classe: 'ce-tag-bl', icone: 'ri-check-line' };
    if (etat === 'a_reserver') {
      const limite = this.limiteCommandeJour(date);
      return { texte: limite ? `Ouvert jusqu'au ${this.jourLimite(limite)}` : 'Ouvert', classe: 'ce-tag-ve', icone: 'ri-time-line' };
    }
    if (etat === 'ferme') return { texte: 'Fermé', classe: 'ce-tag-or', icone: 'ri-lock-line' };
    return { texte: '—', classe: 'ce-tag-gr' };
  }

  limiteAnnulationJour(date: string): string | undefined {
    return this.menusDuJour(date)[0]?.date_limite_annulation;
  }

  private limiteCommandeJour(date: string): string | undefined {
    return this.menusDuJour(date).find(m => this.commandeOuverte(m))?.date_limite_commande;
  }

  /** « dd/mm » du dernier jour où l'on peut agir (00:00 = minuit de la veille) */
  jourLimite(limite?: string): string {
    return this.libelleLimite(limite).split(' à ')[0];
  }

  /** Compte à rebours quand la fermeture approche (moins de 48 h) */
  compteARebours(limite?: string): string {
    if (!limite) return '';
    const reste = new Date(limite).getTime() - this.maintenant;
    if (reste <= 0 || reste > 48 * 3600000) return '';
    const h = Math.floor(reste / 3600000);
    const min = Math.floor((reste % 3600000) / 60000);
    return h > 0 ? `ferme dans ${h} h ${String(min).padStart(2, '0')}` : `ferme dans ${min} min`;
  }

  get jourSuivantAReserver(): string | null {
    // Le prochain jour encore ouvert après celui-ci, sinon un jour ouvert plus tôt dans la semaine
    return this.jours.find(j => j > this.jourSelectionne && this.etatJour(j) === 'a_reserver')
      ?? this.jours.find(j => j !== this.jourSelectionne && this.etatJour(j) === 'a_reserver') ?? null;
  }

  allerJourSuivant(): void {
    const j = this.jourSuivantAReserver;
    this.derniereCommande = null;
    if (j) {
      this.jourSelectionne = j;
    } else {
      const l = this.versDate(this.lundi);
      l.setDate(l.getDate() + 7);
      this.allerSemaine(this.iso(l));
    }
  }

  // ── Plats ────────────────────────────────────────────────────

  getPlats(menu: MenulistModel) {
    return menu.menu_plats?.map(mp => mp.plat).filter(Boolean) ?? [];
  }

  nbPlatsJour(date: string): number {
    return this.menusDuJour(date).reduce((n, m) => n + this.getPlats(m).length, 0);
  }

  getCommande(menuId: number, platId: number): CommandeModel | undefined {
    return this.mesCommandes.find(c => c.menu_detail?.id === menuId && c.plat_detail?.id === platId);
  }

  isPlatCommande(menuId: number, platId: number): boolean {
    return this.getCommande(menuId, platId)?.statut === 'en_attente';
  }

  isPlatAnnule(menuId: number, platId: number): boolean {
    return this.getCommande(menuId, platId)?.statut === 'annulee';
  }

  isPlatRetire(menuId: number, platId: number): boolean {
    return this.getCommande(menuId, platId)?.statut === 'retiree';
  }

  /** Une seule commande par jour : en_attente ou retirée bloque la date */
  aDejaCommandePourDate(dateMenu: string): boolean {
    return !!this.commandeDuJour(dateMenu);
  }

  commandeOuverte(menu: MenulistModel): boolean {
    return this.commandeService.commandeOuverte(menu);
  }

  annulationOuverte(menu: MenulistModel): boolean {
    return this.commandeService.annulationOuverte(menu);
  }

  libelleLimite(limite?: string): string {
    return this.commandeService.libelleLimite(limite);
  }

  note(plat: any): string {
    const n = plat?.note_moyenne;
    return n == null ? '' : String(n).replace('.', ',');
  }

  degrade(i: number): string {
    return DEGRADES[i % DEGRADES.length];
  }

  getImageUrl(plat: any): string | null {
    if (plat?.images?.length) {
      const img = plat.images.find((i: any) => i.is_principale) ?? plat.images[0];
      const url = img.url ?? img.image;
      return url.startsWith('http') ? url : `${this.imgBase}${url}`;
    }
    return null;
  }

  // ── Commander / annuler ──────────────────────────────────────

  /** « Choisir ce plat » : ouvre le choix du mode de paiement (compte repas / retenue) */
  commander(menu: MenulistModel, plat: any): void {
    this.ouvrirPaiement(menu, plat);
  }

  /** Changer le mode de paiement d'une commande en attente (jusqu'à la date limite) */
  changerMode(menu: MenulistModel, plat: any): void {
    const commande = this.getCommande(menu.id!, plat.id);
    if (commande) this.ouvrirPaiement(menu, plat, commande);
  }

  private ouvrirPaiement(menu: MenulistModel, plat: any, commande?: CommandeModel): void {
    this.paiement = { menu, plat, commande, chargement: true, mode: commande?.mode_paiement ?? 'retenue' };
    this.paiementModal?.show();
    this.commandeService.infoPaiement(menu.id!).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: info => {
        if (!this.paiement) return;
        this.paiement.info = info;
        this.paiement.chargement = false;
        if (!commande) this.paiement.mode = info.mode_par_defaut;
      },
      error: err => {
        if (!this.paiement) return;
        this.paiement.chargement = false;
        this.paiement.erreur = typeof err === 'string' ? err : 'Votre solde n\'a pas pu être chargé.';
      },
    });
  }

  /** Compte repas possible : solde suffisant (ou repas déjà payé par le compte) */
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
      this.enCours = { date: p.menu.date_menu, platNom: p.plat.nom };
      this.store.dispatch(createCommande({ payload: { menu_id: p.menu.id!, plat_id: p.plat.id, mode_paiement: p.mode } }));
    }
  }

  fermerPaiement(): void {
    this.paiementModal?.hide();
    this.paiement = null;
  }

  /** Mention sous le plat choisi : mode de paiement et montant débité */
  texteMode(c?: CommandeModel): string {
    if (!c?.mode_paiement) return '';
    if (c.paiement?.mode === 'compte') return `Payé par le compte repas · ${this.montant(c.paiement.montant)}`;
    if (c.paiement?.mode === 'caisse') return `Payé à la caisse · ${this.montant(c.paiement.montant)}`;
    return 'Retenue sur salaire (à la clôture du mois)';
  }

  montant(v?: number | null): string {
    if (v == null) return '—';
    // Espaces insécables : « 1 000 F » ne se coupe pas en fin de ligne
    return `${Math.round(v).toLocaleString('fr-FR').replace(/\u202f|\u00a0| /g, '\u00a0')}\u00a0F`;
  }

  demanderAnnulation(menuId: number, platId: number, platNom?: string, limite?: string): void {
    this.annulationEnCours = { menuId, platId, platNom: platNom ?? '', limite };
    this.annulationModal?.show();
  }

  /** Montant qui sera recrédité si la commande en cours d'annulation a été payée par le compte */
  get recreditAnnulation(): number | null {
    const a = this.annulationEnCours;
    const c = a ? this.getCommande(a.menuId, a.platId) : undefined;
    return c?.paiement && c.paiement.mode !== 'retenue' ? c.paiement.montant : null;
  }

  confirmerAnnulation(): void {
    const a = this.annulationEnCours;
    this.annulationModal?.hide();
    this.annulationEnCours = null;
    if (!a) return;
    const commande = this.getCommande(a.menuId, a.platId);
    if (!commande) return;
    this.derniereCommande = null;
    this.store.dispatch(resetCommandeError());
    this.store.dispatch(annulerCommande({ id: commande.id }));
  }

  dismissAlert(): void {
    this.store.dispatch(resetCommandeError());
  }

  changerFiltre(): void {
    this.derniereCommande = null;
    this.chargerMenus(this.jourSelectionne);
  }

  // ── Dates ────────────────────────────────────────────────────

  titreJour(date: string): string {
    const d = this.versDate(date);
    const j = JOURS[d.getDay()];
    return `${j.charAt(0).toUpperCase()}${j.slice(1)} ${d.getDate()} ${MOIS[d.getMonth()]}`;
  }

  jourCourt(date: string): string {
    const d = this.versDate(date);
    return `${JOURS_COURTS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  jourLong(date: string): string {
    const d = this.versDate(date);
    return `${JOURS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  estAujourdhui(date: string): boolean {
    return date === this.iso(new Date());
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
    const jour = (l.getDay() + 6) % 7;
    // Samedi / dimanche : la semaine qui vient
    l.setDate(l.getDate() - jour + (jour >= 5 ? 7 : 0));
    return this.iso(l);
  }
}
