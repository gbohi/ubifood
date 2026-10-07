// src/app/pages/poste/poste.component.ts

import { Component, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { Store } from '@ngrx/store';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';

// ── Poste store ────────────────────────────────────────────────
import {
  addposteData,
  deleteposteData,
  deletemultipleposteData,
  fetchposteData,
  updateposteData,
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

  breadCrumbItems = [
    { label: 'RH', active: false },
    { label: 'Postes', active: true },
  ];

  postes:      any[] = [];
  posteList:   any[] = [];
  fonctions:   any[] = [];
  services:    any[] = [];
  totalItems  = 0;
  currentPage = 1;
  isLoading   = true;

  posteForm!: UntypedFormGroup;
  submitted      = false;
  masterSelected = false;
  term: any;
  checkedValGet:   any[] = [];
  selectedPoste:   any   = null;
  deleteID: any;
  direction = 'asc';

  private lastActiveElement: HTMLElement | null = null;

  @ViewChild('addPoste',          { static: false }) addPoste?:          ModalDirective;
  @ViewChild('deleteRecordModal', { static: false }) deleteRecordModal?: ModalDirective;
  @ViewChild('viewPoste',         { static: false }) viewPoste?:         ModalDirective;
  @ViewChild('mainContainer',     { static: false }) mainContainer?:     ElementRef;

  constructor(
    private fb: UntypedFormBuilder,
    private toastService: ToastrService,
    private store: Store,
  ) {}

  ngOnInit(): void {
    this.posteForm = this.fb.group({
      id:       [''],
      libelle:  ['', [Validators.required]],
      fonction: ['', [Validators.required]],
      service:  ['', [Validators.required]],
    });

    this.store.select(selectLoading).subscribe(v => this.isLoading = v);
    this.store.select(selectTotalItems).subscribe(v => this.totalItems = v ?? 0);
    this.store.select(selectCurrentPage).subscribe(v => this.currentPage = v ?? 1);

    this.store.select(selectposteData).subscribe(data => {
      if (data) {
        this.postes    = data.map(item => ({ ...item, state: false }));
        this.posteList = [...this.postes];
        this.updateNoResultDisplay();
      }
    });

    // ── Charger les fonctions pour le select ───────────────
    this.store.dispatch(fetchfonctionNoPaginateData());
    this.store.select(selectAllFonctionWithoutPagination).subscribe(data => {
      this.fonctions = data ?? [];
    });

    // ── Charger les services pour le select ────────────────
    this.store.dispatch(fetchdepartementNoPaginateData());
    this.store.select(selectAllDepartementWithoutPagination).subscribe(data => {
      this.services = data ?? [];
    });

    this.loadData(1);
  }

  ngAfterViewInit(): void {
    this.addPoste?.onHidden.subscribe(() => {
      this.posteForm.reset();
      this.submitted = false;
      this.setModalTitle('Ajouter un poste');
      this.setModalBtn('Ajouter');
    });

    this.deleteRecordModal?.onHidden.subscribe(() => {
      this.deleteID = null;
    });
  }

  // ── Chargement ────────────────────────────────────────────
  loadData(page: number = 1): void {
    this.store.dispatch(fetchposteData({ page }));
  }

  // ── Modal Ajouter ─────────────────────────────────────────
  openAddModal(): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.submitted         = false;
    this.posteForm.reset();
    this.setModalTitle('Ajouter un poste');
    this.setModalBtn('Ajouter');
    this.addPoste?.show();
  }

  closeAddModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => {
      this.addPoste?.hide();
      this.setModalTitle('Ajouter un poste');
      this.setModalBtn('Ajouter');
    }, 10);
  }

  // ── Modal Édition ─────────────────────────────────────────
  editList(id: any): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    const editData         = this.postes.find(p => p.id === id);
    if (!editData) return;

    this.submitted = false;
    this.posteForm.patchValue(editData);
    this.setModalTitle('Modifier le poste');
    this.setModalBtn('Mettre à jour');
    this.addPoste?.show();
  }

  // ── Sauvegarde ────────────────────────────────────────────
  saveProperty(): void {
    this.submitted = true;
    if (this.posteForm.invalid) {
      this.toastService.error('Veuillez vérifier les informations saisies.', 'Erreur');
      return;
    }

    const formValue = { ...this.posteForm.value };

    if (formValue.id) {
      this.store.dispatch(updateposteData({ updatedData: formValue }));
      this.toastService.success('Poste mis à jour avec succès !', 'Succès');
    } else {
      delete formValue.id;
      this.store.dispatch(addposteData({ newData: formValue }));
      this.toastService.success('Poste ajouté avec succès !', 'Succès');
    }

    this.submitted = false;
    this.posteForm.reset();
    this.closeAddModal();
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
      this.store.dispatch(deleteposteData({ id: id.toString() }));
      this.toastService.success('Poste supprimé avec succès !', 'Succès');
      this.afterDeleteActions();
      return;
    }
    if (this.checkedValGet?.length > 0) {
      this.store.dispatch(deletemultipleposteData({ id: this.checkedValGet.join(',') }));
      this.toastService.success('Postes supprimés avec succès !', 'Succès');
      this.afterDeleteActions();
      return;
    }
    this.toastService.error('Aucun poste sélectionné.', 'Erreur');
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
    const data = this.postes.find(p => p.id === id);
    if (data) {
      this.selectedPoste = data;
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
      .filter(p => p.state === true)
      .map(p => p.id);
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

  // ── Recherche ─────────────────────────────────────────────
  filterdata(): void {
    if (this.term) {
      this.postes = this.posteList.filter(el =>
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
    el.style.display = this.term && this.postes.length === 0 ? 'block' : 'none';
  }

  // ── Pagination ────────────────────────────────────────────
  pageChanged(event: PageChangedEvent): void {
    this.loadData(event.page);
  }

  // ── Helpers modal ─────────────────────────────────────────
  private setModalTitle(title: string): void {
    const el = document.querySelector('.modal-title') as HTMLElement;
    if (el) el.innerHTML = title;
  }

  private setModalBtn(label: string): void {
    const el = document.getElementById('add-btn') as HTMLElement;
    if (el) el.innerHTML = label;
  }
}
