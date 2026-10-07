// src/app/pages/cantine/retrait-commande/retrait-commande.component.ts

import { Component, OnInit, OnDestroy, DestroyRef, inject, ElementRef, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';

import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';
import { selectAllMenuWithoutPagination } from 'src/app/store/Menu/menu-selector';
import { fetchmenuNoPaginateData } from 'src/app/store/Menu/menu.action';
import { selectAllTypeequipeWithoutPagination } from 'src/app/store/Typeequipe/typeequipe-selector';
import { fetchtypeequipeNoPaginateData } from 'src/app/store/Typeequipe/typeequipe.action';

import {
  rechercheParBadge,
  resetRechercheParBadge,
  createRetrait,
  resetCommandeError,
} from 'src/app/store/Commande/commande.action';
import {
  selectRechercheParBadge,
  selectIsSearchingBadge,
  selectBadgeError,
  selectCommandeIsSubmitting,
  selectCommandeSuccess,
  selectCommandeError,
} from 'src/app/store/Commande/commande-selector';
import { RechercheParBadgeResult, CommandeModel } from 'src/app/store/Commande/commande.model';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-retrait-commande',
  templateUrl: './retrait-commande.component.html',
  styleUrl: './retrait-commande.component.scss',
})
export class RetraitCommandeComponent implements OnInit, OnDestroy {

  breadCrumbItems = [
    { label: 'Cantine', active: false },
    { label: 'Retrait', active: true },
  ];

  agences:     any[] = [];
  menus:       any[] = [];
  typeEquipes: any[] = [];

  resultatBadge:   RechercheParBadgeResult | null = null;
  isSearching    = false;
  isSubmitting   = false;
  badgeError:      string | null = null;
  error:           string | null = null;
  successMessage:  string | null = null;

  filterForm!: UntypedFormGroup;

  badgeInput     = '';
  selectedMenuId: number | null = null;

  imgBase = `${environment.apiUrl}`;

  @ViewChild('badgeField') badgeField?: ElementRef<HTMLInputElement>;

  private destroyRef = inject(DestroyRef);

  constructor(
    private store: Store,
    private fb: UntypedFormBuilder,
  ) {}

  ngOnInit(): void {
    const today = new Date().toISOString().split('T')[0];

    this.filterForm = this.fb.group({
      date_debut: [today],
      date_fin:   [today],
      agence:     [''],
      typeequipe: [''],
    });

    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.select(selectAllAgenceWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(a => this.agences = a ?? []);

    this.store.dispatch(fetchmenuNoPaginateData());
    this.store.select(selectAllMenuWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(m => this.menus = m ?? []);

    this.store.dispatch(fetchtypeequipeNoPaginateData());
    this.store.select(selectAllTypeequipeWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(t => this.typeEquipes = t ?? []);

    this.store.select(selectRechercheParBadge)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(r => {
        this.resultatBadge = r;
        if (r?.a_retire) {
          setTimeout(() => this.focusBadge(), 300);
        }
      });

    this.store.select(selectIsSearchingBadge)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.isSearching = v);

    this.store.select(selectBadgeError)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(e => this.badgeError = e);

    this.store.select(selectCommandeIsSubmitting)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.isSubmitting = v);

    this.store.select(selectCommandeError)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(e => this.error = e);

    this.store.select(selectCommandeSuccess)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(s => {
        this.successMessage = s;
        if (s) {
          setTimeout(() => {
            this.badgeInput = '';
            this.focusBadge();
          }, 1500);
        }
      });
  }

  ngOnDestroy(): void {
    this.store.dispatch(resetRechercheParBadge());
    this.store.dispatch(resetCommandeError());
  }

  // ── Menus filtrés ─────────────────────────────────────────

  get menusFiltres(): any[] {
    const { date_debut, date_fin, agence, typeequipe } = this.filterForm.value;
    return this.menus.filter(m => {
      if (date_debut && m.date_menu < date_debut)    return false;
      if (date_fin   && m.date_menu > date_fin)       return false;
      if (agence     && m.agence     !== +agence)     return false;
      if (typeequipe && m.typeequipe !== +typeequipe) return false;
      return true;
    });
  }

  selectionnerMenu(menuId: number): void {
    this.selectedMenuId = menuId;
    this.badgeInput     = '';
    this.store.dispatch(resetRechercheParBadge());
    setTimeout(() => this.focusBadge(), 200);
  }

  // ── Recherche par badge ───────────────────────────────────

  onBadgeKeyup(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.lancerRecherche();
    }
  }

  lancerRecherche(): void {
    const badge = this.badgeInput.trim();
    if (!badge || !this.selectedMenuId) return;
    this.store.dispatch(resetCommandeError());
    this.store.dispatch(rechercheParBadge({ badge, menuId: this.selectedMenuId }));
  }

  resetRecherche(): void {
    this.badgeInput = '';
    this.store.dispatch(resetRechercheParBadge());
    this.focusBadge();
  }

  // ── Retrait ───────────────────────────────────────────────

  confirmerRetrait(): void {
    if (!this.resultatBadge || !this.selectedMenuId) return;
    if (this.resultatBadge.a_retire) return;

    this.store.dispatch(createRetrait({
      userId:          this.resultatBadge.user_id,
      menuId:          this.selectedMenuId,
      badge_matricule: this.resultatBadge.badge,
    }));
  }

  // ── Helpers ───────────────────────────────────────────────

  focusBadge(): void {
    this.badgeField?.nativeElement?.focus();
  }

  formatDate(d: string): string {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  statutCss(statut: string): string {
    const map: Record<string, string> = {
      en_attente: 'bg-warning-subtle text-warning',
      retiree:    'bg-success-subtle text-success',
    };
    return map[statut] ?? 'bg-light';
  }

  statutLabel(statut: string): string {
    const map: Record<string, string> = {
      en_attente: 'À distribuer',
      retiree:    'Retiré',
    };
    return map[statut] ?? statut;
  }

  getPlatNom(c: CommandeModel): string {
    return c.plat_detail?.nom ?? '—';
  }

  getImageUrl(c: CommandeModel): string {
    const images = (c.plat_detail as any)?.images;
    if (images?.length) {
      const url = images[0].url ?? images[0].image;
      return url.startsWith('http') ? url : `${this.imgBase}${url}`;
    }
    return `https://placehold.co/60x60?text=?`;
  }

  getMenuSelectionne(): any {
    return this.menus.find(m => m.id === this.selectedMenuId);
  }

  dismissAlert(): void {
    this.store.dispatch(resetCommandeError());
  }

  /**
   * Commandes en attente uniquement — utilisé pour activer le bouton "Confirmer".
   * S'il n'y a plus de commande en_attente, le retrait n'a plus lieu d'être.
   */
  get commandesEnAttente(): CommandeModel[] {
    return this.resultatBadge?.commandes.filter(c => c.statut === 'en_attente') ?? [];
  }

  /**
   * Commandes affichées au gestionnaire : en_attente + retiree uniquement.
   * Les commandes annulées sont masquées car elles ne concernent pas la distribution.
   */
  get commandesAffichees(): CommandeModel[] {
    return this.resultatBadge?.commandes.filter(
      c => c.statut === 'en_attente' || c.statut === 'retiree'
    ) ?? [];
  }

  /** Nombre total de plats à distribuer (en_attente uniquement) */
  get nbPlatsADistribuer(): number {
    return this.commandesEnAttente.length;
  }
}
