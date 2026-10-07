// src/app/pages/categoriesalarie/categoriesalarie.component.ts

import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { Actions, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';
import { Subject } from 'rxjs';
import { filter, take, takeUntil } from 'rxjs/operators';

// ── Categoriesalarie store ─────────────────────────────────────
import {
  addcategoriesalarieData,
  addcategoriesalarieDataSuccess,
  deletecategoriesalarieData,
  deletemultiplecategoriesalarieData,
  fetchcategoriesalarieData,
  updatecategoriesalarieData,
} from 'src/app/store/Categoriesalarie/categoriesalarie.action';
import {
  selectcategoriesalarieData,
  selectTotalItems,
  selectLoading,
  selectCurrentPage,
} from 'src/app/store/Categoriesalarie/categoriesalarie-selector';

// ── Statut store ───────────────────────────────────────────────
import { selectAllSatutWithoutPagination } from 'src/app/store/Statut/statut-selector';
import { fetchstatutNoPaginateData } from 'src/app/store/Statut/statut.action';

// ── PlatCategoriesalarie store ────────────────────────────────
import * as PlatCategoriesalarieActions from 'src/app/store/PlatCategoriesalarie/plat-categoriesalarie.action';
import {
  selectPlatCategoriesalarieTarifs,
  selectPlatCategoriesalarieIsLoading,
  selectPlatCategoriesalarieIsSubmitting,
} from 'src/app/store/PlatCategoriesalarie/plat-categoriesalarie-selector';
import { PlatCategoriesalarieModel } from 'src/app/store/PlatCategoriesalarie/plat-categoriesalarie.model';

@Component({
  selector: 'app-categoriesalarie',
  templateUrl: './categoriesalarie.component.html',
  styleUrl: './categoriesalarie.component.scss',
  providers: [DecimalPipe, DatePipe],
})
export class CategoriesalarieComponent implements OnInit, AfterViewInit, OnDestroy {

  breadCrumbItems = [
    { label: 'Catégorie salarié', active: false },
    { label: 'Liste', active: true },
  ];

  // ── Categoriesalarie ──────────────────────────────────────
  categoriesalaries:    any[] = [];
  categoriesalarieList: any[] = [];
  statuts:              any[] = [];
  totalItems  = 0;
  currentPage = 1;
  isLoading   = true;

  categoriesalarieForm!: UntypedFormGroup;
  submitted      = false;
  masterSelected = false;
  term: any;
  checkedValGet:             any[] = [];
  selectedCategoriesalarie:  any   = null;
  deleteID: any;
  direction = 'asc';

  // ── PlatCategoriesalarie ──────────────────────────────────
  isTarifsLoading           = false;
  isTarifsSubmitting        = false;
  currentCategoriesalarieId: number | null = null;
  tarifLignes:               PlatCategoriesalarieModel[] = [];
  private tarifLignesSnapshot: PlatCategoriesalarieModel[] = [];

  private destroy$ = new Subject<void>();
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
  ) {}

  ngOnInit(): void {
    this.categoriesalarieForm = this.fb.group({
      id:      [''],
      libelle: ['', [Validators.required]],
    });

    // ── Categoriesalarie selectors ─────────────────────────
    this.store.select(selectLoading)
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => this.isLoading = v);

    this.store.select(selectTotalItems)
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => this.totalItems = v ?? 0);

    this.store.select(selectCurrentPage)
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => this.currentPage = v ?? 1);

    this.store.select(selectcategoriesalarieData)
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        if (data) {
          this.categoriesalaries    = data.map(item => ({ ...item, state: false }));
          this.categoriesalarieList = [...this.categoriesalaries];
          this.updateNoResultDisplay();
        }
      });

    // ── Statuts ────────────────────────────────────────────
    this.store.dispatch(fetchstatutNoPaginateData());
    this.store.select(selectAllSatutWithoutPagination)
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => this.statuts = data ?? []);

    // ── PlatCategoriesalarie selectors ─────────────────────
    this.store.select(selectPlatCategoriesalarieIsLoading)
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => this.isTarifsLoading = v);

    this.store.select(selectPlatCategoriesalarieIsSubmitting)
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => this.isTarifsSubmitting = v);

    // ── SOLUTION 2 — Batch après création ─────────────────
    this.actions$.pipe(
      ofType(addcategoriesalarieDataSuccess),
      takeUntil(this.destroy$)
    ).subscribe(({ newData }) => {
      const tarifsACreer = this.tarifLignesSnapshot.filter(l => !l._isDeleted);
      if (newData?.id && tarifsACreer.length > 0) {
        this.store.dispatch(PlatCategoriesalarieActions.savePlatCategoriesalariesBatch({
          categoriesalarieId: newData.id,
          tarifs: tarifsACreer.map(l => ({
            montant:    l.montant,
            date_debut: l.date_debut,
            date_fin:   l.date_fin || null,
            statut:     l.statut,
          })),
        }));
      }
      this.tarifLignesSnapshot = [];
    });

    this.loadData(1);
  }

  ngAfterViewInit(): void {
    this.addCategoriesalarie?.onHidden.subscribe(() => {
      this.categoriesalarieForm.reset();
      this.tarifLignes               = [];
      this.currentCategoriesalarieId = null;
      this.submitted                 = false;
      this.store.dispatch(PlatCategoriesalarieActions.resetPlatCategoriesalarie());
      this.setModalTitle('Ajouter une catégorie salarié');
      this.setModalBtn('Enregistrer');
    });

    this.deleteRecordModal?.onHidden.subscribe(() => {
      this.deleteID = null;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadData(page: number = 1): void {
    this.store.dispatch(fetchcategoriesalarieData({ page }));
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

  // ── Modal Ajouter ─────────────────────────────────────────
  openAddModal(): void {
    this.lastActiveElement         = document.activeElement as HTMLElement;
    this.currentCategoriesalarieId = null;
    this.tarifLignes               = [];
    this.tarifLignesSnapshot       = [];
    this.submitted                 = false;
    this.categoriesalarieForm.reset();
    this.store.dispatch(PlatCategoriesalarieActions.resetPlatCategoriesalarie());
    this.setModalTitle('Ajouter une catégorie salarié');
    this.setModalBtn('Enregistrer');
    this.addCategoriesalarie?.show();
  }

  closeAddModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => {
      this.addCategoriesalarie?.hide();
      this.setModalTitle('Ajouter une catégorie salarié');
      this.setModalBtn('Enregistrer');
    }, 10);
  }

  // ── Modal Édition ─────────────────────────────────────────
  editList(id: any): void {
    this.lastActiveElement         = document.activeElement as HTMLElement;
    const editData                 = this.categoriesalaries.find(p => p.id === id);
    if (!editData) return;

    this.currentCategoriesalarieId = id;
    this.tarifLignesSnapshot       = [];
    this.tarifLignes               = [];
    this.submitted                 = false;

    this.categoriesalarieForm.patchValue(editData);

    // Charger les tarifs
    this.store.dispatch(PlatCategoriesalarieActions.fetchPlatCategoriesalarie({
      categoriesalarieId: id
    }));
    this.store.select(selectPlatCategoriesalarieTarifs).pipe(
      filter(tarifs => tarifs.length > 0),
      take(1)
    ).subscribe(tarifs => {
      this.tarifLignes = this.mapTarifsToLignes(tarifs);
    });

    this.setModalTitle('Modifier la catégorie salarié');
    this.setModalBtn('Enregistrer');
    this.addCategoriesalarie?.show();
  }

  // ── Gestion lignes PlatCategoriesalarie ───────────────────
  ajouterLigneTarif(): void {
    this.tarifLignes.push({
      montant: undefined, date_debut: '', date_fin: null,
      statut: undefined, _isNew: true, _isDeleted: false, _hasError: false,
    });
  }

  supprimerLigneTarif(index: number): void {
    const ligne = this.tarifLignes[index];
    if (ligne._isNew) {
      this.tarifLignes.splice(index, 1);
    } else if (ligne.id) {
      this.store.dispatch(PlatCategoriesalarieActions.deletePlatCategoriesalarie({ id: ligne.id }));
      this.tarifLignes.splice(index, 1);
    }
  }

  private validerTarifs(): boolean {
    let valid = true;
    this.tarifLignes.filter(l => !l._isDeleted).forEach(l => {
      const hasError = !l.montant || !l.date_debut || !l.statut ||
        (!!l.date_fin && !!l.date_debut && l.date_fin < l.date_debut);
      l._hasError = hasError;
      if (hasError) valid = false;
    });
    return valid;
  }

  // ── Sauvegarde ────────────────────────────────────────────
  saveProperty(): void {
    this.submitted = true;

    if (this.categoriesalarieForm.invalid) {
      this.toastService.error('Veuillez vérifier les informations saisies.', 'Erreur');
      return;
    }
    if (!this.validerTarifs()) {
      this.toastService.error('Veuillez corriger les erreurs dans le tableau des tarifs.', 'Erreur');
      return;
    }

    const formValue = { ...this.categoriesalarieForm.value };

    if (formValue.id) {
      // ── Modification ──────────────────────────────────────
      this.store.dispatch(updatecategoriesalarieData({ updatedData: formValue }));
      this.toastService.success('Catégorie salarié mise à jour avec succès !', 'Succès');

      this.tarifLignes.forEach(ligne => {
        if (ligne._isNew && !ligne._isDeleted) {
          this.store.dispatch(PlatCategoriesalarieActions.createPlatCategoriesalarie({
            data: {
              categoriesalarie: formValue.id,
              montant:          ligne.montant,
              date_debut:       ligne.date_debut,
              date_fin:         ligne.date_fin || null,
              statut:           ligne.statut,
            }
          }));
        } else if (!ligne._isNew && !ligne._isDeleted && ligne.id) {
          this.store.dispatch(PlatCategoriesalarieActions.updatePlatCategoriesalarie({
            id:   ligne.id,
            data: {
              categoriesalarie: formValue.id,
              montant:          ligne.montant,
              date_debut:       ligne.date_debut,
              date_fin:         ligne.date_fin || null,
              statut:           ligne.statut,
            }
          }));
        }
      });

    } else {
      // ── Création — snapshot AVANT fermeture ───────────────
      this.tarifLignesSnapshot = [...this.tarifLignes];
      delete formValue.id;
      this.store.dispatch(addcategoriesalarieData({ newData: formValue }));
      this.toastService.success('Catégorie salarié ajoutée avec succès !', 'Succès');
    }

    this.submitted = false;
    this.categoriesalarieForm.reset();
    this.closeAddModal();
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

  confirmDelete(id?: any): void {
    if (id) {
      this.store.dispatch(deletecategoriesalarieData({ id: id.toString() }));
      this.toastService.success('Catégorie salarié supprimée avec succès !', 'Succès');
      this.afterDeleteActions();
      return;
    }
    if (this.checkedValGet?.length > 0) {
      this.store.dispatch(deletemultiplecategoriesalarieData({ id: this.checkedValGet.join(',') }));
      this.toastService.success('Catégories salariés supprimées avec succès !', 'Succès');
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
      this.tarifLignes              = [];

      this.store.dispatch(PlatCategoriesalarieActions.fetchPlatCategoriesalarie({
        categoriesalarieId: id
      }));
      this.store.select(selectPlatCategoriesalarieTarifs).pipe(
        filter(tarifs => tarifs.length > 0),
        take(1)
      ).subscribe(tarifs => {
        this.tarifLignes = this.mapTarifsToLignes(tarifs);
      });

      this.viewCategoriesalarie?.show();
    } else {
      this.toastService.error('Catégorie salarié introuvable', 'Erreur');
    }
  }

  closeViewModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => {
      this.viewCategoriesalarie?.hide();
      this.selectedCategoriesalarie = null;
      this.tarifLignes              = [];
      this.store.dispatch(PlatCategoriesalarieActions.resetPlatCategoriesalarie());
    }, 10);
  }

  // ── Helpers ───────────────────────────────────────────────
  getStatutLibelle(statutId: number): string {
    return this.statuts.find(s => s.id === statutId)?.libelle_statut ?? '—';
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

  filterdata(): void {
    if (this.term) {
      this.categoriesalaries = this.categoriesalarieList.filter(el =>
        el.libelle?.toLowerCase().includes(this.term.toLowerCase()) ||
        el.id?.toString().includes(this.term)
      );
    } else {
      this.loadData(this.currentPage);
    }
    this.updateNoResultDisplay();
  }

  updateNoResultDisplay(): void {
    const el = document.querySelector('.noresult') as HTMLElement;
    if (!el) return;
    el.style.display = this.term && this.categoriesalaries.length === 0 ? 'block' : 'none';
  }

  pageChanged(event: PageChangedEvent): void {
    this.loadData(event.page);
  }

  private setModalTitle(title: string): void {
    const el = document.querySelector('.modal-title') as HTMLElement;
    if (el) el.innerHTML = title;
  }

  private setModalBtn(label: string): void {
    const el = document.getElementById('add-btn') as HTMLElement;
    if (el) el.innerHTML = label;
  }
}
