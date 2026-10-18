// src/app/pages/categoriesalarie/categoriesalarie.component.ts

import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe, DatePipe } from '@angular/common';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { Actions, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';
import { Observable, Subject, concat, of } from 'rxjs';
import {
  catchError, debounceTime, distinctUntilChanged, filter, map,
  switchMap, take, takeUntil, toArray,
} from 'rxjs/operators';

// ── Categoriesalarie store ─────────────────────────────────────
import {
  deletecategoriesalarieData,
  deletecategoriesalarieFailure,
  deletecategoriesalarieSuccess,
  deletemultiplecategoriesalarieData,
  deletemultiplecategoriesalarieFailure,
  deletemultiplecategoriesalarieSuccess,
  fetchcategoriesalarieData,
} from 'src/app/store/Categoriesalarie/categoriesalarie.action';
import {
  selectcategoriesalarieData,
  selectTotalItems,
  selectLoading,
  selectCurrentPage,
} from 'src/app/store/Categoriesalarie/categoriesalarie-selector';
import { CategoriesalarieService } from 'src/app/core/services/categoriesalarie/categoriesalarie.service';

// ── Statut store ───────────────────────────────────────────────
import { selectAllSatutWithoutPagination } from 'src/app/store/Statut/statut-selector';
import { fetchstatutNoPaginateData } from 'src/app/store/Statut/statut.action';

// ── PlatCategoriesalarie store ────────────────────────────────
import * as PlatCategoriesalarieActions from 'src/app/store/PlatCategoriesalarie/plat-categoriesalarie.action';
import { selectPlatCategoriesalarieIsLoading } from 'src/app/store/PlatCategoriesalarie/plat-categoriesalarie-selector';
import { PlatCategoriesalarieModel } from 'src/app/store/PlatCategoriesalarie/plat-categoriesalarie.model';
import { PlatCategoriesalarieService } from 'src/app/core/services/plat-categoriesalarie/plat-categoriesalarie.service';

@Component({
  selector: 'app-categoriesalarie',
  templateUrl: './categoriesalarie.component.html',
  styleUrl: './categoriesalarie.component.scss',
  providers: [DecimalPipe, DatePipe],
})
export class CategoriesalarieComponent implements OnInit, AfterViewInit {

  breadCrumbItems = [
    { label: 'Catégorie salarié', active: false },
    { label: 'Liste', active: true },
  ];

  // ── Categoriesalarie ──────────────────────────────────────
  categoriesalaries:    any[] = [];
  statuts:              any[] = [];
  totalItems  = 0;
  currentPage = 1;
  isLoading   = true;

  categoriesalarieForm!: UntypedFormGroup;
  submitted      = false;
  isSaving       = false;
  masterSelected = false;
  term: any;
  checkedValGet:             any[] = [];
  selectedCategoriesalarie:  any   = null;
  deleteID: any;
  direction = 'asc';

  modalTitle = 'Ajouter une catégorie salarié';
  modalBtn   = 'Enregistrer';

  // ── PlatCategoriesalarie ──────────────────────────────────
  isTarifsLoading           = false;
  currentCategoriesalarieId: number | null = null;
  tarifLignes:               PlatCategoriesalarieModel[] = [];

  private destroyRef = inject(DestroyRef);
  private search$          = new Subject<string>();
  private annulerChargement$ = new Subject<void>();
  private lastActiveElement: HTMLElement | null = null;

  @ViewChild('addCategoriesalarie',  { static: false }) addCategoriesalarie?:  ModalDirective;
  @ViewChild('deleteRecordModal',    { static: false }) deleteRecordModal?:    ModalDirective;
  @ViewChild('viewCategoriesalarie', { static: false }) viewCategoriesalarie?: ModalDirective;
  @ViewChild('mainContainer',        { static: false }) mainContainer?:        ElementRef;

  constructor(
    private fb: UntypedFormBuilder,
    private toastService: ToastrService,
    private store: Store,
    private actions$: Actions,
    private categoriesalarieService: CategoriesalarieService,
    private platCategoriesalarieService: PlatCategoriesalarieService,
  ) {}

  ngOnInit(): void {
    this.categoriesalarieForm = this.fb.group({
      id:      [''],
      libelle: ['', [Validators.required]],
    });

    // ── Categoriesalarie selectors ─────────────────────────
    this.store.select(selectLoading)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.isLoading = v);

    this.store.select(selectTotalItems)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.totalItems = v ?? 0);

    this.store.select(selectCurrentPage)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.currentPage = v ?? 1);

    this.store.select(selectcategoriesalarieData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => {
        if (data) {
          this.categoriesalaries = data.map(item => ({ ...item, state: false }));
          // Nouvelle page / nouveau résultat : la sélection précédente n'a plus de sens
          this.masterSelected = false;
          this.checkedValGet  = [];
        }
      });

    // ── Statuts ────────────────────────────────────────────
    this.store.dispatch(fetchstatutNoPaginateData());
    this.store.select(selectAllSatutWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => this.statuts = data ?? []);

    // ── PlatCategoriesalarie ───────────────────────────────
    this.store.select(selectPlatCategoriesalarieIsLoading)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.isTarifsLoading = v);

    // ── Recherche serveur (?search=), temporisée ───────────
    this.search$.pipe(
      map(t => (t ?? '').trim()),
      debounceTime(350),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.loadData(1));

    // ── Retour serveur des suppressions ────────────────────
    this.actions$.pipe(
      ofType(deletecategoriesalarieSuccess, deletemultiplecategoriesalarieSuccess),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(a => this.toastService.success(
      a.type === deletecategoriesalarieSuccess.type
        ? 'Catégorie salarié supprimée avec succès !'
        : 'Catégories salariés supprimées avec succès !', 'Succès'));

    this.actions$.pipe(
      ofType(deletecategoriesalarieFailure, deletemultiplecategoriesalarieFailure),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ error }) => {
      this.toastService.error(error || 'Suppression impossible.', 'Erreur', { timeOut: 10000 });
      this.loadData(this.currentPage);
    });

    this.loadData(1);
  }

  ngAfterViewInit(): void {
    this.addCategoriesalarie?.onHidden
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.annulerChargement$.next();
        this.categoriesalarieForm.reset();
        this.tarifLignes               = [];
        this.currentCategoriesalarieId = null;
        this.submitted                 = false;
        this.store.dispatch(PlatCategoriesalarieActions.resetPlatCategoriesalarie());
        this.modalTitle = 'Ajouter une catégorie salarié';
        this.modalBtn   = 'Enregistrer';
      });

    this.deleteRecordModal?.onHidden
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.deleteID = null);
  }

  loadData(page: number = 1): void {
    this.store.dispatch(fetchcategoriesalarieData({ page, search: (this.term ?? '').trim() }));
  }

  private mapTarifsToLignes(tarifs: PlatCategoriesalarieModel[]): PlatCategoriesalarieModel[] {
    return tarifs.map(t => ({
      ...t,
      date_debut: t.date_debut ? t.date_debut.split('T')[0] : '',
      date_fin:   t.date_fin   ? t.date_fin.split('T')[0]   : '',
      _isNew:     false,
      _isDeleted: false,
      _hasError:  false,
    }));
  }

  /**
   * Charge les tarifs de la catégorie `id`. Le store est vidé avant, et seule
   * la réponse (succès ou échec) correspondant à CET id est prise en compte :
   * jamais les tarifs de la fiche ouverte précédemment. Une liste vide est valide.
   */
  private chargerTarifs(id: number): void {
    this.annulerChargement$.next();
    this.tarifLignes = [];
    this.store.dispatch(PlatCategoriesalarieActions.resetPlatCategoriesalarie());

    this.actions$.pipe(
      ofType(
        PlatCategoriesalarieActions.fetchPlatCategoriesalarieSuccess,
        PlatCategoriesalarieActions.fetchPlatCategoriesalarieFailure,
      ),
      filter(a => a.categoriesalarieId === id),
      take(1),
      takeUntil(this.annulerChargement$),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(a => {
      if ('tarifs' in a) {
        this.tarifLignes = this.mapTarifsToLignes(a.tarifs ?? []);
      } else {
        this.toastService.error(a.error || 'Erreur lors du chargement des tarifs.', 'Erreur');
      }
    });

    this.store.dispatch(PlatCategoriesalarieActions.fetchPlatCategoriesalarie({ categoriesalarieId: id }));
  }

  // ── Modal Ajouter ─────────────────────────────────────────
  openAddModal(): void {
    this.lastActiveElement         = document.activeElement as HTMLElement;
    this.annulerChargement$.next();
    this.currentCategoriesalarieId = null;
    this.tarifLignes               = [];
    this.submitted                 = false;
    this.categoriesalarieForm.reset();
    this.store.dispatch(PlatCategoriesalarieActions.resetPlatCategoriesalarie());
    this.modalTitle = 'Ajouter une catégorie salarié';
    this.modalBtn   = 'Enregistrer';
    this.addCategoriesalarie?.show();
  }

  /** « Fermer » : abandonne toutes les modifications (y compris les suppressions de lignes) */
  closeAddModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => this.addCategoriesalarie?.hide(), 10);
  }

  // ── Modal Édition ─────────────────────────────────────────
  editList(id: any): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    const editData         = this.categoriesalaries.find(p => p.id === id);
    if (!editData) return;

    this.currentCategoriesalarieId = id;
    this.submitted                 = false;
    this.categoriesalarieForm.reset();
    this.categoriesalarieForm.patchValue({ id: editData.id, libelle: editData.libelle });

    this.chargerTarifs(id);

    this.modalTitle = 'Modifier la catégorie salarié';
    this.modalBtn   = 'Enregistrer';
    this.addCategoriesalarie?.show();
  }

  // ── Gestion lignes PlatCategoriesalarie ───────────────────
  ajouterLigneTarif(): void {
    this.tarifLignes.push({
      montant: undefined, date_debut: '', date_fin: null,
      statut: undefined, _isNew: true, _isDeleted: false, _hasError: false,
    });
  }

  /** Une ligne existante est seulement marquée : la suppression part sur « Enregistrer » */
  supprimerLigneTarif(index: number): void {
    const ligne = this.tarifLignes[index];
    if (!ligne) return;
    if (ligne._isNew || !ligne.id) {
      this.tarifLignes.splice(index, 1);
    } else {
      ligne._isDeleted = true;
    }
  }

  montantInvalide(l: PlatCategoriesalarieModel): boolean {
    return l.montant == null || (l.montant as any) === '' || Number(l.montant) < 0;
  }

  private validerTarifs(): boolean {
    let valid = true;
    this.tarifLignes.filter(l => !l._isDeleted).forEach(l => {
      const hasError = this.montantInvalide(l) || !l.date_debut ||
        l.statut == null || (l.statut as any) === '' || (l.statut as any) === 'undefined' ||
        (!!l.date_fin && !!l.date_debut && l.date_fin < l.date_debut);
      l._hasError = hasError;
      if (hasError) valid = false;
    });
    return valid;
  }

  // ── Sauvegarde ────────────────────────────────────────────
  /**
   * 1. Enregistre la catégorie (création ou modification) ; en cas de refus
   *    (libellé vide / déjà utilisé…), message du serveur et fenêtre ouverte ;
   * 2. puis les tarifs, une requête après l'autre : suppressions, modifications
   *    (ex. clôturer l'ancien tarif), créations — sinon le serveur refuse le
   *    chevauchement des périodes. Les lignes refusées sont listées.
   */
  saveProperty(): void {
    this.submitted = true;
    if (this.isSaving) return;

    if (this.categoriesalarieForm.invalid) {
      this.toastService.error('Veuillez vérifier les informations saisies.', 'Erreur');
      return;
    }
    if (!this.validerTarifs()) {
      this.toastService.error('Veuillez corriger les erreurs dans le tableau des tarifs.', 'Erreur');
      return;
    }

    const formValue = { ...this.categoriesalarieForm.value };
    const creation  = !formValue.id;
    if (creation) delete formValue.id;

    this.isSaving = true;
    const fiche$: Observable<any> = creation
      ? this.categoriesalarieService.createCategoriesalarie(formValue)
      : this.categoriesalarieService.updateCategoriesalarie(formValue);

    fiche$.pipe(
      switchMap(cat => this.enregistrerTarifs(cat?.id ?? formValue.id)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: erreurs => {
        this.isSaving = false;
        if (erreurs.length) {
          this.toastService.warning(
            `Catégorie enregistrée, mais des tarifs ont été refusés : ${erreurs.join(' ; ')}`,
            'Attention', { timeOut: 10000 });
        } else {
          this.toastService.success(
            creation ? 'Catégorie salarié ajoutée avec succès !' : 'Catégorie salarié mise à jour avec succès !',
            'Succès');
        }
        this.submitted = false;
        this.closeAddModal();
        this.loadData(creation ? 1 : this.currentPage);
      },
      error: err => {
        this.isSaving = false;
        this.toastService.error(typeof err === 'string' ? err : 'Enregistrement impossible.', 'Erreur');
      },
    });
  }

  /** Enregistre les tarifs séquentiellement ; renvoie les messages d'erreur */
  private enregistrerTarifs(categoriesalarieId: number): Observable<string[]> {
    const erreurs: string[] = [];
    const libelle = (l: PlatCategoriesalarieModel) =>
      `${l.montant} FCFA du ${this.formatDate(l.date_debut!)}${l.date_fin ? ' au ' + this.formatDate(l.date_fin) : ''}`;
    const appel = (obs: Observable<any>, l: PlatCategoriesalarieModel, quoi: string) => obs.pipe(
      catchError(err => {
        erreurs.push(`${quoi} ${libelle(l)} : ${typeof err === 'string' ? err : 'refusé'}`);
        return of(null);
      }));
    const donnees = (l: PlatCategoriesalarieModel) => ({
      categoriesalarie: categoriesalarieId,
      montant:          Number(l.montant),
      date_debut:       l.date_debut,
      date_fin:         l.date_fin || null,
      statut:           Number(l.statut),
    });

    const L = this.tarifLignes;
    const operations: Observable<any>[] = [
      ...L.filter(l => l._isDeleted && l.id)
          .map(l => appel(this.platCategoriesalarieService.delete(l.id!), l, 'Suppression du tarif')),
      ...L.filter(l => !l._isNew && !l._isDeleted && l.id)
          .map(l => appel(this.platCategoriesalarieService.update(l.id!, donnees(l)), l, 'Tarif')),
      ...L.filter(l => l._isNew && !l._isDeleted)
          .map(l => appel(this.platCategoriesalarieService.create(donnees(l)), l, 'Nouveau tarif')),
    ];
    if (!operations.length) return of([]);
    return concat(...operations).pipe(toArray(), map(() => erreurs));
  }

  // ── Getters ───────────────────────────────────────────────
  get tarifLignesVisibles(): PlatCategoriesalarieModel[] {
    return this.tarifLignes.filter(l => !l._isDeleted);
  }

  // ── Modal Suppression ─────────────────────────────────────
  removeItem(id: any): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.deleteID = id;
    this.deleteRecordModal?.show();
  }

  closeDeleteModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => this.deleteRecordModal?.hide(), 10);
  }

  /** Le message (succès ou refus du serveur, ex. catégorie encore utilisée) arrive par les actions */
  confirmDelete(id?: any): void {
    if (id) {
      this.store.dispatch(deletecategoriesalarieData({ id: id.toString() }));
      this.afterDeleteActions();
      return;
    }
    if (this.checkedValGet?.length > 0) {
      this.store.dispatch(deletemultiplecategoriesalarieData({ id: this.checkedValGet.join(',') }));
      this.afterDeleteActions();
      return;
    }
    this.toastService.error('Aucune catégorie salarié sélectionnée.', 'Erreur');
    this.closeDeleteModal();
  }

  private afterDeleteActions(): void {
    this.closeDeleteModal();
    this.masterSelected = false;
    this.deleteID       = null;
    this.checkedValGet  = [];
  }

  // ── Modal Détails ─────────────────────────────────────────
  viewDetails(id: any): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    const data = this.categoriesalaries.find(p => p.id === id);
    if (data) {
      this.selectedCategoriesalarie = data;
      this.chargerTarifs(id);
      this.viewCategoriesalarie?.show();
    } else {
      this.toastService.error('Catégorie salarié introuvable', 'Erreur');
    }
  }

  closeViewModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => {
      this.viewCategoriesalarie?.hide();
      this.annulerChargement$.next();
      this.selectedCategoriesalarie = null;
      this.tarifLignes              = [];
      this.store.dispatch(PlatCategoriesalarieActions.resetPlatCategoriesalarie());
    }, 10);
  }

  // ── Helpers ───────────────────────────────────────────────
  getStatutLibelle(statutId: number): string {
    return this.statuts.find(s => s.id === Number(statutId))?.libelle_statut ?? '—';
  }

  formatDate(d: string): string {
    if (!d) return '—';
    const date = d.includes('T') ? d.split('T')[0] : d;
    const [y, m, day] = date.split('-');
    return `${day}/${m}/${y}`;
  }

  checkUncheckAll(ev: any): void {
    this.categoriesalaries.forEach(x => x.state = ev.target.checked);
    this.masterSelected = ev.target.checked;
    this.updateCheckedValues();
  }

  onCheckboxChange(): void {
    this.updateCheckedValues();
  }

  private updateCheckedValues(): void {
    this.checkedValGet = this.categoriesalaries
      .filter(f => f.state === true)
      .map(f => f.id);
  }

  onSort(column: string): void {
    this.direction = this.direction === 'asc' ? 'desc' : 'asc';
    this.categoriesalaries = [...this.categoriesalaries].sort((a, b) => {
      const res = this.compare(a[column], b[column]);
      return this.direction === 'asc' ? res : -res;
    });
  }

  compare(v1: string | number, v2: string | number): number {
    return v1 < v2 ? -1 : v1 > v2 ? 1 : 0;
  }

  /** Recherche côté serveur (tout le référentiel, pas seulement la page affichée) */
  filterdata(): void {
    this.search$.next(this.term ?? '');
  }

  pageChanged(event: PageChangedEvent): void {
    this.loadData(event.page);
  }
}
