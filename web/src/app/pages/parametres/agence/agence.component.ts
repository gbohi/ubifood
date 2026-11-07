import { Component, DestroyRef, OnInit, AfterViewInit, ViewChild, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';
import { ToastrService } from 'ngx-toastr';
import { Store } from '@ngrx/store';
import { Actions, ofType } from '@ngrx/effects';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import {
  addagenceData, addagenceDataSuccess, addagenceDataFailure,
  updateagenceData, updateagenceDataSuccess, updateagenceDataFailure,
  deleteagenceData, deleteagenceSuccess, deleteagenceFailure,
  deletemultipleagenceData, deletemultipleagenceSuccess, deletemultipleagenceFailure,
  fetchagenceData,
} from 'src/app/store/Agence/agence.action';
import { selectagenceData, selectTotalItems, selectLoading, selectCurrentPage } from 'src/app/store/Agence/agence-selector';
import { TriServeur } from 'src/app/shared/tri-serveur';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { ADMINS, aUnRole } from 'src/app/core/helpers/roles';
import { ParcoursCommandeService } from 'src/app/core/services/commande/parcours-commande.service';

@Component({
  selector: 'app-agence',
  templateUrl: './agence.component.html',
  styleUrl: './agence.component.scss',
  providers: [DecimalPipe]
})
export class AgenceComponent implements OnInit, AfterViewInit {

  // Tri serveur des colonnes : clé de colonne → champ autorisé par l'API (ordering_fields)
  readonly tri = new TriServeur({ id: 'id', nom_agence: 'nom_agence' });

  private readonly destroyRef = inject(DestroyRef);
  private readonly actions$ = inject(Actions);
  private readonly tokenStorage = inject(TokenStorageService);
  private readonly parcours = inject(ParcoursCommandeService);

  /** Administrateur : tout ; gestionnaire : lecture + ouverture de ses agences */
  estAdmin = false;
  private agencesGerees = new Set<number>();
  /** Valeur d'origine de l'ouverture de l'agence en cours de modification */
  private ouvertureInitiale = false;
  /** Enregistrement en attente de la confirmation de fermeture */
  private enregistrementEnAttente: any = null;
  @ViewChild('fermetureModal', { static: false }) fermetureModal?: ModalDirective;

  // bread crumb items
  breadCrumbItems!: Array<{}>;

  agences: any[] = [];
  totalItems: number = 0;
  currentPage: number = 1;
  isLoading: boolean = true;

  agenceForm!: UntypedFormGroup;
  isEdit = false;
  isSaving = false;
  isDeleting = false;
  masterSelected = false;
  term = '';
  checkedValGet: any[] = [];

  private readonly search$ = new Subject<string>();

  // Élément qui avait le focus avant l'ouverture d'une modal
  private lastActiveElement: HTMLElement | null = null;

  @ViewChild('addAgence', { static: false }) addAgence?: ModalDirective;
  @ViewChild('deleteRecordModal', { static: false }) deleteRecordModal?: ModalDirective;
  @ViewChild('viewAgence', { static: false }) viewAgence?: ModalDirective;
  selectedAgence: any = null;
  deleteID: any = null;
  direction: any = 'asc';

  constructor(
    private formBuilder: UntypedFormBuilder,
    public toastService: ToastrService,
    public store: Store
  ) {}

  ngOnInit(): void {
    this.breadCrumbItems = [
      { label: 'Paramètres' },
      { label: 'Agences', active: true }
    ];

    const user = this.tokenStorage.getUser();
    this.estAdmin = aUnRole(user, ADMINS);
    const auj = new Date().toISOString().slice(0, 10);
    for (const l of (user?.user_agences ?? []) as any[]) {
      const debut = String(l.date_debut ?? '').slice(0, 10);
      const fin = l.date_fin ? String(l.date_fin).slice(0, 10) : null;
      const id = Number(l.agence_id ?? l.agence);
      if (id && debut <= auj && (!fin || fin >= auj)) this.agencesGerees.add(id);
    }

    this.agenceForm = this.formBuilder.group({
      id: [''],
      nom_agence: ['', [Validators.required]],
      accepter_autres_agences: [false],
    });

    this.store.select(selectLoading)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(loading => this.isLoading = loading);

    this.store.select(selectTotalItems)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(total => this.totalItems = total || 0);

    this.store.select(selectCurrentPage)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(page => this.currentPage = page || 1);

    this.store.select(selectagenceData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => {
        if (data) {
          this.agences = data.map(item => ({ ...item, state: false }));
          // Nouvelles données (changement de page, rechargement) : la sélection ne vaut plus
          this.masterSelected = false;
          this.checkedValGet = [];
        }
      });

    // Recherche côté serveur (?search=), relancée sur la page 1
    this.search$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadData(1));

    // Réponses du serveur : ajout / mise à jour
    this.actions$
      .pipe(ofType(addagenceDataSuccess, updateagenceDataSuccess), takeUntilDestroyed(this.destroyRef))
      .subscribe(action => {
        this.isSaving = false;
        this.toastService.success(
          action.type === addagenceDataSuccess.type
            ? 'Agence ajoutée avec succès !'
            : 'Agence mise à jour avec succès !',
          'Succès'
        );
        this.closeAddModal();
        this.loadData(this.currentPage);
      });

    this.actions$
      .pipe(ofType(addagenceDataFailure, updateagenceDataFailure), takeUntilDestroyed(this.destroyRef))
      .subscribe(({ error }) => {
        // La modal reste ouverte avec les valeurs saisies
        this.isSaving = false;
        this.toastService.error(error || "L'enregistrement a échoué.", 'Erreur');
      });

    // Réponses du serveur : suppression
    this.actions$
      .pipe(ofType(deleteagenceSuccess, deletemultipleagenceSuccess), takeUntilDestroyed(this.destroyRef))
      .subscribe(action => {
        const multiple = action.type === deletemultipleagenceSuccess.type;
        const count = multiple ? action.id.split(',').filter(s => s.trim() !== '').length : 1;
        this.toastService.success(
          count > 1 ? `${count} agences supprimées avec succès !` : 'Agence supprimée avec succès !',
          'Succès'
        );
        this.afterDeleteActions();
      });

    this.actions$
      .pipe(ofType(deleteagenceFailure, deletemultipleagenceFailure), takeUntilDestroyed(this.destroyRef))
      .subscribe(({ error }) => {
        // On ferme la confirmation, la ligne reste affichée
        this.isDeleting = false;
        this.deleteID = null;
        this.closeDeleteModal();
        this.toastService.error(error || 'La suppression a échoué.', 'Erreur');
      });

    this.loadData(1);
  }

  ngAfterViewInit() {
    this.addAgence?.onHidden
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.agenceForm.reset();
        this.isEdit = false;
        this.isSaving = false;
      });

    this.deleteRecordModal?.onHidden
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.deleteID = null;
        this.isDeleting = false;
      });
  }

  // Charger les données (page + terme de recherche courant)
  loadData(page: number = 1): void {
    const search = this.term?.trim() || undefined;
    this.store.dispatch(fetchagenceData({ page, search, ordering: this.tri.ordering }));
  }

  // Remet le focus sur l'élément d'origine (évite un focus resté dans une modal masquée)
  private restoreFocus() {
    if (this.lastActiveElement) {
      this.lastActiveElement.focus();
    } else {
      document.body.focus();
    }
  }

  // Ouverture de la modal d'ajout
  openAddModal() {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.isEdit = false;
    this.agenceForm.reset({ accepter_autres_agences: false });
    this.agenceForm.get('nom_agence')?.enable();
    this.addAgence?.show();
  }

  closeAddModal() {
    this.restoreFocus();
    setTimeout(() => this.addAgence?.hide(), 10);
  }

  // Edit Data
  editList(id: any) {
    const editData = this.agences.find(p => p.id === id);
    if (!editData) {
      this.toastService.error('Agence introuvable', 'Erreur');
      return;
    }
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.isEdit = true;
    this.agenceForm.reset();
    this.ouvertureInitiale = !!editData.accepter_autres_agences;
    this.agenceForm.patchValue({
      id: editData.id, nom_agence: editData.nom_agence, accepter_autres_agences: this.ouvertureInitiale,
    });
    if (this.estAdmin) this.agenceForm.get('nom_agence')?.enable();
    else this.agenceForm.get('nom_agence')?.disable();
    this.addAgence?.show();
  }

  /** Le gestionnaire de l'agence (ou un administrateur) peut l'ouvrir aux autres agences */
  peutOuvrir(agenceId: any): boolean {
    return this.estAdmin || this.agencesGerees.has(Number(agenceId));
  }

  /** Bouton « Modifier » : administrateur, ou gestionnaire de l'agence (ouverture seulement) */
  peutModifier(agenceId: any): boolean {
    return this.peutOuvrir(agenceId);
  }

  get ouvertureDemandee(): boolean {
    return !!this.agenceForm.get('accepter_autres_agences')?.value;
  }

  // Ajout / mise à jour : le résultat est traité à la réponse du serveur
  saveProperty() {
    if (this.agenceForm.invalid) {
      this.agenceForm.markAllAsTouched();
      this.toastService.error('Veuillez vérifier les informations saisies.', 'Erreur');
      return;
    }
    if (this.isSaving) return;

    const formValue = { ...this.agenceForm.getRawValue() };
    if (!formValue.id) {
      // Création (administrateur) : l'ouverture part avec la fiche
      delete formValue.id;
      formValue.accepter_autres_agences = !!formValue.accepter_autres_agences;
      this.isSaving = true;
      this.store.dispatch(addagenceData({ newData: formValue }));
      return;
    }
    // Fermeture aux autres agences : confirmation (commandes maintenues, employés prévenus)
    if (this.ouvertureInitiale && !formValue.accepter_autres_agences) {
      this.enregistrementEnAttente = formValue;
      this.fermetureModal?.show();
      return;
    }
    this.enregistrer(formValue);
  }

  confirmerFermeture(): void {
    const v = this.enregistrementEnAttente;
    this.enregistrementEnAttente = null;
    this.fermetureModal?.hide();
    if (v) this.enregistrer(v);
  }

  annulerFermeture(): void {
    this.enregistrementEnAttente = null;
    this.fermetureModal?.hide();
  }

  /** Ouverture (route dédiée) puis nom de l'agence (administrateur) */
  private enregistrer(formValue: any): void {
    const id = Number(formValue.id);
    const ouverte = !!formValue.accepter_autres_agences;
    const avant = this.agences.find(a => a.id === id);
    const nomChange = this.estAdmin && avant && avant.nom_agence !== formValue.nom_agence;
    const suite = () => {
      if (nomChange) {
        this.store.dispatch(updateagenceData({ updatedData: { id, nom_agence: formValue.nom_agence } as any }));
      } else {
        this.isSaving = false;
        this.closeAddModal();
        this.loadData(this.currentPage);
      }
    };
    this.isSaving = true;
    if (ouverte === this.ouvertureInitiale || !this.peutOuvrir(id)) {
      if (nomChange) suite(); else { this.isSaving = false; this.closeAddModal(); }
      return;
    }
    this.parcours.changerOuverture(id, ouverte).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => {
        this.toastService.success(r.accepter_autres_agences
          ? `${r.nom_agence} accepte maintenant les commandes des employés des autres agences.`
          : `${r.nom_agence} est maintenant réservée à ses employés. Les commandes déjà passées sont maintenues.`, 'Succès');
        this.ouvertureInitiale = r.accepter_autres_agences;
        suite();
      },
      error: err => {
        this.isSaving = false;
        this.toastService.error(typeof err === 'string' ? err : "L'ouverture n'a pas pu être modifiée.", 'Erreur');
      },
    });
  }

  // Suppression d'une ligne
  removeItem(id: any) {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.deleteID = id;
    this.deleteRecordModal?.show();
  }

  // Suppression de la sélection
  removeSelected() {
    if (this.checkedValGet.length === 0) {
      this.toastService.error('Aucune agence sélectionnée pour suppression.', 'Erreur');
      return;
    }
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.deleteID = null;
    this.deleteRecordModal?.show();
  }

  // Texte de confirmation : correspond à ce qui sera supprimé
  get deleteMessage(): string {
    if (this.deleteID == null && this.checkedValGet.length > 1) {
      return `Voulez-vous vraiment supprimer ces ${this.checkedValGet.length} agences ?`;
    }
    return 'Voulez-vous vraiment supprimer cette agence ?';
  }

  closeDeleteModal() {
    this.restoreFocus();
    setTimeout(() => this.deleteRecordModal?.hide(), 10);
  }

  // Confirmation : le résultat est traité à la réponse du serveur
  confirmDelete() {
    if (this.isDeleting) return;

    if (this.deleteID != null) {
      this.isDeleting = true;
      this.store.dispatch(deleteagenceData({ id: this.deleteID.toString() }));
      return;
    }

    if (this.checkedValGet.length > 0) {
      this.isDeleting = true;
      this.store.dispatch(deletemultipleagenceData({ id: this.checkedValGet.join(',') }));
      return;
    }

    this.toastService.error('Aucune agence sélectionnée pour suppression.', 'Erreur');
    this.closeDeleteModal();
  }

  private afterDeleteActions() {
    this.isDeleting = false;
    this.closeDeleteModal();
    this.masterSelected = false;
    this.deleteID = null;
    this.checkedValGet = [];
  }

  // La case maître coche / décoche toutes les lignes de la page
  checkUncheckAll(ev: any) {
    this.agences.forEach((x: any) => x.state = ev.target.checked);
    this.masterSelected = ev.target.checked;
    this.updateCheckedValues();
  }

  onCheckboxChange() {
    this.updateCheckedValues();
  }

  private updateCheckedValues() {
    this.checkedValGet = this.agences.filter(x => x.state === true).map(x => x.id);
    this.masterSelected = this.agences.length > 0 && this.checkedValGet.length === this.agences.length;
  }

  // Tri côté serveur (?ordering=) : s'applique à toutes les données, pas seulement à la page affichée.
  // Un nouveau clic inverse le sens ; la recherche courante est conservée et on revient à la page 1.
  onSort(column: string): void {
    if (this.tri.basculer(column)) this.loadData(1);
  }

  // Recherche (debounce 300 ms, côté serveur)
  onSearchChange(value: string) {
    this.search$.next((value ?? '').trim());
  }

  // Page Changed (le terme de recherche est conservé)
  pageChanged(event: PageChangedEvent): void {
    if (event.page === this.currentPage) return;
    this.loadData(event.page);
  }

  // Ouvrir la modal de détails
  viewDetails(id: any) {
    const data = this.agences.find(p => p.id === id);
    if (!data) {
      this.toastService.error('Agence introuvable', 'Erreur');
      return;
    }
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.selectedAgence = data;
    this.viewAgence?.show();
  }

  closeViewModal() {
    this.restoreFocus();
    setTimeout(() => {
      this.viewAgence?.hide();
      this.selectedAgence = null;
    }, 10);
  }
}
