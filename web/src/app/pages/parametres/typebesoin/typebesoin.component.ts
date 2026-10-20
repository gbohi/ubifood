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
  addtypebesoinData, addtypebesoinDataSuccess, addtypebesoinDataFailure,
  updatetypebesoinData, updatetypebesoinDataSuccess, updatetypebesoinDataFailure,
  deletetypebesoinData, deletetypebesoinSuccess, deletetypebesoinFailure,
  deletemultipletypebesoinData, deletemultipletypebesoinSuccess, deletemultipletypebesoinFailure,
  fetchtypebesoinData,
} from 'src/app/store/Typebesoin/typebesoin.action';
import { selecttypebesoinData, selectTotalItems, selectLoading, selectCurrentPage } from 'src/app/store/Typebesoin/typebesoin-selector';
import { TriServeur } from 'src/app/shared/tri-serveur';

@Component({
  selector: 'app-typebesoin',
  templateUrl: './typebesoin.component.html',
  styleUrl: './typebesoin.component.scss',
  providers: [DecimalPipe]
})
export class TypebesoinComponent implements OnInit, AfterViewInit {

  // Tri serveur des colonnes : clé de colonne → champ autorisé par l'API (ordering_fields)
  readonly tri = new TriServeur({ id: 'id', libelle: 'libelle' });

  private readonly destroyRef = inject(DestroyRef);
  private readonly actions$ = inject(Actions);

  // bread crumb items
  breadCrumbItems!: Array<{}>;

  typebesoins: any[] = [];
  totalItems: number = 0;
  currentPage: number = 1;
  isLoading: boolean = true;

  typebesoinForm!: UntypedFormGroup;
  isEdit = false;
  isSaving = false;
  isDeleting = false;
  masterSelected = false;
  term = '';
  checkedValGet: any[] = [];

  private readonly search$ = new Subject<string>();

  // Élément qui avait le focus avant l'ouverture d'une modal
  private lastActiveElement: HTMLElement | null = null;

  @ViewChild('addTypebesoin', { static: false }) addTypebesoin?: ModalDirective;
  @ViewChild('deleteRecordModal', { static: false }) deleteRecordModal?: ModalDirective;
  @ViewChild('viewTypebesoin', { static: false }) viewTypebesoin?: ModalDirective;
  selectedTypebesoin: any = null;
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
      { label: 'Types de besoin', active: true }
    ];

    this.typebesoinForm = this.formBuilder.group({
      id: [''],
      libelle: ['', [Validators.required]]
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

    this.store.select(selecttypebesoinData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => {
        if (data) {
          this.typebesoins = data.map(item => ({ ...item, state: false }));
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
      .pipe(ofType(addtypebesoinDataSuccess, updatetypebesoinDataSuccess), takeUntilDestroyed(this.destroyRef))
      .subscribe(action => {
        this.isSaving = false;
        this.toastService.success(
          action.type === addtypebesoinDataSuccess.type
            ? 'Type de besoin ajouté avec succès !'
            : 'Type de besoin mis à jour avec succès !',
          'Succès'
        );
        this.closeAddModal();
      });

    this.actions$
      .pipe(ofType(addtypebesoinDataFailure, updatetypebesoinDataFailure), takeUntilDestroyed(this.destroyRef))
      .subscribe(({ error }) => {
        // La modal reste ouverte avec les valeurs saisies
        this.isSaving = false;
        this.toastService.error(error || "L'enregistrement a échoué.", 'Erreur');
      });

    // Réponses du serveur : suppression
    this.actions$
      .pipe(ofType(deletetypebesoinSuccess, deletemultipletypebesoinSuccess), takeUntilDestroyed(this.destroyRef))
      .subscribe(action => {
        const multiple = action.type === deletemultipletypebesoinSuccess.type;
        const count = multiple ? action.id.split(',').filter(s => s.trim() !== '').length : 1;
        this.toastService.success(
          count > 1 ? `${count} types de besoin supprimés avec succès !` : 'Type de besoin supprimé avec succès !',
          'Succès'
        );
        this.afterDeleteActions();
      });

    this.actions$
      .pipe(ofType(deletetypebesoinFailure, deletemultipletypebesoinFailure), takeUntilDestroyed(this.destroyRef))
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
    this.addTypebesoin?.onHidden
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.typebesoinForm.reset();
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
    this.store.dispatch(fetchtypebesoinData({ page, search, ordering: this.tri.ordering }));
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
    this.typebesoinForm.reset();
    this.addTypebesoin?.show();
  }

  closeAddModal() {
    this.restoreFocus();
    setTimeout(() => this.addTypebesoin?.hide(), 10);
  }

  // Edit Data
  editList(id: any) {
    const editData = this.typebesoins.find(p => p.id === id);
    if (!editData) {
      this.toastService.error('Type de besoin introuvable', 'Erreur');
      return;
    }
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.isEdit = true;
    this.typebesoinForm.reset();
    this.typebesoinForm.patchValue({ id: editData.id, libelle: editData.libelle });
    this.addTypebesoin?.show();
  }

  // Ajout / mise à jour : le résultat est traité à la réponse du serveur
  saveProperty() {
    if (this.typebesoinForm.invalid) {
      this.typebesoinForm.markAllAsTouched();
      this.toastService.error('Veuillez vérifier les informations saisies.', 'Erreur');
      return;
    }
    if (this.isSaving) return;

    const formValue = { ...this.typebesoinForm.value };
    this.isSaving = true;
    if (formValue.id) {
      this.store.dispatch(updatetypebesoinData({ updatedData: formValue }));
    } else {
      delete formValue.id;
      this.store.dispatch(addtypebesoinData({ newData: formValue }));
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
      this.toastService.error('Aucun type de besoin sélectionné pour suppression.', 'Erreur');
      return;
    }
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.deleteID = null;
    this.deleteRecordModal?.show();
  }

  // Texte de confirmation : correspond à ce qui sera supprimé
  get deleteMessage(): string {
    if (this.deleteID == null && this.checkedValGet.length > 1) {
      return `Voulez-vous vraiment supprimer ces ${this.checkedValGet.length} types de besoin ?`;
    }
    return 'Voulez-vous vraiment supprimer ce type de besoin ?';
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
      this.store.dispatch(deletetypebesoinData({ id: this.deleteID.toString() }));
      return;
    }

    if (this.checkedValGet.length > 0) {
      this.isDeleting = true;
      this.store.dispatch(deletemultipletypebesoinData({ id: this.checkedValGet.join(',') }));
      return;
    }

    this.toastService.error('Aucun type de besoin sélectionné pour suppression.', 'Erreur');
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
    this.typebesoins.forEach((x: any) => x.state = ev.target.checked);
    this.masterSelected = ev.target.checked;
    this.updateCheckedValues();
  }

  onCheckboxChange() {
    this.updateCheckedValues();
  }

  private updateCheckedValues() {
    this.checkedValGet = this.typebesoins.filter(x => x.state === true).map(x => x.id);
    this.masterSelected = this.typebesoins.length > 0 && this.checkedValGet.length === this.typebesoins.length;
  }

  // Tri côté serveur (?ordering=) : s'applique à toutes les données, pas seulement à la page affichée.
  // Un nouveau clic inverse le sens ; la recherche courante est conservée et on revient à la page 1.
  onSort(column: string): void {
    if (this.tri.basculer(column)) this.loadData(1);
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
    const data = this.typebesoins.find(p => p.id === id);
    if (!data) {
      this.toastService.error('Type de besoin introuvable', 'Erreur');
      return;
    }
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.selectedTypebesoin = data;
    this.viewTypebesoin?.show();
  }

  closeViewModal() {
    this.restoreFocus();
    setTimeout(() => {
      this.viewTypebesoin?.hide();
      this.selectedTypebesoin = null;
    }, 10);
  }
}
