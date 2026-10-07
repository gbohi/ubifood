// src/app/pages/cantine/liste-menus/liste-menus.component.ts
import {
  Component, OnInit, ViewChild, ElementRef, DestroyRef, inject
} from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { Store } from '@ngrx/store';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';

import {
  fetchmenuData,
  addmenuData,
  updatemenuData,
  deletemenuData,
  deletemultiplemenuData,
} from 'src/app/store/Menu/menu.action';

import {
  selectmenuData,
  selectTotalItems,
  selectLoading,
  selectCurrentPage,
  selectSuccessMessage,
  selectErrorMessage,
} from 'src/app/store/Menu/menu-selector';

import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';

import { selectAllTypeequipeWithoutPagination } from 'src/app/store/Typeequipe/typeequipe-selector';
import { fetchtypeequipeNoPaginateData } from 'src/app/store/Typeequipe/typeequipe.action';

import { MenulistModel } from 'src/app/store/Menu/menu.model';
import { PlatModel } from 'src/app/store/Plat/plat.model';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-liste-menus',
  templateUrl: './liste-menus.component.html',
  styleUrl: './liste-menus.component.scss',
  providers: [DecimalPipe, DatePipe]
})
export class ListeMenusComponent implements OnInit {

  // ── Breadcrumb ──────────────────────────────────────────────
  breadCrumbItems!: Array<{}>;

  // ── Données ─────────────────────────────────────────────────
  menus: MenulistModel[] = [];
  menuList: MenulistModel[] = [];
  totalItems = 0;
  currentPage = 1;
  isLoading = true;

  agences: any[] = [];
  typeEquipes: any[] = [];

  /**
   * Liste complète de TOUS les plats — chargée via endpoint sans pagination.
   * Remplace l'ancienne approche qui ne chargeait que 10 plats (page 1).
   */
  platsDisponibles: PlatModel[] = [];
  isPlatsLoading = false;

  /**
   * IDs des plats sélectionnés pour le menu en cours de création/édition.
   */
  selectedPlatIds: number[] = [];

  // ── Formulaire ──────────────────────────────────────────────
  menuForm!: UntypedFormGroup;

  // ── Sélection / suppression ──────────────────────────────────
  masterSelected = false;
  checkedValGet: any[] = [];
  deleteID: any;
  term: any;

  // ── Détails ─────────────────────────────────────────────────
  selectedMenu: MenulistModel | null = null;

  // ── Tri ─────────────────────────────────────────────────────
  direction: 'asc' | 'desc' = 'asc';

  // ── URL backend ─────────────────────────────────────────────
  baseUrl = environment.apiUrl;
  private apiUrl = `${environment.apiUrl}/api/api`;

  // ── Accessibilité ───────────────────────────────────────────
  private lastActiveElement: HTMLElement | null = null;

  // ── ViewChild ───────────────────────────────────────────────
  @ViewChild('addMenu', { static: false }) addMenu?: ModalDirective;
  @ViewChild('deleteRecordModal', { static: false }) deleteRecordModal?: ModalDirective;
  @ViewChild('viewMenu', { static: false }) viewMenu?: ModalDirective;
  @ViewChild('mainContainer', { static: false }) mainContainer?: ElementRef;

  // ── DestroyRef ───────────────────────────────────────────────
  private destroyRef = inject(DestroyRef);

  constructor(
    private formBuilder: UntypedFormBuilder,
    public toastService: ToastrService,
    public store: Store,
    private http: HttpClient,
  ) {}

  ngOnInit(): void {
    this.breadCrumbItems = [
      { label: 'Cantine', active: false },
      { label: 'Liste des menus', active: true }
    ];

    this.menuForm = this.formBuilder.group({
      id: [''],
      date_menu: ['', [Validators.required]],
      agence: ['', [Validators.required]],
      typeequipe: ['', [Validators.required]],
    });

    // ── Abonnements store ────────────────────────────────────────

    this.store.select(selectLoading).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(loading => { this.isLoading = loading; });

    this.store.select(selectTotalItems).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(total => { this.totalItems = total ?? 0; });

    this.store.select(selectCurrentPage).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(page => { this.currentPage = page ?? 1; });

    this.store.select(selectmenuData).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(data => {
      if (data) {
        this.menus = data.map(item => ({ ...item, state: false }));
        this.menuList = [...this.menus];
        this.updateNoResultDisplay();
      }
    });

    this.store.select(selectAllAgenceWithoutPagination).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(data => { if (data) this.agences = data; });

    this.store.select(selectAllTypeequipeWithoutPagination).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(data => { if (data) this.typeEquipes = data; });

    // ── Feedback UI ──────────────────────────────────────────────

    this.store.select(selectSuccessMessage).pipe(
      takeUntilDestroyed(this.destroyRef),
      filter((msg): msg is string => !!msg)
    ).subscribe(msg => {
      this.toastService.success(msg, 'Succès');
      this.resetForm();
      this.closeAddModal();
    });

    this.store.select(selectErrorMessage).pipe(
      takeUntilDestroyed(this.destroyRef),
      filter((msg): msg is string => !!msg)
    ).subscribe(msg => {
      this.toastService.error(msg, 'Erreur');
    });

    this.loadData(1);
    this.loadTousLesPlats();
  }

  ngAfterViewInit() {
    this.addMenu?.onHidden.pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      this.resetForm();
      const title = document.querySelector('.modal-title') as HTMLElement;
      if (title) title.innerHTML = 'Ajouter un menu';
      const btn = document.getElementById('add-btn') as HTMLElement;
      if (btn) btn.innerHTML = 'Ajouter';
    });

    this.deleteRecordModal?.onHidden.pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => { this.deleteID = null; });
  }

  // ── Chargement ──────────────────────────────────────────────

  loadData(page: number = 1): void {
    this.store.dispatch(fetchmenuData({ page }));
    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.dispatch(fetchtypeequipeNoPaginateData());
  }

  /**
   * ✅ Charge TOUS les plats via l'endpoint sans pagination.
   * Remplace fetchplatData({ page: 1 }) qui ne retournait que 10 plats.
   * Endpoint Django : GET /api/api/allnopagin/plats/
   */
  private loadTousLesPlats(): void {
    this.isPlatsLoading = true;
    this.http.get<PlatModel[]>(`${this.apiUrl}/allnopagin/plats/`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (plats) => {
          this.platsDisponibles = plats ?? [];
          this.isPlatsLoading = false;
        },
        error: (err) => {
          console.error('Erreur chargement plats', err);
          this.toastService.error('Impossible de charger les plats.', 'Erreur');
          this.isPlatsLoading = false;
        },
      });
  }

  // ── Sélection des plats ──────────────────────────────────────

  onPlatCheckboxChange(platId: number, event: any): void {
    if (event.target.checked) {
      if (!this.selectedPlatIds.includes(platId)) {
        this.selectedPlatIds.push(platId);
      }
    } else {
      this.selectedPlatIds = this.selectedPlatIds.filter(id => id !== platId);
    }
  }

  isPlatSelected(platId: number): boolean {
    return this.selectedPlatIds.includes(platId);
  }

  // ── Formulaire ──────────────────────────────────────────────

  saveProperty(): void {
    if (!this.menuForm.valid) {
      this.toastService.error('Veuillez remplir tous les champs requis.', 'Erreur');
      return;
    }

    const isUpdate = !!this.menuForm.get('id')?.value;

    let dateMenu = this.menuForm.get('date_menu')?.value;
    if (dateMenu instanceof Date) {
      dateMenu = dateMenu.toISOString().split('T')[0];
    }

    const payload = {
      ...this.menuForm.value,
      date_menu: dateMenu,
      plat_ids: [...this.selectedPlatIds],
    };

    if (!payload.id) delete payload.id;

    if (isUpdate) {
      this.store.dispatch(updatemenuData({ updatedData: payload }));
    } else {
      this.store.dispatch(addmenuData({ newData: payload }));
    }
  }

  private resetForm(): void {
    this.menuForm.reset();
    this.selectedPlatIds = [];
  }

  // ── Modals ──────────────────────────────────────────────────

  closeAddModal(): void {
    if (this.lastActiveElement) this.lastActiveElement.focus();
    else document.body.focus();
    setTimeout(() => {
      this.addMenu?.hide();
      const title = document.querySelector('.modal-title') as HTMLElement;
      if (title) title.innerHTML = 'Ajouter un menu';
      const btn = document.getElementById('add-btn') as HTMLElement;
      if (btn) btn.innerHTML = 'Ajouter';
    }, 10);
  }

  editList(id: any): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.addMenu?.show();

    const title = document.querySelector('.modal-title') as HTMLElement;
    if (title) title.innerHTML = 'Modifier le menu';
    const btn = document.getElementById('add-btn') as HTMLElement;
    if (btn) btn.innerHTML = 'Mettre à jour';

    const editData = this.menus.find(m => m.id === id);
    if (editData) {
      const formattedData = { ...editData };
      if (formattedData.date_menu) {
        formattedData.date_menu = new Date(formattedData.date_menu + 'T00:00:00') as any;
      }
      this.menuForm.patchValue(formattedData);

      this.selectedPlatIds = editData.menu_plats
        ? editData.menu_plats.map(mp => mp.plat.id)
        : [];
    }
  }

  viewDetails(id: any): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    const menuData = this.menus.find(m => m.id === id);
    if (menuData) {
      this.selectedMenu = menuData;
      this.viewMenu?.show();
    } else {
      this.toastService.error('Menu introuvable', 'Erreur');
    }
  }

  closeViewModal(): void {
    if (this.lastActiveElement) this.lastActiveElement.focus();
    else document.body.focus();
    setTimeout(() => {
      this.viewMenu?.hide();
      this.selectedMenu = null;
    }, 10);
  }

  // ── Suppression ─────────────────────────────────────────────

  removeItem(id: any): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.deleteID = id;
    this.deleteRecordModal?.show();
  }

  closeDeleteModal(): void {
    if (this.lastActiveElement) this.lastActiveElement.focus();
    else document.body.focus();
    setTimeout(() => this.deleteRecordModal?.hide(), 10);
  }

  confirmDelete(id?: any): void {
    if (id) {
      this.store.dispatch(deletemenuData({ id: id.toString() }));
      this.afterDeleteActions();
      return;
    }
    if (this.checkedValGet?.length > 0) {
      this.store.dispatch(deletemultiplemenuData({ id: this.checkedValGet.join(',') }));
      this.afterDeleteActions();
      return;
    }
    this.toastService.error('Aucun menu sélectionné pour suppression.', 'Erreur');
    this.closeDeleteModal();
  }

  private afterDeleteActions(): void {
    this.closeDeleteModal();
    this.masterSelected = false;
    this.deleteID = null;
    this.checkedValGet = [];
  }

  // ── Sélection ───────────────────────────────────────────────

  checkUncheckAll(ev: any): void {
    if (!this.menus) return;
    this.menus.forEach(x => { if (x) x.state = ev.target.checked; });
    this.masterSelected = ev.target.checked;
    this.updateCheckedValues();
  }

  onCheckboxChange(_e: any): void {
    this.updateCheckedValues();
  }

  private updateCheckedValues(): void {
    this.checkedValGet = this.menus
      .filter(m => m?.state === true)
      .map(m => m.id);
  }

  // ── Tri ─────────────────────────────────────────────────────

  onSort(column: string): void {
    this.direction = this.direction === 'asc' ? 'desc' : 'asc';
    const sorted = [...this.menus];
    sorted.sort((a, b) => {
      const res = this.compare((a as any)[column], (b as any)[column]);
      return this.direction === 'asc' ? res : -res;
    });
    this.menus = sorted;
  }

  compare(v1: any, v2: any): number {
    return v1 < v2 ? -1 : v1 > v2 ? 1 : 0;
  }

  // ── Recherche ───────────────────────────────────────────────

  filterdata(): void {
    if (this.term) {
      this.menus = this.menuList.filter(el =>
        el.date_menu?.toLowerCase().includes(this.term.toLowerCase()) ||
        el.agence_nom?.toLowerCase().includes(this.term.toLowerCase()) ||
        el.typeequipe_libelle?.toLowerCase().includes(this.term.toLowerCase()) ||
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
    el.style.display = (this.term && this.menus.length === 0) ? 'block' : 'none';
  }

  // ── Pagination ──────────────────────────────────────────────

  pageChanged(event: PageChangedEvent): void {
    this.loadData(event.page);
  }

  // ── Utilitaires ─────────────────────────────────────────────

  getFullUrl(path: string): string {
    return this.baseUrl + path;
  }
}
