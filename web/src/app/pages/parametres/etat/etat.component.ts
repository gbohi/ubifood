// src/app/pages/etat/etat.component.ts

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
  addetatData,
  addetatDataSuccess,
  addetatDataFailure,
  deleteetatData,
  deleteetatSuccess,
  deleteetatFailure,
  deletemultipleetatData,
  deletemultipleetatSuccess,
  deletemultipleetatFailure,
  fetchetatData,
  updateetatData,
  updateetatDataSuccess,
  updateetatDataFailure,
} from 'src/app/store/Etat/etat.action';
import {
  selectetatData,
  selectTotalItems,
  selectLoading,
  selectCurrentPage,
} from 'src/app/store/Etat/etat-selector';
import { TriServeur } from 'src/app/shared/tri-serveur';

@Component({
  selector: 'app-etat',
  templateUrl: './etat.component.html',
  styleUrl: './etat.component.scss',
  providers: [DecimalPipe, DatePipe],
})
export class EtatComponent implements OnInit, AfterViewInit {

  // Tri serveur des colonnes : clé de colonne → champ autorisé par l'API (ordering_fields)
  readonly tri = new TriServeur({ id: 'id', libelle_etat: 'libelle_etat' });

  private destroyRef = inject(DestroyRef);
  private actions$   = inject(Actions);

  breadCrumbItems = [
    { label: 'Paramètres', active: false },
    { label: 'États', active: true },
  ];

  etats:    any[] = [];
  totalItems  = 0;
  currentPage = 1;
  isLoading   = true;

  etatForm!: UntypedFormGroup;
  submitted      = false;
  isEdit         = false;
  saving         = false;
  deleting       = false;
  masterSelected = false;
  term: any;
  checkedValGet: any[] = [];
  selectedEtat: any   = null;
  deleteID: any;
  direction = 'asc';

  /** Terme de recherche effectivement envoyé au serveur (?search=) */
  private searchTerm = '';
  private search$    = new Subject<string>();

  private lastActiveElement: HTMLElement | null = null;

  @ViewChild('addEtat',           { static: false }) addEtat?:           ModalDirective;
  @ViewChild('deleteRecordModal', { static: false }) deleteRecordModal?: ModalDirective;
  @ViewChild('viewEtat',          { static: false }) viewEtat?:          ModalDirective;
  @ViewChild('mainContainer',     { static: false }) mainContainer?:     ElementRef;

  constructor(
    private fb: UntypedFormBuilder,
    private toastService: ToastrService,
    private store: Store,
  ) {}

  ngOnInit(): void {
    this.etatForm = this.fb.group({
      id:           [''],
      libelle_etat: ['', [Validators.required]],
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

    this.store.select(selectetatData).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(data => {
      if (data) {
        this.etats = data.map(item => ({ ...item, state: false }));
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
    this.actions$.pipe(ofType(addetatDataSuccess, updateetatDataSuccess), takeUntilDestroyed(this.destroyRef))
      .subscribe(action => {
        this.saving    = false;
        this.submitted = false;
        this.toastService.success(
          action.type === addetatDataSuccess.type ? 'État ajouté avec succès !' : 'État mis à jour avec succès !',
          'Succès'
        );
        this.closeAddModal();
      });

    this.actions$.pipe(ofType(addetatDataFailure, updateetatDataFailure), takeUntilDestroyed(this.destroyRef))
      .subscribe(({ error }) => {
        // La modale reste ouverte avec les valeurs saisies
        this.saving = false;
        this.toastService.error(error || 'Enregistrement impossible.', 'Erreur');
      });

    // ── Réponses du serveur (suppression) ──────────────────
    this.actions$.pipe(ofType(deleteetatSuccess, deletemultipleetatSuccess), takeUntilDestroyed(this.destroyRef))
      .subscribe(action => {
        this.toastService.success(
          action.type === deleteetatSuccess.type ? 'État supprimé avec succès !' : 'États supprimés avec succès !',
          'Succès'
        );
        this.afterDeleteActions();
      });

    this.actions$.pipe(ofType(deleteetatFailure, deletemultipleetatFailure), takeUntilDestroyed(this.destroyRef))
      .subscribe(({ error }) => {
        // La ligne reste affichée : on montre seulement l'erreur
        this.deleting = false;
        this.toastService.error(error || 'Suppression impossible.', 'Erreur');
        this.closeDeleteModal();
      });

    this.loadData(1);
  }

  ngAfterViewInit(): void {
    this.addEtat?.onHidden.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.etatForm.reset();
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
    this.store.dispatch(fetchetatData({ page, search: this.searchTerm || undefined, ordering: this.tri.ordering }));
  }

  private resetSelection(): void {
    this.checkedValGet  = [];
    this.masterSelected = false;
  }

  // ── Modal Ajouter ─────────────────────────────────────────
  openAddModal(): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.etatForm.reset();
    this.submitted = false;
    this.isEdit    = false;
    this.addEtat?.show();
  }

  closeAddModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => this.addEtat?.hide(), 10);
  }

  // ── Modal Édition ─────────────────────────────────────────
  editList(id: any): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    const editData = this.etats.find(p => p.id === id);
    if (!editData) return;

    this.etatForm.reset();
    this.etatForm.patchValue(editData);
    this.submitted = false;
    this.isEdit    = true;
    this.addEtat?.show();
  }

  // ── Sauvegarde (ajout / mise à jour) ─────────────────────
  saveProperty(): void {
    this.submitted = true;
    if (this.etatForm.invalid) {
      this.toastService.error('Veuillez vérifier les informations saisies.', 'Erreur');
      return;
    }
    if (this.saving) return;

    const formValue = { ...this.etatForm.value };
    this.saving = true;

    if (formValue.id) {
      this.store.dispatch(updateetatData({ updatedData: formValue }));
    } else {
      delete formValue.id;
      this.store.dispatch(addetatData({ newData: formValue }));
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
      const libelle = this.etats.find(e => e.id === this.deleteID)?.libelle_etat;
      return libelle ? `l'état « ${libelle} »` : 'cet état';
    }
    const n = this.checkedValGet.length;
    return n > 1 ? `ces ${n} états` : 'cet état';
  }

  confirmDelete(id?: any): void {
    if (this.deleting) return;

    if (id) {
      this.deleting = true;
      this.store.dispatch(deleteetatData({ id: id.toString() }));
      return;
    }

    if (this.checkedValGet?.length > 0) {
      this.deleting = true;
      this.store.dispatch(deletemultipleetatData({ id: this.checkedValGet.join(',') }));
      return;
    }

    this.toastService.error('Aucun état sélectionné.', 'Erreur');
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
    const etatData = this.etats.find(p => p.id === id);
    if (etatData) {
      this.selectedEtat = etatData;
      this.viewEtat?.show();
    } else {
      this.toastService.error('État introuvable', 'Erreur');
    }
  }

  closeViewModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => {
      this.viewEtat?.hide();
      this.selectedEtat = null;
    }, 10);
  }

  // ── Checkboxes ────────────────────────────────────────────
  checkUncheckAll(ev: any): void {
    this.etats.forEach(x => x.state = ev.target.checked);
    this.masterSelected = ev.target.checked;
    this.updateCheckedValues();
  }

  onCheckboxChange(): void {
    this.updateCheckedValues();
  }

  private updateCheckedValues(): void {
    this.checkedValGet = this.etats
      .filter(e => e.state === true)
      .map(e => e.id);
    this.masterSelected = this.etats.length > 0 && this.checkedValGet.length === this.etats.length;
  }

  // Tri côté serveur (?ordering=) : s'applique à toutes les données, pas seulement à la page affichée.
  // Un nouveau clic inverse le sens ; la recherche courante est conservée et on revient à la page 1.
  onSort(column: string): void {
    if (this.tri.basculer(column)) this.loadData(1);
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
