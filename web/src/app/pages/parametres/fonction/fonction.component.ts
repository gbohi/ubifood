// src/app/pages/fonction/fonction.component.ts

import { Component, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { Store } from '@ngrx/store';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';

import {
  addfonctionData,
  deletefonctionData,
  deletemultiplefonctionData,
  fetchfonctionData,
  updatefonctionData,
} from 'src/app/store/Fonction/fonction.action';
import {
  selectfonctionData,
  selectTotalItems,
  selectLoading,
  selectCurrentPage,
} from 'src/app/store/Fonction/fonction-selector';

@Component({
  selector: 'app-fonction',
  templateUrl: './fonction.component.html',
  styleUrl: './fonction.component.scss',
  providers: [DecimalPipe, DatePipe],
})
export class FonctionComponent implements OnInit, AfterViewInit {

  breadCrumbItems = [
    { label: 'Fonction', active: false },
    { label: 'Liste', active: true },
  ];

  fonctions:    any[] = [];
  fonctionList: any[] = [];
  totalItems  = 0;
  currentPage = 1;
  isLoading   = true;

  fonctionForm!: UntypedFormGroup;
  submitted     = false;
  masterSelected = false;
  term: any;
  checkedValGet: any[] = [];
  selectedFonction: any = null;
  deleteID: any;
  direction = 'asc';

  private lastActiveElement: HTMLElement | null = null;

  @ViewChild('addFonction',       { static: false }) addFonction?:       ModalDirective;
  @ViewChild('deleteRecordModal', { static: false }) deleteRecordModal?: ModalDirective;
  @ViewChild('viewFonction',      { static: false }) viewFonction?:      ModalDirective;
  @ViewChild('mainContainer',     { static: false }) mainContainer?:     ElementRef;

  constructor(
    private fb: UntypedFormBuilder,
    private toastService: ToastrService,
    private store: Store,
  ) {}

  ngOnInit(): void {
    this.fonctionForm = this.fb.group({
      id:      [''],
      libelle: ['', [Validators.required]],
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

    this.store.select(selectfonctionData).subscribe(data => {
      if (data) {
        this.fonctions    = data.map(item => ({ ...item, state: false }));
        this.fonctionList = [...this.fonctions];
        this.updateNoResultDisplay();
      }
    });

    this.loadData(1);
  }

  ngAfterViewInit(): void {
    this.addFonction?.onHidden.subscribe(() => {
      this.fonctionForm.reset();
      this.setModalTitle('Ajouter une fonction');
      this.setModalBtn('Ajouter');
    });

    this.deleteRecordModal?.onHidden.subscribe(() => {
      this.deleteID = null;
    });
  }

  // ── Chargement ────────────────────────────────────────────
  loadData(page: number = 1): void {
    this.store.dispatch(fetchfonctionData({ page }));
  }

  // ── Modal Ajouter ─────────────────────────────────────────
  openAddModal(): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.fonctionForm.reset();
    this.setModalTitle('Ajouter une fonction');
    this.setModalBtn('Ajouter');
    this.addFonction?.show();
  }

  closeAddModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => {
      this.addFonction?.hide();
      this.setModalTitle('Ajouter une fonction');
      this.setModalBtn('Ajouter');
    }, 10);
  }

  // ── Modal Édition ─────────────────────────────────────────
  editList(id: any): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    const editData = this.fonctions.find(p => p.id === id);
    if (!editData) return;

    this.fonctionForm.patchValue(editData);
    this.setModalTitle('Modifier la fonction');
    this.setModalBtn('Mettre à jour');
    this.addFonction?.show();
  }

  // ── Sauvegarde (ajout / mise à jour) ─────────────────────
  saveProperty(): void {
    this.submitted = true;
    if (this.fonctionForm.invalid) {
      this.toastService.error('Veuillez vérifier les informations saisies.', 'Erreur');
      return;
    }

    const formValue = { ...this.fonctionForm.value };

    if (formValue.id) {
      this.store.dispatch(updatefonctionData({ updatedData: formValue }));
      this.toastService.success('Fonction mise à jour avec succès !', 'Succès');
    } else {
      delete formValue.id;
      this.store.dispatch(addfonctionData({ newData: formValue }));
      this.toastService.success('Fonction ajoutée avec succès !', 'Succès');
    }

    this.submitted = false;
    this.fonctionForm.reset();
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
      this.store.dispatch(deletefonctionData({ id: id.toString() }));
      this.toastService.success('Fonction supprimée avec succès !', 'Succès');
      this.afterDeleteActions();
      return;
    }

    if (this.checkedValGet?.length > 0) {
      this.store.dispatch(deletemultiplefonctionData({ id: this.checkedValGet.join(',') }));
      this.toastService.success('Fonctions supprimées avec succès !', 'Succès');
      this.afterDeleteActions();
      return;
    }

    this.toastService.error('Aucune fonction sélectionnée.', 'Erreur');
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
    const fonctionData = this.fonctions.find(p => p.id === id);
    if (fonctionData) {
      this.selectedFonction = fonctionData;
      this.viewFonction?.show();
    } else {
      this.toastService.error('Fonction introuvable', 'Erreur');
    }
  }

  closeViewModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => {
      this.viewFonction?.hide();
      this.selectedFonction = null;
    }, 10);
  }

  // ── Checkboxes ────────────────────────────────────────────
  checkUncheckAll(ev: any): void {
    this.fonctions.forEach(x => x.state = ev.target.checked);
    this.masterSelected = ev.target.checked;
    this.updateCheckedValues();
  }

  onCheckboxChange(): void {
    this.updateCheckedValues();
  }

  private updateCheckedValues(): void {
    this.checkedValGet = this.fonctions
      .filter(f => f.state === true)
      .map(f => f.id);
  }

  // ── Tri ───────────────────────────────────────────────────
  onSort(column: string): void {
    this.direction = this.direction === 'asc' ? 'desc' : 'asc';
    this.fonctions = [...this.fonctions].sort((a, b) => {
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
      this.fonctions = this.fonctionList.filter(el =>
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
    el.style.display = this.term && this.fonctions.length === 0 ? 'block' : 'none';
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
