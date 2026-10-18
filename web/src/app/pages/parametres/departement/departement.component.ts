import { Component, DestroyRef, OnInit, AfterViewInit, ViewChild, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';
import { ToastrService } from 'ngx-toastr';
import { Store } from '@ngrx/store';
import { Actions, ofType } from '@ngrx/effects';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import {
  adddepartementData, adddepartementDataSuccess, adddepartementDataFailure,
  updatedepartementData, updatedepartementDataSuccess, updatedepartementDataFailure,
  deletedepartementData, deletedepartementSuccess, deletedepartementFailure,
  deletemultipledepartementData, deletemultipledepartementSuccess, deletemultipledepartementFailure,
  fetchdepartementData,
} from 'src/app/store/Departement/departement.action';
import { selectdepartementData, selectTotalItems, selectLoading, selectCurrentPage } from 'src/app/store/Departement/departement-selector';

@Component({
  selector: 'app-departement',
  templateUrl: './departement.component.html',
  styleUrl: './departement.component.scss',
  providers: [DecimalPipe]
})
export class DepartementComponent implements OnInit, AfterViewInit {

  private readonly destroyRef = inject(DestroyRef);
  private readonly actions$ = inject(Actions);

  // bread crumb items
  breadCrumbItems!: Array<{}>;

  departements: any[] = [];
  totalItems: number = 0;
  currentPage: number = 1;
  isLoading: boolean = true;

  departementForm!: UntypedFormGroup;
  isEdit = false;
  isSaving = false;
  isDeleting = false;
  masterSelected = false;
  term = '';
  checkedValGet: any[] = [];

  private readonly search$ = new Subject<string>();

  // Élément qui avait le focus avant l'ouverture d'une modal
  private lastActiveElement: HTMLElement | null = null;

  @ViewChild('addDepartement', { static: false }) addDepartement?: ModalDirective;
  @ViewChild('deleteRecordModal', { static: false }) deleteRecordModal?: ModalDirective;
  @ViewChild('viewDepartement', { static: false }) viewDepartement?: ModalDirective;
  selectedDepartement: any = null;
  deleteID: any = null;
  direction: any = 'asc';

  constructor(
    private formBuilder: UntypedFormBuilder,
    public toastService: ToastrService,
    public store: Store
  ) {}

  ngOnInit(): void {
    this.breadCrumbItems = [
      { label: 'Paramètres' },
      { label: 'Départements', active: true }
    ];

    this.departementForm = this.formBuilder.group({
      id: [''],
      libelle_service: ['', [Validators.required]]
    });

    this.store.select(selectLoading)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(loading => this.isLoading = loading);

    this.store.select(selectTotalItems)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(total => this.totalItems = total || 0);

    this.store.select(selectCurrentPage)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(page => this.currentPage = page || 1);

    this.store.select(selectdepartementData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => {
        if (data) {
          this.departements = data.map(item => ({ ...item, state: false }));
          // Nouvelles données (changement de page, rechargement) : la sélection ne vaut plus
          this.masterSelected = false;
          this.checkedValGet = [];
        }
      });

    // Recherche côté serveur (?search=), relancée sur la page 1
    this.search$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadData(1));

    // Réponses du serveur : ajout / mise à jour
    this.actions$
      .pipe(ofType(adddepartementDataSuccess, updatedepartementDataSuccess), takeUntilDestroyed(this.destroyRef))
      .subscribe(action => {
        this.isSaving = false;
        this.toastService.success(
          action.type === adddepartementDataSuccess.type
            ? 'Département ajouté avec succès !'
            : 'Département mis à jour avec succès !',
          'Succès'
        );
        this.closeAddModal();
      });

    this.actions$
      .pipe(ofType(adddepartementDataFailure, updatedepartementDataFailure), takeUntilDestroyed(this.destroyRef))
      .subscribe(({ error }) => {
        // La modal reste ouverte avec les valeurs saisies
        this.isSaving = false;
        this.toastService.error(error || "L'enregistrement a échoué.", 'Erreur');
      });

    // Réponses du serveur : suppression
    this.actions$
      .pipe(ofType(deletedepartementSuccess, deletemultipledepartementSuccess), takeUntilDestroyed(this.destroyRef))
      .subscribe(action => {
        const multiple = action.type === deletemultipledepartementSuccess.type;
        const count = multiple ? action.id.split(',').filter(s => s.trim() !== '').length : 1;
        this.toastService.success(
          count > 1 ? `${count} départements supprimés avec succès !` : 'Département supprimé avec succès !',
          'Succès'
        );
        this.afterDeleteActions();
      });

    this.actions$
      .pipe(ofType(deletedepartementFailure, deletemultipledepartementFailure), takeUntilDestroyed(this.destroyRef))
      .subscribe(({ error }) => {
        // On ferme la confirmation, la ligne reste affichée
        this.isDeleting = false;
        this.deleteID = null;
        this.closeDeleteModal();
        this.toastService.error(error || 'La suppression a échoué.', 'Erreur');
      });

    this.loadData(1);
  }

  ngAfterViewInit() {
    this.addDepartement?.onHidden
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.departementForm.reset();
        this.isEdit = false;
        this.isSaving = false;
      });

    this.deleteRecordModal?.onHidden
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.deleteID = null;
        this.isDeleting = false;
      });
  }

  // Charger les données (page + terme de recherche courant)
  loadData(page: number = 1): void {
    const search = this.term?.trim() || undefined;
    this.store.dispatch(fetchdepartementData({ page, search }));
  }

  // Remet le focus sur l'élément d'origine (évite un focus resté dans une modal masquée)
  private restoreFocus() {
    if (this.lastActiveElement) {
      this.lastActiveElement.focus();
    } else {
      document.body.focus();
    }
  }

  // Ouverture de la modal d'ajout
  openAddModal() {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.isEdit = false;
    this.departementForm.reset();
    this.addDepartement?.show();
  }

  closeAddModal() {
    this.restoreFocus();
    setTimeout(() => this.addDepartement?.hide(), 10);
  }

  // Edit Data
  editList(id: any) {
    const editData = this.departements.find(p => p.id === id);
    if (!editData) {
      this.toastService.error('Département introuvable', 'Erreur');
      return;
    }
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.isEdit = true;
    this.departementForm.reset();
    this.departementForm.patchValue({ id: editData.id, libelle_service: editData.libelle_service });
    this.addDepartement?.show();
  }

  // Ajout / mise à jour : le résultat est traité à la réponse du serveur
  saveProperty() {
    if (this.departementForm.invalid) {
      this.departementForm.markAllAsTouched();
      this.toastService.error('Veuillez vérifier les informations saisies.', 'Erreur');
      return;
    }
    if (this.isSaving) return;

    const formValue = { ...this.departementForm.value };
    this.isSaving = true;
    if (formValue.id) {
      this.store.dispatch(updatedepartementData({ updatedData: formValue }));
    } else {
      delete formValue.id;
      this.store.dispatch(adddepartementData({ newData: formValue }));
    }
  }

  // Suppression d'une ligne
  removeItem(id: any) {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.deleteID = id;
    this.deleteRecordModal?.show();
  }

  // Suppression de la sélection
  removeSelected() {
    if (this.checkedValGet.length === 0) {
      this.toastService.error('Aucun département sélectionné pour suppression.', 'Erreur');
      return;
    }
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.deleteID = null;
    this.deleteRecordModal?.show();
  }

  // Texte de confirmation : correspond à ce qui sera supprimé
  get deleteMessage(): string {
    if (this.deleteID == null && this.checkedValGet.length > 1) {
      return `Voulez-vous vraiment supprimer ces ${this.checkedValGet.length} départements ?`;
    }
    return 'Voulez-vous vraiment supprimer ce département ?';
  }

  closeDeleteModal() {
    this.restoreFocus();
    setTimeout(() => this.deleteRecordModal?.hide(), 10);
  }

  // Confirmation : le résultat est traité à la réponse du serveur
  confirmDelete() {
    if (this.isDeleting) return;

    if (this.deleteID != null) {
      this.isDeleting = true;
      this.store.dispatch(deletedepartementData({ id: this.deleteID.toString() }));
      return;
    }

    if (this.checkedValGet.length > 0) {
      this.isDeleting = true;
      this.store.dispatch(deletemultipledepartementData({ id: this.checkedValGet.join(',') }));
      return;
    }

    this.toastService.error('Aucun département sélectionné pour suppression.', 'Erreur');
    this.closeDeleteModal();
  }

  private afterDeleteActions() {
    this.isDeleting = false;
    this.closeDeleteModal();
    this.masterSelected = false;
    this.deleteID = null;
    this.checkedValGet = [];
  }

  // La case maître coche / décoche toutes les lignes de la page
  checkUncheckAll(ev: any) {
    this.departements.forEach((x: any) => x.state = ev.target.checked);
    this.masterSelected = ev.target.checked;
    this.updateCheckedValues();
  }

  onCheckboxChange() {
    this.updateCheckedValues();
  }

  private updateCheckedValues() {
    this.checkedValGet = this.departements.filter(x => x.state === true).map(x => x.id);
    this.masterSelected = this.departements.length > 0 && this.checkedValGet.length === this.departements.length;
  }

  // Tri (page courante)
  onSort(column: any) {
    this.direction = this.direction == 'asc' ? 'desc' : 'asc';
    const sortedArray = [...this.departements];
    sortedArray.sort((a, b) => {
      const res = this.compare(a[column], b[column]);
      return this.direction === 'asc' ? res : -res;
    });
    this.departements = sortedArray;
  }

  compare(v1: string | number, v2: string | number) {
    return v1 < v2 ? -1 : v1 > v2 ? 1 : 0;
  }

  // Recherche (debounce 300 ms, côté serveur)
  onSearchChange(value: string) {
    this.search$.next((value ?? '').trim());
  }

  // Page Changed (le terme de recherche est conservé)
  pageChanged(event: PageChangedEvent): void {
    if (event.page === this.currentPage) return;
    this.loadData(event.page);
  }

  // Ouvrir la modal de détails
  viewDetails(id: any) {
    const data = this.departements.find(p => p.id === id);
    if (!data) {
      this.toastService.error('Département introuvable', 'Erreur');
      return;
    }
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.selectedDepartement = data;
    this.viewDepartement?.show();
  }

  closeViewModal() {
    this.restoreFocus();
    setTimeout(() => {
      this.viewDepartement?.hide();
      this.selectedDepartement = null;
    }, 10);
  }
}
