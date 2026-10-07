// src/app/pages/prestataire/prestataire.component.ts

import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import {
  AbstractControl, UntypedFormBuilder, UntypedFormGroup,
  ValidationErrors, ValidatorFn, Validators,
} from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { Actions, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';
import { Subject } from 'rxjs';
import { filter, take, takeUntil } from 'rxjs/operators';

// ── Prestataire store ──────────────────────────────────────────
import {
  addprestataireData,
  addprestataireDataSuccess,
  deleteprestataireData,
  deletemultipleprestataireData,
  fetchprestataireData,
  updateprestataireData,
} from 'src/app/store/Prestataire/prestataire.action';
import {
  selectprestataireData,
  selectTotalItems,
  selectLoading,
  selectCurrentPage,
} from 'src/app/store/Prestataire/prestataire-selector';

// ── Statut store ───────────────────────────────────────────────
import { selectAllSatutWithoutPagination } from 'src/app/store/Statut/statut-selector';
import { fetchstatutNoPaginateData } from 'src/app/store/Statut/statut.action';

// ── Agence store ───────────────────────────────────────────────
import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';

// ── PlatPrestataire store ──────────────────────────────────────
import * as PlatPrestataireActions from 'src/app/store/PlatPrestataire/plat-prestataire.action';
import {
  selectTarifs,
  selectPlatPrestataireIsLoading,
  selectPlatPrestataireIsSubmitting,
} from 'src/app/store/PlatPrestataire/plat-prestataire-selector';
import { PlatPrestataireModel } from 'src/app/store/PlatPrestataire/plat-prestataire.model';

// ── AgencePrestataire store ────────────────────────────────────
import * as AgencePrestataireActions from 'src/app/store/AgencePrestataire/agence-prestataire.action';
import {
  selectAgences,
  selectAgencePrestataireIsLoading,
  selectAgencePrestataireIsSubmitting,
} from 'src/app/store/AgencePrestataire/agence-prestataire-selector';
import { AgencePrestataireModel } from 'src/app/store/AgencePrestataire/agence-prestataire.model';

// ── Validateur croisé date_fin >= date_debut ──────────────────
export const datefinValidator: ValidatorFn = (
  group: AbstractControl
): ValidationErrors | null => {
  const debut = group.get('date_debut')?.value;
  const fin   = group.get('date_fin')?.value;
  if (fin && debut && fin < debut) {
    return { datefinInvalide: true };
  }
  return null;
};

@Component({
  selector: 'app-prestataire',
  templateUrl: './prestataire.component.html',
  styleUrl: './prestataire.component.scss',
  providers: [DecimalPipe, DatePipe],
})
export class PrestataireComponent implements OnInit, AfterViewInit, OnDestroy {

  breadCrumbItems = [
    { label: 'Référentiels', active: false },
    { label: 'Prestataires', active: true },
  ];

  // ── Prestataire ───────────────────────────────────────────
  prestataires:    any[] = [];
  prestataireList: any[] = [];
  statuts:         any[] = [];
  agences:         any[] = [];
  totalItems  = 0;
  currentPage = 1;
  isLoading   = true;

  prestataireForm!: UntypedFormGroup;
  submitted      = false;
  masterSelected = false;
  term: any;
  checkedValGet:       any[] = [];
  selectedPrestataire: any   = null;
  deleteID: any;
  direction = 'asc';

  // ── PlatPrestataire ───────────────────────────────────────
  isTarifsLoading    = false;
  isTarifsSubmitting = false;
  currentPrestataireId: number | null = null;
  tarifLignes: PlatPrestataireModel[] = [];
  private tarifLignesSnapshot: PlatPrestataireModel[] = [];

  // ── AgencePrestataire ─────────────────────────────────────
  isAgencesLoading    = false;
  isAgencesSubmitting = false;
  agenceLignes: AgencePrestataireModel[] = [];
  private agenceLignesSnapshot: AgencePrestataireModel[] = [];

  private destroy$ = new Subject<void>();
  private lastActiveElement: HTMLElement | null = null;

  @ViewChild('addPrestataire',    { static: false }) addPrestataire?:    ModalDirective;
  @ViewChild('deleteRecordModal', { static: false }) deleteRecordModal?: ModalDirective;
  @ViewChild('viewPrestataire',   { static: false }) viewPrestataire?:   ModalDirective;
  @ViewChild('mainContainer',     { static: false }) mainContainer?:     ElementRef;

  constructor(
    private fb: UntypedFormBuilder,
    private toastService: ToastrService,
    private store: Store,
    private actions$: Actions,
  ) {}

  ngOnInit(): void {
    this.prestataireForm = this.fb.group(
      {
        id:         [''],
        libelle:    ['', [Validators.required]],
        date_debut: ['', [Validators.required]],
        date_fin:   [''],
        statut:     ['', [Validators.required]],
      },
      { validators: datefinValidator }
    );

    // ── Prestataire selectors ──────────────────────────────
    this.store.select(selectLoading)
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => this.isLoading = v);

    this.store.select(selectTotalItems)
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => this.totalItems = v ?? 0);

    this.store.select(selectCurrentPage)
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => this.currentPage = v ?? 1);

    this.store.select(selectprestataireData)
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        if (data) {
          this.prestataires    = data.map(item => ({ ...item, state: false }));
          this.prestataireList = [...this.prestataires];
          this.updateNoResultDisplay();
        }
      });

    // ── Statuts ────────────────────────────────────────────
    this.store.dispatch(fetchstatutNoPaginateData());
    this.store.select(selectAllSatutWithoutPagination)
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => this.statuts = data ?? []);

    // ── Agences ────────────────────────────────────────────
    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.select(selectAllAgenceWithoutPagination)
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => this.agences = data ?? []);

    // ── PlatPrestataire selectors ──────────────────────────
    this.store.select(selectPlatPrestataireIsLoading)
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => this.isTarifsLoading = v);

    this.store.select(selectPlatPrestataireIsSubmitting)
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => this.isTarifsSubmitting = v);

    // ── AgencePrestataire selectors ────────────────────────
    this.store.select(selectAgencePrestataireIsLoading)
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => this.isAgencesLoading = v);

    this.store.select(selectAgencePrestataireIsSubmitting)
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => this.isAgencesSubmitting = v);

    // ── SOLUTION 2 — Batch après création prestataire ──────
    this.actions$.pipe(
      ofType(addprestataireDataSuccess),
      takeUntil(this.destroy$)
    ).subscribe(({ newData }) => {
      if (newData?.id) {
        // Batch tarifs
        const tarifsACreer = this.tarifLignesSnapshot.filter(l => !l._isDeleted);
        if (tarifsACreer.length > 0) {
          this.store.dispatch(PlatPrestataireActions.savePlatPrestatairesBatch({
            prestataireId: newData.id,
            tarifs: tarifsACreer.map(l => ({
              montant:    l.montant,
              date_debut: l.date_debut,
              date_fin:   l.date_fin || null,
              statut:     l.statut,
            })),
          }));
        }
        // Batch agences
        const agencesACreer = this.agenceLignesSnapshot.filter(l => !l._isDeleted);
        if (agencesACreer.length > 0) {
          this.store.dispatch(AgencePrestataireActions.saveAgencePrestatairesBatch({
            prestataireId: newData.id,
            agences: agencesACreer.map(l => ({
              agence:     l.agence,
              date_debut: l.date_debut,
              date_fin:   l.date_fin || null,
              statut:     l.statut,
            })),
          }));
        }
      }
      this.tarifLignesSnapshot  = [];
      this.agenceLignesSnapshot = [];
    });

    this.loadData(1);
  }

  ngAfterViewInit(): void {
    this.addPrestataire?.onHidden.subscribe(() => {
      this.prestataireForm.reset();
      this.tarifLignes          = [];
      this.agenceLignes         = [];
      this.currentPrestataireId = null;
      this.submitted            = false;
      this.store.dispatch(PlatPrestataireActions.resetPlatPrestataire());
      this.store.dispatch(AgencePrestataireActions.resetAgencePrestataire());
      this.setModalTitle('Ajouter un prestataire');
      this.setModalBtn('Enregistrer');
    });

    this.deleteRecordModal?.onHidden.subscribe(() => {
      this.deleteID = null;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadData(page: number = 1): void {
    this.store.dispatch(fetchprestataireData({ page }));
  }

  // ── Helpers de mapping ────────────────────────────────────
  private mapTarifsToLignes(tarifs: PlatPrestataireModel[]): PlatPrestataireModel[] {
    return tarifs.map(t => ({
      ...t,
      date_debut: t.date_debut ? t.date_debut.split('T')[0] : '',
      date_fin:   t.date_fin   ? t.date_fin.split('T')[0]   : '',
      _isNew:     false,
      _isDeleted: false,
      _hasError:  false,
    }));
  }

  private mapAgencesToLignes(agences: AgencePrestataireModel[]): AgencePrestataireModel[] {
    return agences.map(a => ({
      ...a,
      date_debut: a.date_debut ? a.date_debut.split('T')[0] : '',
      date_fin:   a.date_fin   ? a.date_fin.split('T')[0]   : '',
      _isNew:     false,
      _isDeleted: false,
      _hasError:  false,
    }));
  }

  // ── Modal Ajouter ─────────────────────────────────────────
  openAddModal(): void {
    this.lastActiveElement    = document.activeElement as HTMLElement;
    this.currentPrestataireId = null;
    this.tarifLignes          = [];
    this.agenceLignes         = [];
    this.tarifLignesSnapshot  = [];
    this.agenceLignesSnapshot = [];
    this.submitted            = false;
    this.prestataireForm.reset();
    this.store.dispatch(PlatPrestataireActions.resetPlatPrestataire());
    this.store.dispatch(AgencePrestataireActions.resetAgencePrestataire());
    this.setModalTitle('Ajouter un prestataire');
    this.setModalBtn('Enregistrer');
    this.addPrestataire?.show();
  }

  closeAddModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => {
      this.addPrestataire?.hide();
      this.setModalTitle('Ajouter un prestataire');
      this.setModalBtn('Enregistrer');
    }, 10);
  }

  // ── Modal Édition ─────────────────────────────────────────
  editList(id: any): void {
    this.lastActiveElement    = document.activeElement as HTMLElement;
    const editData            = this.prestataires.find(p => p.id === id);
    if (!editData) return;

    this.currentPrestataireId = id;
    this.tarifLignesSnapshot  = [];
    this.agenceLignesSnapshot = [];
    this.tarifLignes          = [];
    this.agenceLignes         = [];
    this.submitted            = false;

    this.prestataireForm.patchValue({
      ...editData,
      date_debut: editData.date_debut ? editData.date_debut.split('T')[0] : '',
      date_fin:   editData.date_fin   ? editData.date_fin.split('T')[0]   : '',
    });

    // Charger les tarifs
    this.store.dispatch(PlatPrestataireActions.fetchPlatPrestataire({ prestataireId: id }));
    this.store.select(selectTarifs).pipe(
      filter(tarifs => tarifs.length > 0),
      take(1)
    ).subscribe(tarifs => {
      this.tarifLignes = this.mapTarifsToLignes(tarifs);
    });

    // Charger les agences
    this.store.dispatch(AgencePrestataireActions.fetchAgencePrestataire({ prestataireId: id }));
    this.store.select(selectAgences).pipe(
      filter(agences => agences.length > 0),
      take(1)
    ).subscribe(agences => {
      this.agenceLignes = this.mapAgencesToLignes(agences);
    });

    this.setModalTitle('Modifier le prestataire');
    this.setModalBtn('Enregistrer');
    this.addPrestataire?.show();
  }

  // ── Gestion lignes PlatPrestataire ────────────────────────
  ajouterLigneTarif(): void {
    this.tarifLignes.push({
      montant: undefined, date_debut: '', date_fin: null,
      statut: undefined, _isNew: true, _isDeleted: false, _hasError: false,
    });
  }

  supprimerLigneTarif(index: number): void {
    const ligne = this.tarifLignes[index];
    if (ligne._isNew) {
      this.tarifLignes.splice(index, 1);
    } else if (ligne.id) {
      this.store.dispatch(PlatPrestataireActions.deletePlatPrestataire({ id: ligne.id }));
      this.tarifLignes.splice(index, 1);
    }
  }

  // ── Gestion lignes AgencePrestataire ──────────────────────
  ajouterLigneAgence(): void {
    this.agenceLignes.push({
      agence: undefined, date_debut: '', date_fin: null,
      statut: undefined, _isNew: true, _isDeleted: false, _hasError: false,
    });
  }

  supprimerLigneAgence(index: number): void {
    const ligne = this.agenceLignes[index];
    if (ligne._isNew) {
      this.agenceLignes.splice(index, 1);
    } else if (ligne.id) {
      this.store.dispatch(AgencePrestataireActions.deleteAgencePrestataire({ id: ligne.id }));
      this.agenceLignes.splice(index, 1);
    }
  }

  // ── Validation ────────────────────────────────────────────
  private validerTarifs(): boolean {
    let valid = true;
    this.tarifLignes.filter(l => !l._isDeleted).forEach(l => {
      const hasError = !l.montant || !l.date_debut || !l.statut ||
        (!!l.date_fin && !!l.date_debut && l.date_fin < l.date_debut);
      l._hasError = hasError;
      if (hasError) valid = false;
    });
    return valid;
  }

  private validerAgences(): boolean {
    let valid = true;
    this.agenceLignes.filter(l => !l._isDeleted).forEach(l => {
      const hasError = !l.agence || !l.date_debut || !l.statut ||
        (!!l.date_fin && !!l.date_debut && l.date_fin < l.date_debut);
      l._hasError = hasError;
      if (hasError) valid = false;
    });
    return valid;
  }

  // ── Sauvegarde ────────────────────────────────────────────
  saveProperty(): void {
    this.submitted = true;

    if (this.prestataireForm.invalid) {
      this.toastService.error('Veuillez vérifier les informations du prestataire.', 'Erreur');
      return;
    }
    if (!this.validerTarifs()) {
      this.toastService.error('Veuillez corriger les erreurs dans le tableau des tarifs.', 'Erreur');
      return;
    }
    if (!this.validerAgences()) {
      this.toastService.error('Veuillez corriger les erreurs dans le tableau des agences.', 'Erreur');
      return;
    }

    const formValue = { ...this.prestataireForm.value };
    formValue.date_fin = formValue.date_fin || null;

    if (formValue.id) {
      // ── Modification ──────────────────────────────────────
      this.store.dispatch(updateprestataireData({ updatedData: formValue }));
      this.toastService.success('Prestataire mis à jour avec succès !', 'Succès');

      // Tarifs
      this.tarifLignes.forEach(ligne => {
        if (ligne._isNew && !ligne._isDeleted) {
          this.store.dispatch(PlatPrestataireActions.createPlatPrestataire({
            data: { prestataire: formValue.id, montant: ligne.montant,
                    date_debut: ligne.date_debut, date_fin: ligne.date_fin || null, statut: ligne.statut }
          }));
        } else if (!ligne._isNew && !ligne._isDeleted && ligne.id) {
          this.store.dispatch(PlatPrestataireActions.updatePlatPrestataire({
            id: ligne.id,
            data: { prestataire: formValue.id, montant: ligne.montant,
                    date_debut: ligne.date_debut, date_fin: ligne.date_fin || null, statut: ligne.statut }
          }));
        }
      });

      // Agences
      this.agenceLignes.forEach(ligne => {
        if (ligne._isNew && !ligne._isDeleted) {
          this.store.dispatch(AgencePrestataireActions.createAgencePrestataire({
            data: { prestataire: formValue.id, agence: ligne.agence,
                    date_debut: ligne.date_debut, date_fin: ligne.date_fin || null, statut: ligne.statut }
          }));
        } else if (!ligne._isNew && !ligne._isDeleted && ligne.id) {
          this.store.dispatch(AgencePrestataireActions.updateAgencePrestataire({
            id: ligne.id,
            data: { prestataire: formValue.id, agence: ligne.agence,
                    date_debut: ligne.date_debut, date_fin: ligne.date_fin || null, statut: ligne.statut }
          }));
        }
      });

    } else {
      // ── Création — snapshots AVANT fermeture ──────────────
      this.tarifLignesSnapshot  = [...this.tarifLignes];
      this.agenceLignesSnapshot = [...this.agenceLignes];
      delete formValue.id;
      this.store.dispatch(addprestataireData({ newData: formValue }));
      this.toastService.success('Prestataire ajouté avec succès !', 'Succès');
    }

    this.submitted = false;
    this.prestataireForm.reset();
    this.closeAddModal();
  }

  // ── Getters ───────────────────────────────────────────────
  get f() { return this.prestataireForm.controls; }

  get datefinInvalide(): boolean {
    return this.prestataireForm.hasError('datefinInvalide') &&
           !!this.prestataireForm.get('date_fin')?.value;
  }

  get tarifLignesVisibles(): PlatPrestataireModel[] {
    return this.tarifLignes.filter(l => !l._isDeleted);
  }

  get agenceLignesVisibles(): AgencePrestataireModel[] {
    return this.agenceLignes.filter(l => !l._isDeleted);
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
      this.store.dispatch(deleteprestataireData({ id: id.toString() }));
      this.toastService.success('Prestataire supprimé avec succès !', 'Succès');
      this.afterDeleteActions();
      return;
    }
    if (this.checkedValGet?.length > 0) {
      this.store.dispatch(deletemultipleprestataireData({ id: this.checkedValGet.join(',') }));
      this.toastService.success('Prestataires supprimés avec succès !', 'Succès');
      this.afterDeleteActions();
      return;
    }
    this.toastService.error('Aucun prestataire sélectionné.', 'Erreur');
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
    const data = this.prestataires.find(p => p.id === id);
    if (data) {
      this.selectedPrestataire = data;
      this.tarifLignes         = [];
      this.agenceLignes        = [];

      // Tarifs
      this.store.dispatch(PlatPrestataireActions.fetchPlatPrestataire({ prestataireId: id }));
      this.store.select(selectTarifs).pipe(
        filter(tarifs => tarifs.length > 0),
        take(1)
      ).subscribe(tarifs => {
        this.tarifLignes = this.mapTarifsToLignes(tarifs);
      });

      // Agences
      this.store.dispatch(AgencePrestataireActions.fetchAgencePrestataire({ prestataireId: id }));
      this.store.select(selectAgences).pipe(
        filter(agences => agences.length > 0),
        take(1)
      ).subscribe(agences => {
        this.agenceLignes = this.mapAgencesToLignes(agences);
      });

      this.viewPrestataire?.show();
    } else {
      this.toastService.error('Prestataire introuvable', 'Erreur');
    }
  }

  closeViewModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => {
      this.viewPrestataire?.hide();
      this.selectedPrestataire = null;
      this.tarifLignes         = [];
      this.agenceLignes        = [];
      this.store.dispatch(PlatPrestataireActions.resetPlatPrestataire());
      this.store.dispatch(AgencePrestataireActions.resetAgencePrestataire());
    }, 10);
  }

  // ── Helpers ───────────────────────────────────────────────
  getStatutLibelle(statutId: number): string {
    return this.statuts.find(s => s.id === statutId)?.libelle_statut ?? '—';
  }

  getAgenceLibelle(agenceId: number): string {
    return this.agences.find(a => a.id === agenceId)?.nom_agence ?? '—';
  }

  formatDate(d: string): string {
    if (!d) return '—';
    const date = d.includes('T') ? d.split('T')[0] : d;
    const [y, m, day] = date.split('-');
    return `${day}/${m}/${y}`;
  }

  checkUncheckAll(ev: any): void {
    this.prestataires.forEach(x => x.state = ev.target.checked);
    this.masterSelected = ev.target.checked;
    this.updateCheckedValues();
  }

  onCheckboxChange(): void {
    this.updateCheckedValues();
  }

  private updateCheckedValues(): void {
    this.checkedValGet = this.prestataires
      .filter(p => p.state === true)
      .map(p => p.id);
  }

  onSort(column: string): void {
    this.direction = this.direction === 'asc' ? 'desc' : 'asc';
    this.prestataires = [...this.prestataires].sort((a, b) => {
      const res = this.compare(a[column], b[column]);
      return this.direction === 'asc' ? res : -res;
    });
  }

  compare(v1: string | number, v2: string | number): number {
    return v1 < v2 ? -1 : v1 > v2 ? 1 : 0;
  }

  filterdata(): void {
    if (this.term) {
      this.prestataires = this.prestataireList.filter(el =>
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
    el.style.display = this.term && this.prestataires.length === 0 ? 'block' : 'none';
  }

  pageChanged(event: PageChangedEvent): void {
    this.loadData(event.page);
  }

  private setModalTitle(title: string): void {
    const el = document.querySelector('.modal-title') as HTMLElement;
    if (el) el.innerHTML = title;
  }

  private setModalBtn(label: string): void {
    const el = document.getElementById('add-btn') as HTMLElement;
    if (el) el.innerHTML = label;
  }
}
