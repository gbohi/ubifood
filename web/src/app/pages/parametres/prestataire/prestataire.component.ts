// src/app/pages/prestataire/prestataire.component.ts

import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { Observable, Subject, concat, of } from 'rxjs';
import {
  catchError, debounceTime, distinctUntilChanged, filter, map,
  switchMap, take, takeUntil, toArray,
} from 'rxjs/operators';

// ── Prestataire store ──────────────────────────────────────────
import {
  deleteprestataireData,
  deleteprestataireFailure,
  deleteprestataireSuccess,
  deletemultipleprestataireData,
  deletemultipleprestataireFailure,
  deletemultipleprestataireSuccess,
  fetchprestataireData,
} from 'src/app/store/Prestataire/prestataire.action';
import { PrestataireService } from 'src/app/core/services/prestataire/prestataire.service';
import { PlatPrestataireService } from 'src/app/core/services/plat-prestataire/plat-prestataire.service';
import { AgencePrestataireService } from 'src/app/core/services/agence-prestataire/agence-prestataire.service';
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
  selectPlatPrestataireIsLoading,
} from 'src/app/store/PlatPrestataire/plat-prestataire-selector';
import { PlatPrestataireModel } from 'src/app/store/PlatPrestataire/plat-prestataire.model';

// ── AgencePrestataire store ────────────────────────────────────
import * as AgencePrestataireActions from 'src/app/store/AgencePrestataire/agence-prestataire.action';
import {
  selectAgencePrestataireIsLoading,
} from 'src/app/store/AgencePrestataire/agence-prestataire-selector';
import { AgencePrestataireModel } from 'src/app/store/AgencePrestataire/agence-prestataire.model';
import { TriServeur } from 'src/app/shared/tri-serveur';

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
export class PrestataireComponent implements OnInit, AfterViewInit {

  // Tri serveur des colonnes : clé de colonne → champ autorisé par l'API (ordering_fields)
  readonly tri = new TriServeur({ id: 'id', libelle: 'libelle' });

  breadCrumbItems = [
    { label: 'Paramètres', active: false },
    { label: 'Prestataires', active: true },
  ];

  // ── Prestataire ───────────────────────────────────────────
  prestataires:    any[] = [];
  statuts:         any[] = [];
  agences:         any[] = [];
  totalItems  = 0;
  currentPage = 1;
  isLoading   = true;

  prestataireForm!: UntypedFormGroup;
  submitted      = false;
  isSaving       = false;
  masterSelected = false;
  term: any;
  checkedValGet:       any[] = [];
  selectedPrestataire: any   = null;
  deleteID: any;
  direction = 'asc';

  modalTitle = 'Ajouter un prestataire';
  modalBtn   = 'Enregistrer';

  // ── PlatPrestataire ───────────────────────────────────────
  isTarifsLoading    = false;
  currentPrestataireId: number | null = null;
  tarifLignes: PlatPrestataireModel[] = [];

  // ── AgencePrestataire ─────────────────────────────────────
  isAgencesLoading    = false;
  agenceLignes: AgencePrestataireModel[] = [];

  private destroyRef = inject(DestroyRef);
  private search$            = new Subject<string>();
  private annulerChargement$ = new Subject<void>();
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
    private prestataireService: PrestataireService,
    private platPrestataireService: PlatPrestataireService,
    private agencePrestataireService: AgencePrestataireService,
  ) {}

  ngOnInit(): void {
    this.prestataireForm = this.fb.group(
      {
        id:         [''],
        libelle:    ['', [Validators.required]],
        date_debut: ['', [Validators.required]],
        date_fin:   [''],
        statut:     ['', [Validators.required]],
        // Coordonnées (facultatives, affichées sur la facture PDF)
        contact_nom:        [''],
        adresse:            [''],
        ville:              [''],
        telephone:          [''],
        email:              ['', [Validators.email]],
        identifiant_fiscal: [''],
        registre_commerce:  [''],
      },
      { validators: datefinValidator }
    );

    // ── Prestataire selectors ──────────────────────────────
    this.store.select(selectLoading)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.isLoading = v);

    this.store.select(selectTotalItems)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.totalItems = v ?? 0);

    this.store.select(selectCurrentPage)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.currentPage = v ?? 1);

    this.store.select(selectprestataireData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => {
        if (data) {
          this.prestataires   = data.map(item => ({ ...item, state: false }));
          // Nouvelle page / nouveau résultat : la sélection précédente n'a plus de sens
          this.masterSelected = false;
          this.checkedValGet  = [];
        }
      });

    // ── Statuts ────────────────────────────────────────────
    this.store.dispatch(fetchstatutNoPaginateData());
    this.store.select(selectAllSatutWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => this.statuts = data ?? []);

    // ── Agences ────────────────────────────────────────────
    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.select(selectAllAgenceWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => this.agences = data ?? []);

    // ── PlatPrestataire selectors ──────────────────────────
    this.store.select(selectPlatPrestataireIsLoading)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.isTarifsLoading = v);

    // ── AgencePrestataire selectors ────────────────────────
    this.store.select(selectAgencePrestataireIsLoading)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.isAgencesLoading = v);

    // ── Recherche serveur (?search=), temporisée ───────────
    this.search$.pipe(
      map(t => (t ?? '').trim()),
      debounceTime(350),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.loadData(1));

    // ── Retour serveur des suppressions ────────────────────
    this.actions$.pipe(
      ofType(deleteprestataireSuccess, deletemultipleprestataireSuccess),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(a => this.toastService.success(
      a.type === deleteprestataireSuccess.type
        ? 'Prestataire supprimé avec succès !'
        : 'Prestataires supprimés avec succès !', 'Succès'));

    this.actions$.pipe(
      ofType(deleteprestataireFailure, deletemultipleprestataireFailure),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ error }) => {
      this.toastService.error(error || 'Suppression impossible.', 'Erreur', { timeOut: 10000 });
      this.loadData(this.currentPage);
    });

    this.loadData(1);
  }

  ngAfterViewInit(): void {
    this.addPrestataire?.onHidden.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.annulerChargement$.next();
      this.prestataireForm.reset();
      this.tarifLignes          = [];
      this.agenceLignes         = [];
      this.currentPrestataireId = null;
      this.submitted            = false;
      this.store.dispatch(PlatPrestataireActions.resetPlatPrestataire());
      this.store.dispatch(AgencePrestataireActions.resetAgencePrestataire());
      this.modalTitle = 'Ajouter un prestataire';
      this.modalBtn   = 'Enregistrer';
    });

    this.deleteRecordModal?.onHidden.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.deleteID = null;
    });
  }

  loadData(page: number = 1): void {
    this.store.dispatch(fetchprestataireData({ page, search: (this.term ?? '').trim(), ordering: this.tri.ordering }));
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

  /**
   * Charge tarifs et agences du prestataire `id`. Les stores sont vidés avant,
   * et seule la réponse (succès ou échec) portant CET id est prise en compte :
   * jamais les lignes de la fiche ouverte précédemment. Une liste vide est valide.
   */
  private chargerLignes(id: number): void {
    this.annulerChargement$.next();
    this.tarifLignes  = [];
    this.agenceLignes = [];
    this.store.dispatch(PlatPrestataireActions.resetPlatPrestataire());
    this.store.dispatch(AgencePrestataireActions.resetAgencePrestataire());

    this.actions$.pipe(
      ofType(PlatPrestataireActions.fetchPlatPrestataireSuccess, PlatPrestataireActions.fetchPlatPrestataireFailure),
      filter(a => a.prestataireId === id),
      take(1),
      takeUntil(this.annulerChargement$),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(a => {
      if ('tarifs' in a) this.tarifLignes = this.mapTarifsToLignes(a.tarifs ?? []);
      else this.toastService.error(a.error || 'Erreur lors du chargement des tarifs.', 'Erreur');
    });

    this.actions$.pipe(
      ofType(AgencePrestataireActions.fetchAgencePrestataireSuccess, AgencePrestataireActions.fetchAgencePrestataireFailure),
      filter(a => a.prestataireId === id),
      take(1),
      takeUntil(this.annulerChargement$),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(a => {
      if ('agences' in a) this.agenceLignes = this.mapAgencesToLignes(a.agences ?? []);
      else this.toastService.error(a.error || 'Erreur lors du chargement des agences.', 'Erreur');
    });

    this.store.dispatch(PlatPrestataireActions.fetchPlatPrestataire({ prestataireId: id }));
    this.store.dispatch(AgencePrestataireActions.fetchAgencePrestataire({ prestataireId: id }));
  }

  // ── Modal Ajouter ─────────────────────────────────────────
  openAddModal(): void {
    this.lastActiveElement    = document.activeElement as HTMLElement;
    this.annulerChargement$.next();
    this.currentPrestataireId = null;
    this.tarifLignes          = [];
    this.agenceLignes         = [];
    this.submitted            = false;
    this.prestataireForm.reset();
    this.store.dispatch(PlatPrestataireActions.resetPlatPrestataire());
    this.store.dispatch(AgencePrestataireActions.resetAgencePrestataire());
    this.modalTitle = 'Ajouter un prestataire';
    this.modalBtn   = 'Enregistrer';
    this.addPrestataire?.show();
  }

  /** « Fermer » : abandonne toutes les modifications (y compris les suppressions de lignes) */
  closeAddModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => this.addPrestataire?.hide(), 10);
  }

  // ── Modal Édition ─────────────────────────────────────────
  editList(id: any): void {
    this.lastActiveElement    = document.activeElement as HTMLElement;
    const editData            = this.prestataires.find(p => p.id === id);
    if (!editData) return;

    this.currentPrestataireId = id;
    this.submitted            = false;
    this.prestataireForm.reset();

    this.prestataireForm.patchValue({
      ...editData,
      date_debut: editData.date_debut ? editData.date_debut.split('T')[0] : '',
      date_fin:   editData.date_fin   ? editData.date_fin.split('T')[0]   : '',
    });

    this.chargerLignes(id);

    this.modalTitle = 'Modifier le prestataire';
    this.modalBtn   = 'Enregistrer';
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
    if (!ligne) return;
    // Ligne existante : seulement marquée, la suppression part sur « Enregistrer »
    if (ligne._isNew || !ligne.id) this.tarifLignes.splice(index, 1);
    else ligne._isDeleted = true;
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
    if (!ligne) return;
    // Ligne existante : seulement marquée, la suppression part sur « Enregistrer »
    if (ligne._isNew || !ligne.id) this.agenceLignes.splice(index, 1);
    else ligne._isDeleted = true;
  }

  // ── Validation ────────────────────────────────────────────
  /** 0 est un montant valide ; seuls l'absence et le négatif sont refusés */
  montantInvalide(l: PlatPrestataireModel): boolean {
    return l.montant == null || (l.montant as any) === '' || Number(l.montant) < 0;
  }

  private vide(v: any): boolean {
    return v == null || v === '' || v === 'undefined';
  }

  private validerTarifs(): boolean {
    let valid = true;
    this.tarifLignes.filter(l => !l._isDeleted).forEach(l => {
      const hasError = this.montantInvalide(l) || !l.date_debut || this.vide(l.statut) ||
        (!!l.date_fin && !!l.date_debut && l.date_fin < l.date_debut);
      l._hasError = hasError;
      if (hasError) valid = false;
    });
    return valid;
  }

  private validerAgences(): boolean {
    let valid = true;
    this.agenceLignes.filter(l => !l._isDeleted).forEach(l => {
      const hasError = this.vide(l.agence) || !l.date_debut || this.vide(l.statut) ||
        (!!l.date_fin && !!l.date_debut && l.date_fin < l.date_debut);
      l._hasError = hasError;
      if (hasError) valid = false;
    });
    return valid;
  }

  // ── Sauvegarde ────────────────────────────────────────────
  saveProperty(): void {
    this.submitted = true;
    if (this.isSaving) return;

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
    // Coordonnées facultatives : chaîne vide plutôt que null (champs texte côté serveur)
    for (const champ of ['contact_nom', 'adresse', 'ville', 'telephone', 'email',
                         'identifiant_fiscal', 'registre_commerce']) {
      formValue[champ] = formValue[champ] ?? '';
    }

    const creation = !formValue.id;
    if (creation) delete formValue.id;

    this.isSaving = true;
    const fiche$: Observable<any> = creation
      ? this.prestataireService.createPrestataire(formValue)
      : this.prestataireService.updatePrestataire(formValue);

    fiche$.pipe(
      switchMap(p => this.enregistrerLignes(p?.id ?? formValue.id)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: erreurs => {
        this.isSaving = false;
        if (erreurs.length) {
          this.toastService.warning(
            `Prestataire enregistré, mais des lignes ont été refusées : ${erreurs.join(' ; ')}`,
            'Attention', { timeOut: 10000 });
        } else {
          this.toastService.success(
            creation ? 'Prestataire ajouté avec succès !' : 'Prestataire mis à jour avec succès !', 'Succès');
        }
        this.submitted = false;
        this.closeAddModal();
        this.loadData(creation ? 1 : this.currentPage);
      },
      error: err => {
        // Fiche refusée (libellé vide / déjà utilisé…) : la fenêtre reste ouverte
        this.isSaving = false;
        this.toastService.error(typeof err === 'string' ? err : 'Enregistrement impossible.', 'Erreur');
      },
    });
  }

  /**
   * Enregistre tarifs puis agences, une requête après l'autre et dans cet ordre
   * pour chaque tableau : suppressions, modifications (ex. clôturer l'ancienne
   * période), créations — sinon le serveur refuse le chevauchement.
   * Renvoie la liste des messages d'erreur.
   */
  private enregistrerLignes(prestataireId: number): Observable<string[]> {
    const erreurs: string[] = [];
    const periode = (l: { date_debut?: string; date_fin?: string | null }) =>
      `du ${this.formatDate(l.date_debut!)}${l.date_fin ? ' au ' + this.formatDate(l.date_fin) : ''}`;
    const appel = (obs: Observable<any>, quoi: string) => obs.pipe(
      catchError(err => { erreurs.push(`${quoi} : ${typeof err === 'string' ? err : 'refusé'}`); return of(null); }));

    const tarif = (l: PlatPrestataireModel) => ({
      prestataire: prestataireId, montant: Number(l.montant),
      date_debut: l.date_debut, date_fin: l.date_fin || null, statut: Number(l.statut),
    });
    const lien = (l: AgencePrestataireModel) => ({
      prestataire: prestataireId, agence: Number(l.agence),
      date_debut: l.date_debut, date_fin: l.date_fin || null, statut: Number(l.statut),
    });
    const qT = (l: PlatPrestataireModel) => `Tarif ${l.montant} FCFA ${periode(l)}`;
    const qA = (l: AgencePrestataireModel) => `Agence ${this.getAgenceLibelle(l.agence!)} ${periode(l)}`;

    const T = this.tarifLignes;
    const A = this.agenceLignes;
    const operations: Observable<any>[] = [
      ...T.filter(l => l._isDeleted && l.id).map(l => appel(this.platPrestataireService.delete(l.id!), 'Suppression ' + qT(l))),
      ...T.filter(l => !l._isNew && !l._isDeleted && l.id).map(l => appel(this.platPrestataireService.update(l.id!, tarif(l)), qT(l))),
      ...T.filter(l => l._isNew && !l._isDeleted).map(l => appel(this.platPrestataireService.create(tarif(l)), qT(l))),
      ...A.filter(l => l._isDeleted && l.id).map(l => appel(this.agencePrestataireService.delete(l.id!), 'Suppression ' + qA(l))),
      ...A.filter(l => !l._isNew && !l._isDeleted && l.id).map(l => appel(this.agencePrestataireService.update(l.id!, lien(l)), qA(l))),
      ...A.filter(l => l._isNew && !l._isDeleted).map(l => appel(this.agencePrestataireService.create(lien(l)), qA(l))),
    ];
    if (!operations.length) return of([]);
    return concat(...operations).pipe(toArray(), map(() => erreurs));
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
      // Message (succès ou refus du serveur, ex. prestataire encore utilisé) : via les actions
      this.store.dispatch(deleteprestataireData({ id: id.toString() }));
      this.afterDeleteActions();
      return;
    }
    if (this.checkedValGet?.length > 0) {
      this.store.dispatch(deletemultipleprestataireData({ id: this.checkedValGet.join(',') }));
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
      this.chargerLignes(id);

      this.viewPrestataire?.show();
    } else {
      this.toastService.error('Prestataire introuvable', 'Erreur');
    }
  }

  closeViewModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => {
      this.viewPrestataire?.hide();
      this.annulerChargement$.next();
      this.selectedPrestataire = null;
      this.tarifLignes         = [];
      this.agenceLignes        = [];
      this.store.dispatch(PlatPrestataireActions.resetPlatPrestataire());
      this.store.dispatch(AgencePrestataireActions.resetAgencePrestataire());
    }, 10);
  }

  // ── Helpers ───────────────────────────────────────────────
  getStatutLibelle(statutId: number): string {
    return this.statuts.find(s => s.id === Number(statutId))?.libelle_statut ?? '—';
  }

  getAgenceLibelle(agenceId: number): string {
    return this.agences.find(a => a.id === Number(agenceId))?.nom_agence ?? '—';
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

  // Tri côté serveur (?ordering=) : s'applique à toutes les données, pas seulement à la page affichée.
  // Un nouveau clic inverse le sens ; la recherche courante est conservée et on revient à la page 1.
  onSort(column: string): void {
    if (this.tri.basculer(column)) this.loadData(1);
  }

  /** Recherche côté serveur (tout le référentiel, pas seulement la page affichée) */
  filterdata(): void {
    this.search$.next(this.term ?? '');
  }

  pageChanged(event: PageChangedEvent): void {
    this.loadData(event.page);
  }
}
