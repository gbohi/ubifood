// src/app/pages/role/role.component.ts

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
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import {
  addroleData, addroleDataSuccess, addroleDataFailure,
  deleteroleData, deleteroleSuccess, deleteroleFailure,
  deletemultipleroleData, deletemultipleroleSuccess, deletemultipleroleFailure,
  fetchroleData,
  updateroleData, updateroleDataSuccess, updateroleDataFailure,
} from 'src/app/store/Role/role.action';
import {
  selectroleData, selectTotalItems, selectLoading, selectCurrentPage,
} from 'src/app/store/Role/role-selector';
import { TriServeur } from 'src/app/shared/tri-serveur';

/** Rôles système (non modifiables / non supprimables côté serveur) */
export const ROLES_SYSTEME: Record<string, string> = {
  super_admin:  'Super administrateur',
  admin:        'Administrateur',
  gestionnaire: 'Gestionnaire',
  employe:      'Employé',
};

@Component({
  selector: 'app-role',
  templateUrl: './role.component.html',
  styleUrl: './role.component.scss',
  providers: [DecimalPipe, DatePipe],
})
export class RoleComponent implements OnInit, AfterViewInit {

  // Tri serveur des colonnes : clé de colonne → champ autorisé par l'API (ordering_fields)
  readonly tri = new TriServeur({ id: 'id', name: 'name' });

  private destroyRef = inject(DestroyRef);
  private actions$   = inject(Actions);

  breadCrumbItems = [
    { label: 'Paramètres', active: false },
    { label: 'Rôles', active: true },
  ];

  roles:       any[] = [];
  roleList:    any[] = [];
  totalItems   = 0;
  currentPage  = 1;
  isLoading    = true;

  roleForm!:     UntypedFormGroup;
  submitted      = false;
  isEdit         = false;
  saving         = false;
  deleting       = false;
  masterSelected = false;
  term: any;
  checkedValGet: any[] = [];
  selectedRole:  any   = null;
  deleteID: any;
  private readonly search$ = new Subject<string>();

  private lastActiveElement: HTMLElement | null = null;

  @ViewChild('addRole',           { static: false }) addRole?:           ModalDirective;
  @ViewChild('deleteRecordModal', { static: false }) deleteRecordModal?: ModalDirective;
  @ViewChild('viewRole',          { static: false }) viewRole?:          ModalDirective;
  @ViewChild('mainContainer',     { static: false }) mainContainer?:     ElementRef;

  constructor(
    private fb: UntypedFormBuilder,
    private toastService: ToastrService,
    private store: Store,
  ) {}

  ngOnInit(): void {
    this.roleForm = this.fb.group({
      id:   [''],
      name: ['', [Validators.required]],
    });

    this.store.select(selectLoading).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => { this.isLoading = v; });
    this.store.select(selectTotalItems).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => { this.totalItems = v ?? 0; });
    this.store.select(selectCurrentPage).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => { this.currentPage = v ?? 1; });

    this.store.select(selectroleData).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(data => {
      if (data) {
        this.roleList = data.map(item => ({ ...item, state: false }));
        this.roles = [...this.roleList];
        this.resetSelection();
      }
    });

    // ── Réponses du serveur (ajout / modification) ─────────
    this.actions$.pipe(ofType(addroleDataSuccess, updateroleDataSuccess), takeUntilDestroyed(this.destroyRef))
      .subscribe(action => {
        this.saving    = false;
        this.submitted = false;
        this.toastService.success(
          action.type === addroleDataSuccess.type ? 'Rôle ajouté avec succès !' : 'Rôle mis à jour avec succès !',
          'Succès'
        );
        this.closeAddModal();
      });

    this.actions$.pipe(ofType(addroleDataFailure, updateroleDataFailure), takeUntilDestroyed(this.destroyRef))
      .subscribe(({ error }) => {
        this.saving = false;
        this.toastService.error(error || 'Enregistrement impossible.', 'Erreur');
      });

    // ── Réponses du serveur (suppression) ──────────────────
    this.actions$.pipe(ofType(deleteroleSuccess, deletemultipleroleSuccess), takeUntilDestroyed(this.destroyRef))
      .subscribe(action => {
        this.toastService.success(
          action.type === deleteroleSuccess.type ? 'Rôle supprimé avec succès !' : 'Rôles supprimés avec succès !',
          'Succès'
        );
        this.afterDeleteActions();
      });

    this.actions$.pipe(ofType(deleteroleFailure, deletemultipleroleFailure), takeUntilDestroyed(this.destroyRef))
      .subscribe(({ error }) => {
        this.deleting = false;
        this.toastService.error(error || 'Suppression impossible.', 'Erreur');
        this.closeDeleteModal();
      });

    // Recherche côté serveur (?search= : nom technique ou libellé français), relancée sur la page 1
    this.search$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadData(1));

    this.loadData(1);
  }

  ngAfterViewInit(): void {
    this.addRole?.onHidden.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.roleForm.reset();
      this.submitted = false;
      this.saving    = false;
      this.isEdit    = false;
    });

    this.deleteRecordModal?.onHidden.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.deleteID = null;
      this.deleting = false;
    });
  }

  // Charger les données (page + terme de recherche + tri courants)
  loadData(page: number = 1): void {
    const search = (this.term ?? '').toString().trim();
    this.store.dispatch(fetchroleData({ page, search, ordering: this.tri.ordering }));
  }

  // ── Rôles système ──────────────────────────────────────────
  isSystemRole(role: any): boolean {
    return !!role && Object.prototype.hasOwnProperty.call(ROLES_SYSTEME, role.name);
  }

  roleLabel(name: string | null | undefined): string {
    return (name && ROLES_SYSTEME[name]) || '';
  }

  private resetSelection(): void {
    this.roleList.forEach(r => r.state = false);
    this.checkedValGet  = [];
    this.masterSelected = false;
  }

  // ── Modals ─────────────────────────────────────────────────
  openAddModal(): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.roleForm.reset();
    this.submitted = false;
    this.isEdit    = false;
    this.addRole?.show();
  }

  closeAddModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => this.addRole?.hide(), 10);
  }

  editList(id: any): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    const editData = this.roleList.find(r => r.id === id);
    if (!editData) return;
    if (this.isSystemRole(editData)) {
      this.toastService.warning('Les rôles système ne peuvent pas être modifiés.', 'Information');
      return;
    }

    this.roleForm.reset();
    this.roleForm.patchValue(editData);
    this.submitted = false;
    this.isEdit    = true;
    this.addRole?.show();
  }

  saveProperty(): void {
    this.submitted = true;
    if (this.roleForm.invalid) {
      this.toastService.error('Veuillez vérifier les informations saisies.', 'Erreur');
      return;
    }
    if (this.saving) return;

    const formValue = { ...this.roleForm.value };
    if (!formValue.id) delete formValue.id;
    this.saving = true;

    if (formValue.id) {
      this.store.dispatch(updateroleData({ updatedData: formValue }));
    } else {
      this.store.dispatch(addroleData({ newData: formValue }));
    }
    // Toast + fermeture de la modale à la réponse du serveur (voir ngOnInit)
  }

  removeItem(id: any): void {
    const role = this.roleList.find(r => r.id === id);
    if (this.isSystemRole(role)) {
      this.toastService.warning('Les rôles système ne peuvent pas être supprimés.', 'Information');
      return;
    }
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
      const name = this.roleList.find(r => r.id === this.deleteID)?.name;
      return name ? `le rôle « ${name} »` : 'ce rôle';
    }
    const n = this.checkedValGet.length;
    return n > 1 ? `ces ${n} rôles` : 'ce rôle';
  }

  confirmDelete(id?: any): void {
    if (this.deleting) return;

    if (id) {
      this.deleting = true;
      this.store.dispatch(deleteroleData({ id: id.toString() }));
      return;
    }
    if (this.checkedValGet?.length > 0) {
      this.deleting = true;
      this.store.dispatch(deletemultipleroleData({ id: this.checkedValGet.join(',') }));
      return;
    }
    this.toastService.error('Aucun rôle sélectionné.', 'Erreur');
    this.closeDeleteModal();
  }

  private afterDeleteActions(): void {
    this.closeDeleteModal();
    this.deleting = false;
    this.deleteID = null;
    this.resetSelection();
  }

  viewDetails(id: any): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    const data = this.roleList.find(r => r.id === id);
    if (data) { this.selectedRole = data; this.viewRole?.show(); }
    else this.toastService.error('Rôle introuvable', 'Erreur');
  }

  closeViewModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => { this.viewRole?.hide(); this.selectedRole = null; }, 10);
  }

  // ── Checkboxes (rôles système exclus) ──────────────────────
  get selectableRoles(): any[] {
    return this.roles.filter(r => !this.isSystemRole(r));
  }

  checkUncheckAll(ev: any): void {
    const checked = ev.target.checked;
    this.roles.forEach(x => x.state = checked && !this.isSystemRole(x));
    this.masterSelected = checked;
    this.updateCheckedValues();
  }

  onCheckboxChange(): void { this.updateCheckedValues(); }

  private updateCheckedValues(): void {
    this.checkedValGet = this.roles
      .filter(r => r.state === true && !this.isSystemRole(r))
      .map(r => r.id);
    const selectable = this.selectableRoles.length;
    this.masterSelected = selectable > 0 && this.checkedValGet.length === selectable;
  }

  // Tri côté serveur (?ordering=) : s'applique à toutes les données, pas seulement à la page affichée.
  // Un nouveau clic inverse le sens ; la recherche courante est conservée et on revient à la page 1.
  onSort(column: string): void {
    if (this.tri.basculer(column)) this.loadData(1);
  }

  // ── Recherche (côté serveur, debounce 300 ms) ──────────────
  filterdata(value?: string): void {
    if (value !== undefined) this.term = value;
    this.search$.next((this.term ?? '').toString().trim());
  }

  // ── Pagination ─────────────────────────────────────────────
  // (le terme de recherche et le tri sont conservés)
  pageChanged(event: PageChangedEvent): void {
    if (event.page === this.currentPage) return;
    this.loadData(event.page);
  }
}
