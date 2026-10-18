// src/app/pages/poste/poste.component.ts

import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe, DatePipe } from '@angular/common';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { Store } from '@ngrx/store';
import { Actions, ofType } from '@ngrx/effects';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';

import {
  addposteData,
  addposteDataSuccess,
  addposteDataFailure,
  deleteposteData,
  deleteposteSuccess,
  deleteposteFailure,
  deletemultipleposteData,
  deletemultipleposteSuccess,
  deletemultipleposteFailure,
  fetchposteData,
  updateposteData,
  updateposteDataSuccess,
  updateposteDataFailure,
} from 'src/app/store/Poste/poste.action';
import {
  selectposteData,
  selectTotalItems,
  selectLoading,
  selectCurrentPage,
} from 'src/app/store/Poste/poste-selector';

// ── Fonction store (select) ────────────────────────────────────
import { selectAllFonctionWithoutPagination } from 'src/app/store/Fonction/fonction-selector';
import { fetchfonctionNoPaginateData } from 'src/app/store/Fonction/fonction.action';

// ── Service store (select) ─────────────────────────────────────
import { selectAllDepartementWithoutPagination } from 'src/app/store/Departement/departement-selector';
import { fetchdepartementNoPaginateData } from 'src/app/store/Departement/departement.action';

@Component({
  selector: 'app-poste',
  templateUrl: './poste.component.html',
  styleUrl: './poste.component.scss',
  providers: [DecimalPipe, DatePipe],
})
export class PosteComponent implements OnInit, AfterViewInit {

  private destroyRef = inject(DestroyRef);
  private actions$   = inject(Actions);

  breadCrumbItems = [
    { label: 'Paramètres', active: false },
    { label: 'Postes', active: true },
  ];

  postes:    any[] = [];
  fonctions: any[] = [];
  services:  any[] = [];
  totalItems  = 0;
  currentPage = 1;
  isLoading   = true;

  posteForm!: UntypedFormGroup;
  submitted      = false;
  isEdit         = false;
  saving         = false;
  deleting       = false;
  masterSelected = false;
  term: any;
  checkedValGet: any[] = [];
  selectedPoste: any   = null;
  deleteID: any;
  direction = 'asc';

  /** Terme de recherche effectivement envoyé au serveur (?search=) */
  private searchTerm = '';
  private search$    = new Subject<string>();

  private lastActiveElement: HTMLElement | null = null;

  @ViewChild('addPoste',           { static: false }) addPoste?:           ModalDirective;
  @ViewChild('deleteRecordModal', { static: false }) deleteRecordModal?: ModalDirective;
  @ViewChild('viewPoste',          { static: false }) viewPoste?:          ModalDirective;
  @ViewChild('mainContainer',     { static: false }) mainContainer?:     ElementRef;

  constructor(
    private fb: UntypedFormBuilder,
    private toastService: ToastrService,
    private store: Store,
  ) {}

  ngOnInit(): void {
    this.posteForm = this.fb.group({
      id:           [''],
      libelle:  ['', [Validators.required]],
      fonction: ['', [Validators.required]],
      service:  ['', [Validators.required]],
    });

    this.store.select(selectLoading).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(loading => {
      this.isLoading = loading;
    });

    this.store.select(selectTotalItems).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(total => {
      this.totalItems = total ?? 0;
    });

    this.store.select(selectCurrentPage).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(page => {
      this.currentPage = page ?? 1;
    });

    this.store.select(selectposteData).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(data => {
      if (data) {
        this.postes = data.map(item => ({ ...item, state: false }));
        this.resetSelection();
      }
    });

    // ── Recherche serveur (debounce 300 ms, retour page 1) ──
    this.search$.pipe(
      map(t => (t ?? '').toString().trim()),
      debounceTime(300),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(t => {
      this.searchTerm = t;
      this.loadData(1);
    });

    // ── Réponses du serveur (ajout / modification) ─────────
    this.actions$.pipe(ofType(addposteDataSuccess, updateposteDataSuccess), takeUntilDestroyed(this.destroyRef))
      .subscribe(action => {
        this.saving    = false;
        this.submitted = false;
        this.toastService.success(
          action.type === addposteDataSuccess.type ? 'Poste ajouté avec succès !' : 'Poste mis à jour avec succès !',
          'Succès'
        );
        this.closeAddModal();
      });

    this.actions$.pipe(ofType(addposteDataFailure, updateposteDataFailure), takeUntilDestroyed(this.destroyRef))
      .subscribe(({ error }) => {
        // La modale reste ouverte avec les valeurs saisies
        this.saving = false;
        this.toastService.error(error || 'Enregistrement impossible.', 'Erreur');
      });

    // ── Réponses du serveur (suppression) ──────────────────
    this.actions$.pipe(ofType(deleteposteSuccess, deletemultipleposteSuccess), takeUntilDestroyed(this.destroyRef))
      .subscribe(action => {
        this.toastService.success(
          action.type === deleteposteSuccess.type ? 'Poste supprimé avec succès !' : 'Postes supprimés avec succès !',
          'Succès'
        );
        this.afterDeleteActions();
      });

    this.actions$.pipe(ofType(deleteposteFailure, deletemultipleposteFailure), takeUntilDestroyed(this.destroyRef))
      .subscribe(({ error }) => {
        // La ligne reste affichée : on montre seulement l'erreur
        this.deleting = false;
        this.toastService.error(error || 'Suppression impossible.', 'Erreur');
        this.closeDeleteModal();
      });

    // ── Charger les fonctions pour le select ───────────────
    this.store.dispatch(fetchfonctionNoPaginateData());
    this.store.select(selectAllFonctionWithoutPagination).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(data => {
      this.fonctions = data ?? [];
    });

    // ── Charger les services pour le select ────────────────
    this.store.dispatch(fetchdepartementNoPaginateData());
    this.store.select(selectAllDepartementWithoutPagination).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(data => {
      this.services = data ?? [];
    });

    this.loadData(1);
  }

  ngAfterViewInit(): void {
    this.addPoste?.onHidden.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.posteForm.reset();
      this.submitted = false;
      this.saving    = false;
      this.isEdit    = false;
    });

    this.deleteRecordModal?.onHidden.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.deleteID = null;
      this.deleting = false;
    });
  }

  // ── Chargement ────────────────────────────────────────────
  loadData(page: number = 1): void {
    this.store.dispatch(fetchposteData({ page, search: this.searchTerm || undefined }));
  }

  private resetSelection(): void {
    this.checkedValGet  = [];
    this.masterSelected = false;
  }

  // ── Modal Ajouter ─────────────────────────────────────────
  openAddModal(): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.posteForm.reset();
    this.submitted = false;
    this.isEdit    = false;
    this.addPoste?.show();
  }

  closeAddModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => this.addPoste?.hide(), 10);
  }

  // ── Modal Édition ─────────────────────────────────────────
  editList(id: any): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    const editData = this.postes.find(p => p.id === id);
    if (!editData) return;

    this.posteForm.reset();
    this.posteForm.patchValue(editData);
    this.submitted = false;
    this.isEdit    = true;
    this.addPoste?.show();
  }

  // ── Sauvegarde (ajout / mise à jour) ─────────────────────
  saveProperty(): void {
    this.submitted = true;
    if (this.posteForm.invalid) {
      this.toastService.error('Veuillez vérifier les informations saisies.', 'Erreur');
      return;
    }
    if (this.saving) return;

    const formValue = { ...this.posteForm.value };
    this.saving = true;

    if (formValue.id) {
      this.store.dispatch(updateposteData({ updatedData: formValue }));
    } else {
      delete formValue.id;
      this.store.dispatch(addposteData({ newData: formValue }));
    }
    // Toast + fermeture de la modale à la réponse du serveur (voir ngOnInit)
  }

  // ── Modal Suppression ─────────────────────────────────────
  removeItem(id: any): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.deleteID = id;
    this.deleteRecordModal?.show();
  }

  openBulkDelete(): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.deleteID = null;
    this.deleteRecordModal?.show();
  }

  closeDeleteModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => this.deleteRecordModal?.hide(), 10);
  }

  get deleteMessage(): string {
    if (this.deleteID) {
      const libelle = this.postes.find(e => e.id === this.deleteID)?.libelle;
      return libelle ? `le poste « ${libelle} »` : 'ce poste';
    }
    const n = this.checkedValGet.length;
    return n > 1 ? `ces ${n} postes` : 'ce poste';
  }

  confirmDelete(id?: any): void {
    if (this.deleting) return;

    if (id) {
      this.deleting = true;
      this.store.dispatch(deleteposteData({ id: id.toString() }));
      return;
    }

    if (this.checkedValGet?.length > 0) {
      this.deleting = true;
      this.store.dispatch(deletemultipleposteData({ id: this.checkedValGet.join(',') }));
      return;
    }

    this.toastService.error('Aucun poste sélectionné.', 'Erreur');
    this.closeDeleteModal();
  }

  private afterDeleteActions(): void {
    this.closeDeleteModal();
    this.deleting = false;
    this.deleteID = null;
    this.resetSelection();
  }

  // ── Modal Détails ─────────────────────────────────────────
  viewDetails(id: any): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    const posteData = this.postes.find(p => p.id === id);
    if (posteData) {
      this.selectedPoste = posteData;
      this.viewPoste?.show();
    } else {
      this.toastService.error('Poste introuvable', 'Erreur');
    }
  }

  closeViewModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => {
      this.viewPoste?.hide();
      this.selectedPoste = null;
    }, 10);
  }

  // ── Helpers affichage ─────────────────────────────────────
  getFonctionLibelle(fonctionId: number): string {
    return this.fonctions.find(f => f.id === fonctionId)?.libelle ?? '—';
  }

  getServiceLibelle(serviceId: number): string {
    return this.services.find(s => s.id === serviceId)?.libelle_service ?? '—';
  }

  // ── Checkboxes ────────────────────────────────────────────
  checkUncheckAll(ev: any): void {
    this.postes.forEach(x => x.state = ev.target.checked);
    this.masterSelected = ev.target.checked;
    this.updateCheckedValues();
  }

  onCheckboxChange(): void {
    this.updateCheckedValues();
  }

  private updateCheckedValues(): void {
    this.checkedValGet = this.postes
      .filter(e => e.state === true)
      .map(e => e.id);
    this.masterSelected = this.postes.length > 0 && this.checkedValGet.length === this.postes.length;
  }

  // ── Tri ───────────────────────────────────────────────────
  onSort(column: string): void {
    this.direction = this.direction === 'asc' ? 'desc' : 'asc';
    this.postes = [...this.postes].sort((a, b) => {
      const res = this.compare(a[column], b[column]);
      return this.direction === 'asc' ? res : -res;
    });
  }

  compare(v1: string | number, v2: string | number): number {
    return v1 < v2 ? -1 : v1 > v2 ? 1 : 0;
  }

  // ── Recherche (côté serveur) ──────────────────────────────
  filterdata(value?: string): void {
    this.search$.next(value ?? this.term ?? '');
  }

  // ── Pagination (le terme de recherche est conservé) ───────
  pageChanged(event: PageChangedEvent): void {
    this.loadData(event.page);
  }
}
