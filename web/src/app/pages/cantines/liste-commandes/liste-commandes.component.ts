// src/app/pages/cantine/liste-commandes/liste-commandes.component.ts

import { Component, OnInit, DestroyRef, inject, ViewChild } from '@angular/core';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { selectAllTypeequipeWithoutPagination } from 'src/app/store/Typeequipe/typeequipe-selector';
import { fetchtypeequipeNoPaginateData } from 'src/app/store/Typeequipe/typeequipe.action';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { environment } from 'src/environments/environment';

import { fetchmenuNoPaginateData } from 'src/app/store/Menu/menu.action';
import { selectAllMenuWithoutPagination, selectLoading as selectMenuLoading } from 'src/app/store/Menu/menu-selector';
import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';

import {
  fetchMesCommandes,
  createCommande,
  annulerCommande,
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
import { MenulistModel } from 'src/app/store/Menu/menu.model';
import { CommandeModel } from 'src/app/store/Commande/commande.model';
import { DatePipe, DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-liste-commandes',
  templateUrl: './liste-commandes.component.html',
  styleUrl: './liste-commandes.component.scss',
  providers: [DecimalPipe, DatePipe]
})
export class ListeCommandesComponent implements OnInit {
  // ── Breadcrumb ──────────────────────────────────────────────
  breadCrumbItems!: Array<{}>;

  

  menus:        MenulistModel[] = [];
  agences:      any[]           = [];
  equipes:      any[]           = [];
  annulationEnCours: { menuId: number; platId: number; platNom: string; limite?: string } | null = null;
  @ViewChild('annulationModal', { static: false }) annulationModal?: ModalDirective;
  mesCommandes: CommandeModel[] = [];

  isLoadingMenus     = false;
  isLoadingCommandes = false;
  isSubmitting       = false;
  error:          string | null = null;
  successMessage: string | null = null;
  imgBase = `${environment.apiUrl}`;

  filterForm!: UntypedFormGroup;

  private destroyRef = inject(DestroyRef);

  get isLoading(): boolean {
    return this.isLoadingMenus || this.isLoadingCommandes;
  }

  constructor(
    private store: Store,
    private fb: UntypedFormBuilder,
    public commandeService: CommandeService,
    private tokenStorage: TokenStorageService,
  ) {}

  ngOnInit(): void {
    this.breadCrumbItems = [
    { label: 'Cantine', active: false },
    { label: 'Commander', active: true },
  ];
    const today = new Date().toISOString().split('T')[0];
    this.filterForm = this.fb.group({
      date_debut: [today],
      date_fin:   [''],
      // Par défaut l'agence de l'utilisateur : il ne peut commander que ses menus
      agence:     [this.agenceUtilisateur() ?? ''],
      typeequipe: [''],
    });

    this.store.dispatch(fetchtypeequipeNoPaginateData());
    this.store.select(selectAllTypeequipeWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(e => this.equipes = e ?? []);

    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.select(selectAllAgenceWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(a => this.agences = a ?? []);

    this.store.dispatch(fetchmenuNoPaginateData());
    this.store.select(selectAllMenuWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(m => this.menus = m ?? []);

    this.store.select(selectMenuLoading)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.isLoadingMenus = v);

    this.store.dispatch(fetchMesCommandes({}));
    this.store.select(selectMesCommandes)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(c => this.mesCommandes = c);

    this.store.select(selectCommandeIsLoading)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.isLoadingCommandes = v);

    this.store.select(selectCommandeIsSubmitting)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.isSubmitting = v);

    this.store.select(selectCommandeError)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(e => this.error = e);

    this.store.select(selectCommandeSuccess)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(s => this.successMessage = s);
  }

  /** Agence de rattachement en cours de l'utilisateur connecté (fiche /users/me/) */
  private agenceUtilisateur(): number | null {
    const today = new Date().toISOString().split('T')[0];
    const lignes: any[] = this.tokenStorage.getUser()?.user_agences ?? [];
    const active = lignes.find(l =>
      String(l.date_debut).slice(0, 10) <= today && (!l.date_fin || String(l.date_fin).slice(0, 10) >= today));
    const id = active?.agence_id ?? active?.agence;
    return id ? Number(id) : null;
  }

  // ── Filtrage des menus ───────────────────────────────────
  get menusFiltres(): MenulistModel[] {
    const { date_debut, date_fin, agence, typeequipe } = this.filterForm.value;
    return this.menus.filter(m => {
      if (date_debut && m.date_menu < date_debut) return false;
      if (date_fin   && m.date_menu > date_fin)   return false;
      if (agence     && m.agence !== +agence)      return false;
      if (typeequipe && m.typeequipe !== +typeequipe) return false;
      return true;
    }).sort((a, b) => (a.date_menu ?? '').localeCompare(b.date_menu ?? ''));
  }

  // ── Plats du menu ────────────────────────────────────────
  getPlats(menu: MenulistModel) {
    return menu.menu_plats?.map(mp => mp.plat).filter(Boolean) ?? [];
  }

  // ── Commande existante pour un plat/menu ─────────────────
  getCommande(menuId: number, platId: number): CommandeModel | undefined {
    return this.mesCommandes.find(
      c => c.menu_detail?.id === menuId && c.plat_detail?.id === platId
    );
  }

  isPlatCommande(menuId: number, platId: number): boolean {
    const c = this.getCommande(menuId, platId);
    return !!c && c.statut === 'en_attente';
  }

  isPlatAnnule(menuId: number, platId: number): boolean {
    const c = this.getCommande(menuId, platId);
    return !!c && c.statut === 'annulee';
  }

  /** Plat retiré — repas déjà distribué, aucune action possible */
  isPlatRetire(menuId: number, platId: number): boolean {
    const c = this.getCommande(menuId, platId);
    return !!c && c.statut === 'retiree';
  }

  // ── Règle 1 commande par jour ─────────────────────────────

  /**
   * Bloque si l'agent a déjà une commande en_attente OU retiree ce jour.
   * Seule une commande annulée libère la date.
   */
  aDejaCommandePourDate(dateMenu: string): boolean {
    return this.mesCommandes.some(
      c => c.menu_detail?.date_menu === dateMenu &&
          (c.statut === 'en_attente' || c.statut === 'retiree')
    );
  }

  aDejaCommandeDansCeMenu(menuId: number): boolean {
    return this.mesCommandes.some(
      c => c.menu_detail?.id === menuId &&
          (c.statut === 'en_attente' || c.statut === 'retiree')
    );
  }

  /**
   * Bloque un plat si l'agent a commandé (en_attente ou retiree) ailleurs ce jour.
   * N'exclut que le même plat/menu pour ne pas bloquer "Commander à nouveau".
   */
  isPlatBloquePourDate(dateMenu: string, menuId: number, platId: number): boolean {
    return this.mesCommandes.some(
      c => c.menu_detail?.date_menu === dateMenu
        && (c.statut === 'en_attente' || c.statut === 'retiree')
        && !(c.menu_detail?.id === menuId && c.plat_detail?.id === platId)
    );
  }

  // ── Dates limites (paramétrées par l'administrateur) ─────
  commandeOuverte(menu: MenulistModel): boolean {
    return this.commandeService.commandeOuverte(menu);
  }

  libelleLimite(limite?: string): string {
    return this.commandeService.libelleLimite(limite);
  }

  annulationOuverte(menu: MenulistModel): boolean {
    return this.commandeService.annulationOuverte(menu);
  }

  // ── Commander un plat ────────────────────────────────────
  commander(menuId: number, platId: number): void {
    this.store.dispatch(resetCommandeError());
    this.store.dispatch(createCommande({ payload: { menu_id: menuId, plat_id: platId } }));
  }

  // ── Annuler une commande (après confirmation) ─────────────
  demanderAnnulation(menuId: number, platId: number, platNom?: string, limite?: string): void {
    this.annulationEnCours = { menuId, platId, platNom: platNom ?? '', limite };
    this.annulationModal?.show();
  }

  confirmerAnnulation(): void {
    const a = this.annulationEnCours;
    this.annulationModal?.hide();
    this.annulationEnCours = null;
    if (!a) return;
    const commande = this.getCommande(a.menuId, a.platId);
    if (!commande) return;
    this.store.dispatch(resetCommandeError());
    this.store.dispatch(annulerCommande({ id: commande.id }));
  }

  dismissAlert(): void {
    this.store.dispatch(resetCommandeError());
  }

  // ── Helpers affichage ─────────────────────────────────────
  formatDate(d: string): string {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  resetFilters(): void {
    const today = new Date().toISOString().split('T')[0];
    this.filterForm.reset({ date_debut: today, date_fin: '', agence: this.agenceUtilisateur() ?? '', typeequipe: '' });
  }

  /** Vérifie si l'agent a au moins un plat retiré dans ce menu */
  aUnPlatRetireDansCeMenu(menuId: number): boolean {
    return this.mesCommandes.some(
      c => c.menu_detail?.id === menuId && c.statut === 'retiree'
    );
  }

  getImageUrl(plat: any): string {
    if (plat?.images?.length) {
      const url = plat.images[0].url ?? plat.images[0].image;
      return url.startsWith('http') ? url : `${this.imgBase}${url}`;
    }
    return 'assets/images/plat-sans-image.svg';
  }
}
