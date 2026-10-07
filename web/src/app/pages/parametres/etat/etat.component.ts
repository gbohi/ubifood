// src/app/pages/etat/etat.component.ts

import { Component, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { Store } from '@ngrx/store';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';

import {
  addetatData,
  deleteetatData,
  deletemultipleetatData,
  fetchetatData,
  updateetatData,
} from 'src/app/store/Etat/etat.action';
import {
  selectetatData,
  selectTotalItems,
  selectLoading,
  selectCurrentPage,
} from 'src/app/store/Etat/etat-selector';

@Component({
  selector: 'app-etat',
  templateUrl: './etat.component.html',
  styleUrl: './etat.component.scss',
  providers: [DecimalPipe, DatePipe],
})
export class EtatComponent implements OnInit, AfterViewInit {

  breadCrumbItems = [
    { label: 'Référentiels', active: false },
    { label: 'États', active: true },
  ];

  etats:    any[] = [];
  etatList: any[] = [];
  totalItems  = 0;
  currentPage = 1;
  isLoading   = true;

  etatForm!: UntypedFormGroup;
  submitted      = false;
  masterSelected = false;
  term: any;
  checkedValGet: any[] = [];
  selectedEtat: any   = null;
  deleteID: any;
  direction = 'asc';

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

    this.store.select(selectLoading).subscribe(loading => {
      this.isLoading = loading;
    });

    this.store.select(selectTotalItems).subscribe(total => {
      this.totalItems = total ?? 0;
    });

    this.store.select(selectCurrentPage).subscribe(page => {
      this.currentPage = page ?? 1;
    });

    this.store.select(selectetatData).subscribe(data => {
      if (data) {
        this.etats    = data.map(item => ({ ...item, state: false }));
        this.etatList = [...this.etats];
        this.updateNoResultDisplay();
      }
    });

    this.loadData(1);
  }

  ngAfterViewInit(): void {
    this.addEtat?.onHidden.subscribe(() => {
      this.etatForm.reset();
      this.setModalTitle('Ajouter un état');
      this.setModalBtn('Ajouter');
    });

    this.deleteRecordModal?.onHidden.subscribe(() => {
      this.deleteID = null;
    });
  }

  // ── Chargement ────────────────────────────────────────────
  loadData(page: number = 1): void {
    this.store.dispatch(fetchetatData({ page }));
  }

  // ── Modal Ajouter ─────────────────────────────────────────
  openAddModal(): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.etatForm.reset();
    this.setModalTitle('Ajouter un état');
    this.setModalBtn('Ajouter');
    this.addEtat?.show();
  }

  closeAddModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => {
      this.addEtat?.hide();
      this.setModalTitle('Ajouter un état');
      this.setModalBtn('Ajouter');
    }, 10);
  }

  // ── Modal Édition ─────────────────────────────────────────
  editList(id: any): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    const editData = this.etats.find(p => p.id === id);
    if (!editData) return;

    this.etatForm.patchValue(editData);
    this.setModalTitle('Modifier l\'état');
    this.setModalBtn('Mettre à jour');
    this.addEtat?.show();
  }

  // ── Sauvegarde (ajout / mise à jour) ─────────────────────
  saveProperty(): void {
    this.submitted = true;
    if (this.etatForm.invalid) {
      this.toastService.error('Veuillez vérifier les informations saisies.', 'Erreur');
      return;
    }

    const formValue = { ...this.etatForm.value };

    if (formValue.id) {
      this.store.dispatch(updateetatData({ updatedData: formValue }));
      this.toastService.success('État mis à jour avec succès !', 'Succès');
    } else {
      delete formValue.id;
      this.store.dispatch(addetatData({ newData: formValue }));
      this.toastService.success('État ajouté avec succès !', 'Succès');
    }

    this.submitted = false;
    this.etatForm.reset();
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
      this.store.dispatch(deleteetatData({ id: id.toString() }));
      this.toastService.success('État supprimé avec succès !', 'Succès');
      this.afterDeleteActions();
      return;
    }

    if (this.checkedValGet?.length > 0) {
      this.store.dispatch(deletemultipleetatData({ id: this.checkedValGet.join(',') }));
      this.toastService.success('États supprimés avec succès !', 'Succès');
      this.afterDeleteActions();
      return;
    }

    this.toastService.error('Aucun état sélectionné.', 'Erreur');
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
  }

  // ── Tri ───────────────────────────────────────────────────
  onSort(column: string): void {
    this.direction = this.direction === 'asc' ? 'desc' : 'asc';
    this.etats = [...this.etats].sort((a, b) => {
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
      this.etats = this.etatList.filter(el =>
        el.libelle_etat?.toLowerCase().includes(this.term.toLowerCase()) ||
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
    el.style.display = this.term && this.etats.length === 0 ? 'block' : 'none';
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
