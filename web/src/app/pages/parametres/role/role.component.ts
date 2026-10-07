// src/app/pages/role/role.component.ts

import { Component, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { Store } from '@ngrx/store';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';

import {
  addroleData, deleteroleData, deletemultipleroleData,
  fetchroleData, updateroleData,
} from 'src/app/store/Role/role.action';
import {
  selectroleData, selectTotalItems, selectLoading, selectCurrentPage,
} from 'src/app/store/Role/role-selector';

@Component({
  selector: 'app-role',
  templateUrl: './role.component.html',
  styleUrl: './role.component.scss',
  providers: [DecimalPipe, DatePipe],
})
export class RoleComponent implements OnInit, AfterViewInit {

  breadCrumbItems = [
    { label: 'Administration', active: false },
    { label: 'Rôles', active: true },
  ];

  roles:       any[] = [];
  roleList:    any[] = [];
  totalItems   = 0;
  currentPage  = 1;
  isLoading    = true;

  roleForm!:     UntypedFormGroup;
  submitted      = false;
  masterSelected = false;
  term: any;
  checkedValGet: any[] = [];
  selectedRole:  any   = null;
  deleteID: any;
  direction = 'asc';

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

    this.store.select(selectLoading).subscribe(v => {
      this.isLoading = v;
      document.getElementById('elmLoader')?.classList.toggle('d-none', !v);
    });

    this.store.select(selectTotalItems).subscribe(v => { this.totalItems = v ?? 0; });
    this.store.select(selectCurrentPage).subscribe(v => { this.currentPage = v ?? 1; });

    this.store.select(selectroleData).subscribe(data => {
      if (data) {
        this.roles    = data.map(item => ({ ...item, state: false }));
        this.roleList = [...this.roles];
        this.updateNoResultDisplay();
      }
    });

    this.loadData(1);
  }

  ngAfterViewInit(): void {
    this.addRole?.onHidden.subscribe(() => {
      this.roleForm.reset();
      this.submitted = false;
      const t = document.querySelector('.modal-title') as HTMLElement;
      if (t) t.innerHTML = 'Ajouter un rôle';
      const b = document.getElementById('add-btn') as HTMLElement;
      if (b) b.innerHTML = 'Ajouter';
    });

    this.deleteRecordModal?.onHidden.subscribe(() => { this.deleteID = null; });
  }

  loadData(page: number = 1): void {
    this.store.dispatch(fetchroleData({ page }));
  }

  // ── Modals ─────────────────────────────────────────────────
  openAddModal(): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.roleForm.reset();
    this.submitted = false;
    const t = document.querySelector('.modal-title') as HTMLElement;
    if (t) t.innerHTML = 'Ajouter un rôle';
    const b = document.getElementById('add-btn') as HTMLElement;
    if (b) b.innerHTML = 'Ajouter';
    this.addRole?.show();
  }

  closeAddModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => {
      this.addRole?.hide();
      const t = document.querySelector('.modal-title') as HTMLElement;
      if (t) t.innerHTML = 'Ajouter un rôle';
      const b = document.getElementById('add-btn') as HTMLElement;
      if (b) b.innerHTML = 'Ajouter';
    }, 10);
  }

  editList(id: any): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    const editData = this.roles.find(r => r.id === id);
    if (!editData) return;

    this.roleForm.patchValue(editData);
    this.submitted = false;

    const t = document.querySelector('.modal-title') as HTMLElement;
    if (t) t.innerHTML = 'Modifier le rôle';
    const b = document.getElementById('add-btn') as HTMLElement;
    if (b) b.innerHTML = 'Mettre à jour';
    this.addRole?.show();
  }

  saveProperty(): void {
    this.submitted = true;
    if (this.roleForm.invalid) {
      this.toastService.error('Veuillez vérifier les informations saisies.', 'Erreur');
      return;
    }

    const formValue = { ...this.roleForm.value };
    if (!formValue.id) delete formValue.id;

    if (this.roleForm.get('id')?.value) {
      this.store.dispatch(updateroleData({ updatedData: formValue }));
      this.toastService.success('Rôle mis à jour avec succès !', 'Succès');
    } else {
      this.store.dispatch(addroleData({ newData: formValue }));
      this.toastService.success('Rôle ajouté avec succès !', 'Succès');
    }

    this.submitted = false;
    this.closeAddModal();
  }

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
      this.store.dispatch(deleteroleData({ id: id.toString() }));
      this.toastService.success('Rôle supprimé avec succès !', 'Succès');
      this.afterDeleteActions(); return;
    }
    if (this.checkedValGet?.length > 0) {
      this.store.dispatch(deletemultipleroleData({ id: this.checkedValGet.join(',') }));
      this.toastService.success('Rôles supprimés avec succès !', 'Succès');
      this.afterDeleteActions(); return;
    }
    this.toastService.error('Aucun rôle sélectionné.', 'Erreur');
    this.closeDeleteModal();
  }

  private afterDeleteActions(): void {
    this.closeDeleteModal();
    this.masterSelected = false;
    this.deleteID       = null;
    this.checkedValGet  = [];
  }

  viewDetails(id: any): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    const data = this.roles.find(r => r.id === id);
    if (data) { this.selectedRole = data; this.viewRole?.show(); }
    else this.toastService.error('Rôle introuvable', 'Erreur');
  }

  closeViewModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => { this.viewRole?.hide(); this.selectedRole = null; }, 10);
  }

  // ── Checkboxes ─────────────────────────────────────────────
  checkUncheckAll(ev: any): void {
    this.roles.forEach(x => x.state = ev.target.checked);
    this.masterSelected = ev.target.checked;
    this.updateCheckedValues();
  }

  onCheckboxChange(): void { this.updateCheckedValues(); }

  private updateCheckedValues(): void {
    this.checkedValGet = this.roles.filter(r => r.state === true).map(r => r.id);
  }

  // ── Tri ────────────────────────────────────────────────────
  onSort(column: string): void {
    this.direction = this.direction === 'asc' ? 'desc' : 'asc';
    this.roles = [...this.roles].sort((a, b) => {
      const res = this.compare(a[column], b[column]);
      return this.direction === 'asc' ? res : -res;
    });
  }

  compare(v1: string | number, v2: string | number): number {
    return v1 < v2 ? -1 : v1 > v2 ? 1 : 0;
  }

  // ── Recherche ──────────────────────────────────────────────
  filterdata(): void {
    if (this.term) {
      this.roles = this.roleList.filter(el =>
        el.name?.toLowerCase().includes(this.term.toLowerCase()) ||
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
    el.style.display = this.term && this.roles.length === 0 ? 'block' : 'none';
  }

  // ── Pagination ─────────────────────────────────────────────
  pageChanged(event: PageChangedEvent): void { this.loadData(event.page); }
}
