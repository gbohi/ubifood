// src/app/pages/cantine/liste-plats/liste-plats.component.ts
import { Component, OnInit, QueryList, ViewChild, ViewChildren, ElementRef, DestroyRef, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subject, filter } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { DatePipe } from '@angular/common';
import { DropzoneComponent, DropzoneConfigInterface } from 'ngx-dropzone-wrapper';
import { Store } from '@ngrx/store';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';

import {
  deleteplatData,
  deletemultipleplatData,
  fetchplatData,
  createPlatWithFiles,
  updatePlatWithFiles,
} from 'src/app/store/Plat/plat.action';

import {
  selectplatData,
  selectTotalItems,
  selectLoading,
  selectCurrentPage,
  selectSuccessMessage,
  selectErrorMessage,
} from 'src/app/store/Plat/plat-selector';

import { selectAllTypeplatWithoutPagination } from 'src/app/store/Typeplat/typeplat-selector';
import { fetchtypeplatNoPaginateData } from 'src/app/store/Typeplat/typeplat.action';
import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';
import { environment } from 'src/environments/environment';
import { PlatModel } from 'src/app/store/Plat/plat.model';

@Component({
  selector: 'app-liste-plats',
  templateUrl: './liste-plats.component.html',
  styleUrl: './liste-plats.component.scss',
  providers: [DecimalPipe, DatePipe]
})
export class ListePlatsComponent implements OnInit {

  // ── Breadcrumb ──────────────────────────────────────────────
  breadCrumbItems!: Array<{}>;

  // ── Données ─────────────────────────────────────────────────
  plats: PlatModel[] = [];
  platList: PlatModel[] = [];
  totalItems = 0;
  currentPage = 1;
  isLoading = true;

  agences: any[] = [];
  typeplats: any[] = [];

  // ── Formulaire ──────────────────────────────────────────────
  platForm!: UntypedFormGroup;
  submitted = false;

  // ── Sélection / suppression ──────────────────────────────────
  masterSelected = false;
  checkedValGet: any[] = [];
  deleteID: any;
  term: any;
  private pendingDelete = false;
  private searchTerms = new Subject<string>();

  // ── Mode du modal (ajout / édition) ─────────────────────────
  isEdit = false;

  // ── Images ──────────────────────────────────────────────────
  // Fichiers en attente : envoyés au backend uniquement à la sauvegarde
  uploadedFiles: any[] = [];
  imagesExistantes: any[] = [];
  imagesASupprimerIds: number[] = [];

  // ── Détails ─────────────────────────────────────────────────
  selectedPlat: PlatModel | null = null;

  // ── Tri ─────────────────────────────────────────────────────
  direction: 'asc' | 'desc' = 'asc';

  // ── URL backend ─────────────────────────────────────────────
  baseUrl = environment.apiUrl;

  // ── Accessibilité ───────────────────────────────────────────
  private lastActiveElement: HTMLElement | null = null;

  // ── ViewChild ───────────────────────────────────────────────
  @ViewChild('addPlat', { static: false }) addPlat?: ModalDirective;
  @ViewChild('deleteRecordModal', { static: false }) deleteRecordModal?: ModalDirective;
  @ViewChild('viewPlat', { static: false }) viewPlat?: ModalDirective;
  @ViewChild('mainContainer', { static: false }) mainContainer?: ElementRef;
  @ViewChild(DropzoneComponent, { static: false }) dropzone?: DropzoneComponent;

  // ── DestroyRef (Angular 16+) ─────────────────────────────────
  /**
   * takeUntilDestroyed(this.destroyRef) remplace ngOnDestroy() + Subject.
   * Tous les abonnements sont automatiquement résiliés quand le composant
   * est détruit, ce qui élimine les fuites mémoire.
   */
  private destroyRef = inject(DestroyRef);

  constructor(
    private formBuilder: UntypedFormBuilder,
    public toastService: ToastrService,
    public store: Store,
  ) {}

  ngOnInit(): void {
    this.breadCrumbItems = [
      { label: 'Cantine', active: false },
      { label: 'Liste des plats', active: true }
    ];

    this.platForm = this.formBuilder.group({
      id: [''],
      nom: ['', [Validators.required]],
      description: [''],
      type_plat: ['', [Validators.required]],
      agence: ['', [Validators.required]]
    });

    // ── Abonnements avec takeUntilDestroyed ─────────────────────

    this.store.select(selectLoading).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(loading => {
      this.isLoading = loading;
    });

    this.store.select(selectTotalItems).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(total => {
      this.totalItems = total ?? 0;
    });

    this.store.select(selectCurrentPage).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(page => {
      this.currentPage = page ?? 1;
    });

    this.store.select(selectplatData).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(data => {
      if (data) {
        this.plats = data.map(item => ({ ...item, state: false }));
        this.platList = [...this.plats];
        this.updateNoResultDisplay();
      }
    });

    this.store.select(selectAllAgenceWithoutPagination).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(data => {
      if (data) this.agences = data;
    });

    this.store.select(selectAllTypeplatWithoutPagination).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(data => {
      if (data) this.typeplats = data;
    });

    // ── Feedback UI ─────────────────────────────────────────────
    // Le reducer écrit successMessage/errorMessage dans le state ;
    // un seul abonnement gère création, mise à jour et suppression.

    this.store.select(selectSuccessMessage).pipe(
      takeUntilDestroyed(this.destroyRef),
      filter((msg): msg is string => !!msg)
    ).subscribe(msg => {
      this.toastService.success(msg, 'Succès');
      if (this.pendingDelete) {
        // Suppression confirmée par le serveur : on ferme le modal
        this.pendingDelete = false;
        this.afterDeleteActions();
        return;
      }
      this.platForm.reset();
      this.uploadedFiles = [];
      this.imagesExistantes = [];
      this.imagesASupprimerIds = [];
      this.closeAddModal();
    });

    this.store.select(selectErrorMessage).pipe(
      takeUntilDestroyed(this.destroyRef),
      filter((msg): msg is string => !!msg)
    ).subscribe(msg => {
      this.toastService.error(msg, 'Erreur');
      // En cas d'échec de suppression, le modal reste ouvert
      this.pendingDelete = false;
    });

    // Recherche côté serveur (?search=) avec debounce
    this.searchTerms.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => this.loadData(1));

    this.loadData(1);
  }

  ngAfterViewInit() {
    this.addPlat?.onHidden.pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      this.platForm.reset();
      this.isEdit = false;
      this.uploadedFiles = [];
      this.imagesExistantes = [];
      this.imagesASupprimerIds = [];
      this.dropzone?.directiveRef?.reset();
    });

    this.deleteRecordModal?.onHidden.pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      this.deleteID = null;
    });
  }

  // ── Chargement ──────────────────────────────────────────────

  loadData(page: number = 1): void {
    this.store.dispatch(fetchplatData({ page, search: (this.term ?? '').trim() }));
    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.dispatch(fetchtypeplatNoPaginateData());
  }

  // ── Dropzone ────────────────────────────────────────────────

  dropzoneConfig: DropzoneConfigInterface = {
    autoProcessQueue: false,
    clickable: true,
    addRemoveLinks: true,
    previewsContainer: false,
  };

  // Aucun envoi par Dropzone (autoProcessQueue: false) : les fichiers sont
  // collectés à l'ajout puis envoyés au backend avec le formulaire.
  onFileAdded(file: any) {
    if (!this.uploadedFiles.includes(file)) {
      this.uploadedFiles.push(file);
    }
  }

  // Fichier refusé par Dropzone (type ou taille) : on le retire de la liste
  onFileError(event: any) {
    const [file, message] = Array.isArray(event) ? event : [event, ''];
    this.onFileRemoved(file);
    this.dropzone?.directiveRef?.dropzone()?.removeFile(file);
    this.toastService.error(
      typeof message === 'string' && message ? message : 'Fichier refusé.',
      'Erreur'
    );
  }

  // Retrait depuis la Dropzone
  onFileRemoved(file: any) {
    const index = this.uploadedFiles.indexOf(file);
    if (index !== -1) this.uploadedFiles.splice(index, 1);
  }

  // Retrait depuis la liste de prévisualisation
  removeFile(file: any) {
    this.onFileRemoved(file);
    this.dropzone?.directiveRef?.dropzone()?.removeFile(file);
  }

  // ── Formulaire ──────────────────────────────────────────────

  saveProperty() {
    if (!this.platForm.valid) {
      this.toastService.error('Veuillez remplir tous les champs requis.', 'Erreur');
      return;
    }

    const formData = new FormData();
    const isUpdate = !!this.platForm.get('id')?.value;
    const platId = this.platForm.get('id')?.value;

    Object.entries(this.platForm.value).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        formData.append(key, (value as any).toString());
      }
    });

    // Nouvelles images en attente
    this.uploadedFiles.forEach(file => {
      formData.append('new_images', file);
    });

    // IDs des images à supprimer
    this.imagesASupprimerIds.forEach(id => {
      formData.append('images_to_delete[]', id.toString());
    });

    if (isUpdate) {
      this.store.dispatch(updatePlatWithFiles({ id: platId, updatedData: formData }));
    } else {
      this.store.dispatch(createPlatWithFiles({ newData: formData }));
    }
    // Le feedback (toast + fermeture modal) est géré dans ngOnInit
    // via les selectors selectSuccessMessage et selectErrorMessage
  }

  // ── Modals ──────────────────────────────────────────────────

  closeAddModal() {
    if (this.lastActiveElement) {
      this.lastActiveElement.focus();
    } else {
      document.body.focus();
    }
    setTimeout(() => {
      this.addPlat?.hide();
    }, 10);
  }

  editList(id: any) {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.isEdit = true;
    this.addPlat?.show();

    const editData = this.plats.find(p => p.id === id);

    if (editData) {
      this.platForm.patchValue(editData);
      this.uploadedFiles = [];
      this.imagesExistantes = editData.images || [];
      this.imagesASupprimerIds = [];
    }
  }

  onImageDeleteCheckboxChange(id: number, event: any) {
    if (event.target.checked) {
      this.imagesASupprimerIds.push(id);
    } else {
      this.imagesASupprimerIds = this.imagesASupprimerIds.filter(v => v !== id);
    }
  }

  viewDetails(id: any) {
    this.lastActiveElement = document.activeElement as HTMLElement;
    const platData = this.plats.find(p => p.id === id);
    if (platData) {
      this.selectedPlat = platData;
      this.viewPlat?.show();
    } else {
      this.toastService.error('Plat introuvable', 'Erreur');
    }
  }

  closeViewModal() {
    if (this.lastActiveElement) {
      this.lastActiveElement.focus();
    } else {
      document.body.focus();
    }
    setTimeout(() => {
      this.viewPlat?.hide();
      this.selectedPlat = null;
    }, 10);
  }

  // ── Suppression ─────────────────────────────────────────────

  removeItem(id: any) {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.deleteID = id;
    this.deleteRecordModal?.show();
  }

  closeDeleteModal() {
    if (this.lastActiveElement) {
      this.lastActiveElement.focus();
    } else {
      document.body.focus();
    }
    setTimeout(() => this.deleteRecordModal?.hide(), 10);
  }

  confirmDelete(id?: any) {
    if (id) {
      this.pendingDelete = true;
      this.store.dispatch(deleteplatData({ id: id.toString() }));
      return;
    }

    if (this.checkedValGet?.length > 0) {
      this.pendingDelete = true;
      this.store.dispatch(deletemultipleplatData({ id: this.checkedValGet.join(',') }));
      return;
    }

    this.toastService.error('Aucun plat sélectionné pour suppression.', 'Erreur');
    this.closeDeleteModal();
  }

  private afterDeleteActions() {
    this.closeDeleteModal();
    this.masterSelected = false;
    this.deleteID = null;
    this.checkedValGet = [];
  }

  // ── Sélection ───────────────────────────────────────────────

  checkUncheckAll(ev: any) {
    if (!this.plats) return;
    this.plats.forEach(x => { if (x) x.state = ev.target.checked; });
    this.masterSelected = ev.target.checked;
    this.updateCheckedValues();
  }

  onCheckboxChange(_e: any) {
    this.updateCheckedValues();
  }

  private updateCheckedValues() {
    this.checkedValGet = this.plats
      .filter(p => p?.state === true)
      .map(p => p.id);
  }

  // ── Tri ─────────────────────────────────────────────────────

  onSort(column: string) {
    this.direction = this.direction === 'asc' ? 'desc' : 'asc';
    const sorted = [...this.plats];
    sorted.sort((a, b) => {
      const res = this.compare((a as any)[column], (b as any)[column]);
      return this.direction === 'asc' ? res : -res;
    });
    this.plats = sorted;
  }

  compare(v1: any, v2: any): number {
    return v1 < v2 ? -1 : v1 > v2 ? 1 : 0;
  }

  // ── Recherche ───────────────────────────────────────────────

  filterdata() {
    this.searchTerms.next((this.term ?? '').trim());
  }

  updateNoResultDisplay() {
    const noResultElement = document.querySelector('.noresult') as HTMLElement;
    if (!noResultElement) return;
    noResultElement.style.display = (this.term && this.plats.length === 0) ? 'block' : 'none';
  }

  // ── Pagination ──────────────────────────────────────────────

  pageChanged(event: PageChangedEvent): void {
    this.loadData(event.page);
  }

  // ── Utilitaires images ──────────────────────────────────────

  isImage(path: string): boolean {
    return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].some(
      ext => path?.toLowerCase().endsWith(ext)
    );
  }

  getFullUrl(path: string): string {
    return this.baseUrl + path;
  }

  getFileName(path: string): string {
    return path?.split('/').pop() ?? 'Document';
  }
}
