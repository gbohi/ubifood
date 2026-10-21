// src/app/pages/cantine/mes-commandes/mes-commandes.component.ts

import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { environment } from 'src/environments/environment';

import {
  fetchMesCommandes,
  annulerCommande,
  resetCommandeError,
} from 'src/app/store/Commande/commande.action';
import {
  selectMesCommandes,
  selectCommandeIsLoading,
  selectCommandeIsSubmitting,
  selectCommandeError,
  selectCommandeSuccess,
} from 'src/app/store/Commande/commande-selector';
import { CommandeService } from 'src/app/core/services/commande/commande.service';
import { CommandeModel } from 'src/app/store/Commande/commande.model';
import { DatePipe, DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-mes-commandes',
  templateUrl: './mes-commandes.component.html',
  styleUrl: './mes-commandes.component.scss',
  providers: [DecimalPipe, DatePipe]
})
export class MesCommandesComponent implements OnInit {

  breadCrumbItems = [
    { label: 'Cantine', active: false },
    { label: 'Mes commandes', active: true },
  ];

  mesCommandes:      CommandeModel[] = [];
  commandesFiltrees: CommandeModel[] = [];

  isLoading    = false;
  isSubmitting = false;
  error:          string | null = null;
  successMessage: string | null = null;
  imgBase = `${environment.apiUrl}`;

  viewMode: 'table' | 'cards' = 'table';

  filterForm!: UntypedFormGroup;

  private destroyRef = inject(DestroyRef);

  constructor(
    private store: Store,
    private fb: UntypedFormBuilder,
    public commandeService: CommandeService,
  ) {}

  ngOnInit(): void {
    // Pas de filtre de date par défaut : les compteurs portent sur toutes les
    // commandes, la liste doit donc aussi toutes les montrer (y compris les
    // commandes en attente des jours passés), la plus récente en premier.
    this.filterForm = this.fb.group({
      statut:     [''],
      date_debut: [''],
      date_fin:   [''],
    });

    this.store.dispatch(fetchMesCommandes({}));

    this.store.select(selectMesCommandes)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(c => {
        this.mesCommandes = c ?? [];
        this.appliquerFiltres();
      });

    this.store.select(selectCommandeIsLoading)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.isLoading = v);

    this.store.select(selectCommandeIsSubmitting)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.isSubmitting = v);

    this.store.select(selectCommandeError)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(e => this.error = e);

    this.store.select(selectCommandeSuccess)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(s => this.successMessage = s);

    this.filterForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.appliquerFiltres());
  }

  // ── Filtrage ──────────────────────────────────────────────
  appliquerFiltres(): void {
    const { statut, date_debut, date_fin } = this.filterForm.value;
    this.commandesFiltrees = this.mesCommandes.filter(c => {
      const dateMenu = this.getDateMenu(c);
      if (statut     && c.statut !== statut)    return false;
      if (date_debut && dateMenu  < date_debut) return false;
      if (date_fin   && dateMenu  > date_fin)   return false;
      return true;
    }).sort((a, b) => this.getDateMenu(b).localeCompare(this.getDateMenu(a))
      || String(b.date_commande ?? '').localeCompare(String(a.date_commande ?? '')));
  }

  /** Pastilles de statut */
  choisirStatut(statut: string): void {
    this.filterForm.patchValue({ statut });
  }

  resetFilters(): void {
    this.filterForm.reset({ statut: '', date_debut: '', date_fin: '' });
  }

  // ── Annuler ───────────────────────────────────────────────
  annuler(commande: CommandeModel): void {
    if (!commande.id) return;
    this.store.dispatch(resetCommandeError());
    this.store.dispatch(annulerCommande({ id: commande.id }));
  }

  dismissAlert(): void {
    this.store.dispatch(resetCommandeError());
  }

  // ── Date limite d'annulation (paramétrée par l'administrateur) ──
  annulationOuverte(c: CommandeModel): boolean {
    return this.commandeService.annulationOuverte(c.menu_detail);
  }

  // ── Vue ───────────────────────────────────────────────────
  setViewMode(mode: 'table' | 'cards'): void {
    this.viewMode = mode;
  }

  // ── Helpers affichage ─────────────────────────────────────

  /**
   * Retourne la date du menu de façon sûre (jamais undefined).
   * Utilisé dans le template pour éviter TS2532 sur menu_detail?.date_menu.
   */
  getDateMenu(c: CommandeModel): string {
    return c.menu_detail?.date_menu ?? '';
  }

  formatDate(d: string): string {
    if (!d) return '';
    const date = d.includes('T') ? d.split('T')[0] : d;
    const [y, m, day] = date.split('-');
    return `${day}/${m}/${y}`;
  }

  getStatutBadgeClass(statut: string): string {
    switch (statut) {
      case 'en_attente': return 't-or';
      case 'annulee':    return 't-gr';
      case 'retiree':    return 't-ve';
      default:           return 't-gr';
    }
  }

  /** Mention « Annulée par X (gestionnaire) » si la commande a été annulée par un gestionnaire, sinon null */
  annulationGestionnaire(c: CommandeModel): string | null {
    if (c.statut !== 'annulee' || !c.annulee_par_gestionnaire) return null;
    const nom = (c.annulee_par_nom ?? '').trim();
    return nom ? `Annulée par ${nom} (gestionnaire)` : 'Annulée par un gestionnaire';
  }

  getStatutLabel(statut: string): string {
    switch (statut) {
      case 'en_attente': return 'En attente';
      case 'annulee':    return 'Annulée';
      case 'retiree':    return 'Retirée';
      default:           return statut;
    }
  }

  getStatutIcon(statut: string): string {
    switch (statut) {
      case 'en_attente': return 'ri-time-line';
      case 'annulee':    return 'ri-close-circle-line';
      case 'retiree':    return 'ri-checkbox-circle-line';
      default:           return 'ri-question-line';
    }
  }

  getImageUrl(commande: CommandeModel): string {
    const images = (commande.plat_detail as any)?.images;
    if (images?.length) {
      const url = images[0].url ?? images[0].image;
      return url.startsWith('http') ? url : `${this.imgBase}${url}`;
    }
    return 'assets/images/plat-sans-image.svg';
  }

  // ── Compteurs ─────────────────────────────────────────────
  get totalEnAttente(): number {
    return this.mesCommandes.filter(c => c.statut === 'en_attente').length;
  }

  get totalAnnulees(): number {
    return this.mesCommandes.filter(c => c.statut === 'annulee').length;
  }

  get totalRetirees(): number {
    return this.mesCommandes.filter(c => c.statut === 'retiree').length;
  }
}
