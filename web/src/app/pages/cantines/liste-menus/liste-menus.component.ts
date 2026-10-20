// src/app/pages/cantine/liste-menus/liste-menus.component.ts
import { filtrerAgencesGerees } from 'src/app/core/helpers/roles';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import {
  Component, OnInit, ViewChild, ElementRef, DestroyRef, inject
} from '@angular/core';
import { DecimalPipe, DatePipe, formatDate } from '@angular/common';
import { Actions, ofType } from '@ngrx/effects';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { Subject, filter } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
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
  addmenuDataSuccess, updatemenuDataSuccess,
  deletemenuSuccess, deletemultiplemenuSuccess,
  deletemenuFailure, deletemultiplemenuFailure,
} from 'src/app/store/Menu/menu.action';

import {
  selectmenuData,
  selectTotalItems,
  selectLoading,
  selectCurrentPage,
  selectErrorMessage,
} from 'src/app/store/Menu/menu-selector';

import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';

import { selectAllTypeequipeWithoutPagination } from 'src/app/store/Typeequipe/typeequipe-selector';
import { fetchtypeequipeNoPaginateData } from 'src/app/store/Typeequipe/typeequipe.action';

import { MenulistModel } from 'src/app/store/Menu/menu.model';
import { PlatModel } from 'src/app/store/Plat/plat.model';
import { environment } from 'src/environments/environment';
import { TriServeur } from 'src/app/shared/tri-serveur';

@Component({
  selector: 'app-liste-menus',
  templateUrl: './liste-menus.component.html',
  styleUrl: './liste-menus.component.scss',
  providers: [DecimalPipe, DatePipe]
})
export class ListeMenusComponent implements OnInit {

  // Tri serveur des colonnes : clé de colonne → champ autorisé par l'API (ordering_fields)
  readonly tri = new TriServeur({ id: 'id', date_menu: 'date_menu', agence_nom: 'agence__nom_agence', typeequipe_libelle: 'typeequipe__libelle', created_at: 'created_at' });
  // Un gestionnaire ne gère que les agences auxquelles il est rattaché
  private userConnecte = inject(TokenStorageService).getUser();

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
  private readonly search$ = new Subject<string>();
  private actions$ = inject(Actions);

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
    ).subscribe(data => { if (data) this.agences = filtrerAgencesGerees(data, this.userConnecte); });

    this.store.select(selectAllTypeequipeWithoutPagination).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(data => { if (data) this.typeEquipes = data; });

    // ── Feedback UI ──────────────────────────────────────────────

    // La fenêtre ne se ferme qu'une fois l'enregistrement confirmé par le serveur
    this.actions$.pipe(
      ofType(addmenuDataSuccess, updatemenuDataSuccess),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(action => {
      this.toastService.success(action.type === addmenuDataSuccess.type
        ? 'Menu créé avec succès !' : 'Menu mis à jour avec succès !', 'Succès');
      this.resetForm();
      this.closeAddModal();
    });

    this.actions$.pipe(
      ofType(deletemenuSuccess, deletemultiplemenuSuccess),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(action => {
      this.toastService.success(action.type === deletemenuSuccess.type
        ? 'Menu supprimé.' : 'Menus supprimés.', 'Succès');
      this.afterDeleteActions();
    });

    this.actions$.pipe(
      ofType(deletemenuFailure, deletemultiplemenuFailure),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => this.closeDeleteModal());

    this.store.select(selectErrorMessage).pipe(
      takeUntilDestroyed(this.destroyRef),
      filter((msg): msg is string => !!msg)
    ).subscribe(msg => {
      this.toastService.error(msg, 'Erreur');
    });

    // Recherche côté serveur (?search= : agence, équipe), relancée sur la page 1 (tri conservé)
    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => this.loadData(1));

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
    this.store.dispatch(fetchmenuData({ page, search: (this.term ?? '').toString().trim(), ordering: this.tri.ordering }));
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
    this.http.get<PlatModel[]>(`${this.apiUrl}/allnopagin/plats/?gerees=1`)
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
      // Date locale (toISOString passerait en UTC et pourrait reculer d'un jour)
      dateMenu = formatDate(dateMenu, 'yyyy-MM-dd', 'en-US');
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
      return;
    }
    if (this.checkedValGet?.length > 0) {
      this.store.dispatch(deletemultiplemenuData({ id: this.checkedValGet.join(',') }));
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

  // Tri côté serveur (?ordering=) : s'applique à toutes les données, pas seulement à la page affichée.
  // Un nouveau clic inverse le sens ; la recherche courante est conservée et on revient à la page 1.
  onSort(column: string): void {
    if (this.tri.basculer(column)) this.loadData(1);
  }

  // ── Recherche ───────────────────────────────────────────────

  // Recherche côté serveur (debounce 300 ms) : toutes les données, pas seulement la page affichée
  filterdata(): void {
    this.search$.next((this.term ?? '').toString().trim());
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
