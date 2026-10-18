// list-besoin.component.ts

import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { AfterViewInit, Component, DestroyRef, OnInit, ViewChild, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl, UntypedFormBuilder, UntypedFormGroup, ValidationErrors, Validators,
} from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Observable, Subject, forkJoin, of } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';
import { DropzoneComponent, DropzoneConfigInterface } from 'ngx-dropzone-wrapper';
import { Store } from '@ngrx/store';
import { Actions, ofType } from '@ngrx/effects';
import {
  addbesoinData,
  addbesoinDataSuccess,
  addbesoinDataFailure,
  deletebesoinData,
  deletebesoinSuccess,
  deletebesoinFailure,
  deletemultiplebesoinData,
  deletemultiplebesoinSuccess,
  deletemultiplebesoinFailure,
  fetchbesoinData,
  updatebesoinData,
  updatebesoinDataSuccess,
  updatebesoinDataFailure,
  fetchstatistiquebesoinData,
} from 'src/app/store/Besoin/besoin.action';
import {
  selectbesoinData,
  selectTotalItems,
  selectLoading,
  selectCurrentPage,
  selectStatistiqueGlobale,
} from 'src/app/store/Besoin/besoin-selector';

// Listes sans pagination pour les selects
import { selectAllTypebesoinWithoutPagination } from 'src/app/store/Typebesoin/typebesoin-selector';
import { fetchtypebesoinNoPaginateData } from 'src/app/store/Typebesoin/typebesoin.action';
import { selectAllPrioritesWithoutPagination } from 'src/app/store/Priorite/priorite-selector';
import { fetchprioriteNoPaginateData } from 'src/app/store/Priorite/priorite.action';
import { selectAllEtatWithoutPagination } from 'src/app/store/Etat/etat-selector';
import { fetchetatNoPaginateData } from 'src/app/store/Etat/etat.action';
import { selectAlluserWithoutPagination } from 'src/app/store/User/user-selector';
import { fetchuserNoPaginateData } from 'src/app/store/User/user.action';
// Services (modèle Django Service, nommé « Departement » côté web)
import { selectAllDepartementWithoutPagination } from 'src/app/store/Departement/departement-selector';
import { fetchdepartementNoPaginateData } from 'src/app/store/Departement/departement.action';

import { BesoinDocumentModel, BesoinServiceModel, StatistiqueGlobale } from 'src/app/store/Besoin/besoin.model';
import { BesoinService } from 'src/app/core/services/besoin/besoin.service';
import { environment } from 'src/environments/environment';

// Extensions acceptées par le validateur du modèle BesoinDocument
const EXTENSIONS_AUTORISEES = ['pdf', 'docx', 'jpg', 'jpeg', 'png'];

/** La date de fin ne peut pas précéder la date de début */
function datesCoherentes(group: AbstractControl): ValidationErrors | null {
  const debut = group.get('date_debut')?.value;
  const fin = group.get('date_fin')?.value;
  if (debut && fin && new Date(fin).getTime() < new Date(debut).getTime()) {
    return { datesIncoherentes: true };
  }
  return null;
}

@Component({
  selector: 'app-list-besoin',
  templateUrl: './list-besoin.component.html',
  styleUrl: './list-besoin.component.scss',
  providers: [DecimalPipe],
})
export class ListBesoinComponent implements OnInit, AfterViewInit {

  private readonly destroyRef = inject(DestroyRef);

  breadCrumbItems!: Array<{}>;

  besoins: any[]     = [];
  totalItems: number = 0;
  currentPage: number = 1;
  isLoading: boolean = true;

  besoinForm!: UntypedFormGroup;
  isEdit     = false;
  isSaving   = false;
  isDeleting = false;
  masterSelected = false;
  term = '';
  checkedValGet: any[] = [];

  private readonly search$ = new Subject<string>();

  priorites:   any[] = [];
  typebesoins: any[] = [];
  users:       any[] = [];
  etatlistes:  any[] = [];
  servicesListe: any[] = [];

  statistiques: StatistiqueGlobale | null = null;

  private lastActiveElement: HTMLElement | null = null;

  @ViewChild('addBesoin',         { static: false }) addBesoin?:         ModalDirective;
  @ViewChild('deleteRecordModal', { static: false }) deleteRecordModal?: ModalDirective;
  @ViewChild('viewBesoin',        { static: false }) viewBesoin?:        ModalDirective;
  @ViewChild('dropzoneAjout',     { static: false }) dropzoneAjout?:     DropzoneComponent;
  @ViewChild('dropzoneDetail',    { static: false }) dropzoneDetail?:    DropzoneComponent;

  selectedBesoin: any = null;
  deleteID: any = null;
  direction: any = 'asc';

  // URL du serveur pour les documents (/media/...)
  baseUrl = environment.apiUrl;

  // ── Gestion documents en mode modification ─────────────────
  editingBesoinId: number | null = null;
  existingDocuments: BesoinDocumentModel[] = [];   // documents rattachés (depuis l'API)
  removedDocuments: BesoinDocumentModel[]  = [];   // documents marqués pour suppression
  rawFiles: File[] = [];                           // nouveaux fichiers → documents[]

  // Opérations sur les documents à lancer une fois la mise à jour acceptée
  private pendingDocs: { besoinId: number; files: File[]; toDelete: number[] } | null = null;

  // ── Dropzones (fichiers joints manuellement au FormData) ────
  public dropzoneConfig: DropzoneConfigInterface = {
    clickable: true,
    addRemoveLinks: true,
    previewsContainer: false,
    autoProcessQueue: false,
  };
  public dropzoneConfigDetail: DropzoneConfigInterface = {
    clickable: true,
    addRemoveLinks: true,
    previewsContainer: false,
    autoProcessQueue: false,
  };
  detailRawFiles: File[] = [];
  isUploadingDetail = false;

  // ── Services affectés (modal détails) ──────────────────────
  selectedServiceId: number | null = null;
  isSavingService = false;
  // Le détail a été modifié (documents / services) : recharger la liste à la fermeture
  private detailModifie = false;

  constructor(
    private formBuilder: UntypedFormBuilder,
    public toastService: ToastrService,
    public store: Store,
    private actions$: Actions,
    private besoinService: BesoinService,
    private tokenStorage: TokenStorageService,
  ) {}

  ngOnInit(): void {
    this.breadCrumbItems = [
      { label: 'Besoins' },
      { label: 'Liste des besoins', active: true },
    ];

    this.besoinForm = this.formBuilder.group({
      id:          [null],
      titre:       ['', [Validators.required]],
      description: ['', [Validators.required]],
      typebesoin:  [null, [Validators.required]],
      priorite:    [null, [Validators.required]],
      user:        [null, [Validators.required]],
      etat:        [null, [Validators.required]],
      date_debut:  ['', [Validators.required]],
      date_fin:    ['', [Validators.required]],
      commentaire: [''],
    }, { validators: datesCoherentes });

    this.store.select(selectLoading)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(loading => this.isLoading = loading);

    this.store.select(selectTotalItems)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(total => this.totalItems = total || 0);

    this.store.select(selectCurrentPage)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(page => this.currentPage = page || 1);

    this.store.select(selectbesoinData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => {
        if (data) {
          this.besoins = data.map(item => ({ ...item, state: false }));
          // Nouvelles données : la sélection ne vaut plus
          this.masterSelected = false;
          this.checkedValGet = [];
        }
      });

    // ── Selects (listes sans pagination) ───────────────────
    this.store.select(selectAlluserWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => this.users = data ?? []);
    this.store.select(selectAllPrioritesWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => this.priorites = data ?? []);
    this.store.select(selectAllTypebesoinWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => this.typebesoins = data ?? []);
    this.store.select(selectAllEtatWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => this.etatlistes = data ?? []);
    this.store.select(selectAllDepartementWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => this.servicesListe = data ?? []);

    this.store.select(selectStatistiqueGlobale)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => this.statistiques = data);

    // Recherche côté serveur (?search=), relancée sur la page 1
    this.search$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadData(1));

    // ── Réponses du serveur : ajout ─────────────────────────
    this.actions$
      .pipe(ofType(addbesoinDataSuccess), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.isSaving = false;
        this.toastService.success('Besoin ajouté avec succès !', 'Succès');
        this.closeAddModal();
      });

    // ── Réponses du serveur : mise à jour, puis documents ───
    this.actions$
      .pipe(ofType(updatebesoinDataSuccess), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.apresMiseAJour());

    this.actions$
      .pipe(ofType(addbesoinDataFailure, updatebesoinDataFailure), takeUntilDestroyed(this.destroyRef))
      .subscribe(({ error }) => {
        // La modal reste ouverte avec les valeurs saisies
        this.isSaving = false;
        this.pendingDocs = null;
        this.toastService.error(error || "L'enregistrement a échoué.", 'Erreur');
      });

    // ── Réponses du serveur : suppression ───────────────────
    this.actions$
      .pipe(ofType(deletebesoinSuccess, deletemultiplebesoinSuccess), takeUntilDestroyed(this.destroyRef))
      .subscribe(action => {
        const multiple = action.type === deletemultiplebesoinSuccess.type;
        const count = multiple ? action.id.split(',').filter(s => s.trim() !== '').length : 1;
        this.toastService.success(
          count > 1 ? `${count} besoins supprimés avec succès !` : 'Besoin supprimé avec succès !',
          'Succès'
        );
        this.afterDeleteActions();
      });

    this.actions$
      .pipe(ofType(deletebesoinFailure, deletemultiplebesoinFailure), takeUntilDestroyed(this.destroyRef))
      .subscribe(({ error }) => {
        this.isDeleting = false;
        this.deleteID = null;
        this.closeDeleteModal();
        this.toastService.error(error || 'La suppression a échoué.', 'Erreur');
      });

    // Listes de référence (une seule fois)
    this.store.dispatch(fetchuserNoPaginateData());
    this.store.dispatch(fetchprioriteNoPaginateData());
    this.store.dispatch(fetchtypebesoinNoPaginateData());
    this.store.dispatch(fetchetatNoPaginateData());
    this.store.dispatch(fetchdepartementNoPaginateData());
    this.store.dispatch(fetchstatistiquebesoinData());

    this.loadData(1);
  }

  ngAfterViewInit() {
    this.addBesoin?.onHidden
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.resetModalState());

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
    this.store.dispatch(fetchbesoinData({ page, search }));
  }

  // ══════════════════════════════════════════════════════════
  // Styles états
  // ══════════════════════════════════════════════════════════
  getEtatStyle(etat: string | null | undefined): { icon: string; textClass: string; borderClass: string } {
    switch ((etat ?? '').toLowerCase()) {
      case 'clôturé':
      case 'cloturé':
      case 'clôturés':
        return { icon: 'bi-patch-check-fill', textClass: 'text-success', borderClass: 'border border-success-subtle' };
      case 'en attente':
        return { icon: 'bi-file-earmark-text', textClass: 'text-primary', borderClass: 'border border-primary-subtle' };
      case 'en cours':
        return { icon: 'bi-clock-history', textClass: 'text-warning', borderClass: 'border border-warning-subtle' };
      case 'annulé':
      case 'annulés':
        return { icon: 'bi-x-circle', textClass: 'text-danger', borderClass: 'border border-danger-subtle' };
      default:
        return { icon: 'bi-question-circle', textClass: 'text-secondary', borderClass: 'border border-secondary-subtle' };
    }
  }

  getBadgeClass(etat: string | null | undefined): string {
    switch ((etat ?? '').toLowerCase()) {
      case 'clôturé':
      case 'cloturé':    return 'bg-success-subtle text-success';
      case 'annulé':     return 'bg-danger-subtle text-danger';
      case 'en cours':   return 'bg-warning-subtle text-warning';
      case 'en attente': return 'bg-info-subtle text-info';
      default:           return 'bg-secondary-subtle text-secondary';
    }
  }

  getPourcentageNonCloture(): number {
    if (!this.statistiques || !this.statistiques.total_besoin) return 0;
    return Math.round((this.statistiques.total_non_cloture / this.statistiques.total_besoin) * 100);
  }

  // ══════════════════════════════════════════════════════════
  // Dates : <input type="datetime-local"> ⇄ ISO 8601
  // ══════════════════════════════════════════════════════════
  private versSaisieLocale(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  private versIso(locale: string | null | undefined): string {
    if (!locale) return '';
    const d = new Date(locale);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }

  // ══════════════════════════════════════════════════════════
  // Fichiers / Documents
  // ══════════════════════════════════════════════════════════
  isImage(documentPath: string): boolean {
    if (!documentPath) return false;
    const path = documentPath.split('?')[0];
    return ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].some(ext =>
      path.toLowerCase().endsWith(ext)
    );
  }

  getFullUrl(documentPath: string): string {
    if (!documentPath) return '';
    // URL complète renvoyée par Django : utilisée telle quelle
    if (documentPath.startsWith('http://') || documentPath.startsWith('https://')) {
      return documentPath;
    }
    // Chemin relatif (ex : /media/documents_besoins/...)
    return this.baseUrl + documentPath;
  }

  getFileName(documentPath: string): string {
    if (!documentPath) return 'Document';
    return decodeURIComponent(documentPath.split('?')[0].split('/').pop() || 'Document');
  }

  // Vérifie l'extension (le serveur refuse les autres types)
  private fichierAutorise(file: File): boolean {
    const ext = (file?.name ?? '').split('.').pop()?.toLowerCase() ?? '';
    if (!EXTENSIONS_AUTORISEES.includes(ext)) {
      this.toastService.error(
        `« ${file?.name} » : type de fichier non autorisé (PDF, DOCX, JPG, PNG).`, 'Erreur'
      );
      return false;
    }
    return true;
  }

  onFileAdded(file: File) {
    if (!this.fichierAutorise(file)) return;
    if (!this.rawFiles.includes(file)) {
      this.rawFiles = [...this.rawFiles, file];
    }
  }

  removeFile(file: File) {
    this.rawFiles = this.rawFiles.filter(f => f !== file);
  }

  // ══════════════════════════════════════════════════════════
  // Modal ajout / modification
  // ══════════════════════════════════════════════════════════
  private resetModalState() {
    this.isEdit            = false;
    this.isSaving          = false;
    this.editingBesoinId   = null;
    this.existingDocuments = [];
    this.removedDocuments  = [];
    this.rawFiles          = [];
    this.pendingDocs       = null;
    this.dropzoneAjout?.directiveRef?.reset();
    this.besoinForm.reset({
      id: null, titre: '', description: '', typebesoin: null, priorite: null,
      user: null, etat: null, date_debut: '', date_fin: '', commentaire: '',
    });
  }

  private restoreFocus() {
    (this.lastActiveElement ?? document.body).focus();
  }

  openAddModal() {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.resetModalState();
    // État proposé par défaut : « En attente » s'il existe
    const enAttente = this.etatlistes.find(e => (e.libelle_etat ?? '').toLowerCase() === 'en attente');
    if (enAttente) this.besoinForm.patchValue({ etat: enAttente.id });
    // Demandeur proposé par défaut : l'administrateur connecté
    const moi = this.tokenStorage.getUser()?.id;
    if (moi) this.besoinForm.patchValue({ user: moi });
    this.addBesoin?.show();
  }

  closeAddModal() {
    this.restoreFocus();
    setTimeout(() => this.addBesoin?.hide(), 10);
  }

  editList(id: any) {
    const editData = this.besoins.find(p => p.id === id);
    if (!editData) {
      this.toastService.error('Besoin introuvable', 'Erreur');
      return;
    }
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.resetModalState();
    this.isEdit            = true;
    this.editingBesoinId   = editData.id;
    this.existingDocuments = editData.documents ? [...editData.documents] : [];

    this.besoinForm.patchValue({
      id:          editData.id,
      titre:       editData.titre,
      description: editData.description,
      commentaire: editData.commentaire ?? '',
      typebesoin:  editData.typebesoin,
      priorite:    editData.priorite,
      etat:        editData.etat,
      user:        editData.user,
      date_debut:  this.versSaisieLocale(editData.date_debut),
      date_fin:    this.versSaisieLocale(editData.date_fin),
    });
    this.addBesoin?.show();
  }

  // Marquer un document existant pour suppression (effective à l'enregistrement)
  markDocumentForDeletion(doc: BesoinDocumentModel) {
    this.existingDocuments = this.existingDocuments.filter(d => d.id !== doc.id);
    this.removedDocuments  = [...this.removedDocuments, doc];
  }

  // Annuler le marquage
  restoreDocuments() {
    this.existingDocuments = [...this.existingDocuments, ...this.removedDocuments];
    this.removedDocuments  = [];
  }

  saveProperty() {
    if (this.besoinForm.invalid) {
      this.besoinForm.markAllAsTouched();
      this.toastService.error(
        this.besoinForm.hasError('datesIncoherentes')
          ? 'La date de fin doit être postérieure à la date de début.'
          : 'Veuillez vérifier les informations saisies.',
        'Erreur'
      );
      return;
    }
    if (this.isSaving) return;

    const v = this.besoinForm.value;
    const donnees = {
      titre:       (v.titre ?? '').trim(),
      description: (v.description ?? '').trim(),
      commentaire: v.commentaire ?? '',
      typebesoin:  v.typebesoin,
      priorite:    v.priorite,
      etat:        v.etat,
      user:        v.user,
      date_debut:  this.versIso(v.date_debut),
      date_fin:    this.versIso(v.date_fin),
    };

    this.isSaving = true;

    if (this.isEdit && v.id) {
      // Les documents sont traités après acceptation de la mise à jour
      this.pendingDocs = {
        besoinId: v.id,
        files:    [...this.rawFiles],
        toDelete: this.removedDocuments.map(d => d.id),
      };
      this.store.dispatch(updatebesoinData({ updatedData: { id: v.id, ...donnees } }));
      return;
    }

    // Création : FormData + documents[] (POST /api/besoins/creer/)
    const fd = new FormData();
    Object.entries(donnees).forEach(([cle, valeur]) => fd.append(cle, valeur == null ? '' : String(valeur)));
    this.rawFiles.forEach(file => fd.append('documents[]', file, file.name));
    this.store.dispatch(addbesoinData({ newData: fd }));
  }

  // Mise à jour acceptée : suppression / ajout des documents, puis fermeture
  private apresMiseAJour() {
    const docs = this.pendingDocs;
    this.pendingDocs = null;

    const operations: Observable<any>[] = [];
    if (docs) {
      docs.toDelete.forEach(docId => operations.push(this.besoinService.deleteDocument(docs.besoinId, docId)));
      if (docs.files.length > 0) operations.push(this.besoinService.addDocuments(docs.besoinId, docs.files));
    }

    const suite$: Observable<unknown> = operations.length ? forkJoin(operations) : of(null);
    suite$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSaving = false;
          this.toastService.success('Besoin mis à jour avec succès !', 'Succès');
          this.closeAddModal();
          if (operations.length) this.loadData(this.currentPage);
        },
        error: (err: unknown) => {
          // Le besoin est enregistré : on ferme et on recharge pour refléter l'état réel
          this.isSaving = false;
          this.toastService.warning(
            `Besoin mis à jour, mais une erreur est survenue sur les documents : ${typeof err === 'string' ? err : 'erreur inconnue'}`,
            'Attention'
          );
          this.closeAddModal();
          this.loadData(this.currentPage);
        },
      });
  }

  // ══════════════════════════════════════════════════════════
  // Suppression
  // ══════════════════════════════════════════════════════════
  removeItem(id: any) {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.deleteID = id;
    this.deleteRecordModal?.show();
  }

  removeSelected() {
    if (this.checkedValGet.length === 0) {
      this.toastService.error('Aucun besoin sélectionné.', 'Erreur');
      return;
    }
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.deleteID = null;
    this.deleteRecordModal?.show();
  }

  get deleteMessage(): string {
    if (this.deleteID == null && this.checkedValGet.length > 1) {
      return `Voulez-vous vraiment supprimer ces ${this.checkedValGet.length} besoins et leurs documents ?`;
    }
    return 'Voulez-vous vraiment supprimer ce besoin et ses documents ?';
  }

  closeDeleteModal() {
    this.restoreFocus();
    setTimeout(() => this.deleteRecordModal?.hide(), 10);
  }

  confirmDelete() {
    if (this.isDeleting) return;

    if (this.deleteID != null) {
      this.isDeleting = true;
      this.store.dispatch(deletebesoinData({ id: this.deleteID.toString() }));
      return;
    }
    if (this.checkedValGet.length > 0) {
      this.isDeleting = true;
      this.store.dispatch(deletemultiplebesoinData({ id: this.checkedValGet.join(',') }));
      return;
    }
    this.toastService.error('Aucun besoin sélectionné.', 'Erreur');
    this.closeDeleteModal();
  }

  private afterDeleteActions() {
    this.isDeleting = false;
    this.closeDeleteModal();
    this.masterSelected = false;
    this.deleteID       = null;
    this.checkedValGet  = [];
  }

  // ══════════════════════════════════════════════════════════
  // Modal détails : documents et services
  // ══════════════════════════════════════════════════════════
  viewDetails(id: any) {
    const besoinData = this.besoins.find(p => p.id === id);
    if (!besoinData) {
      this.toastService.error('Besoin introuvable', 'Erreur');
      return;
    }
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.selectedBesoin = {
      ...besoinData,
      documents: [...(besoinData.documents ?? [])],
      services:  [...(besoinData.services ?? [])],
    };
    this.detailRawFiles = [];
    this.selectedServiceId = null;
    this.detailModifie = false;
    this.viewBesoin?.show();
  }

  deleteDocumentFromDetail(docId: number) {
    const besoinId = this.selectedBesoin?.id;
    if (!besoinId || !confirm('Supprimer définitivement ce document ?')) return;
    this.besoinService.deleteDocument(besoinId, docId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (this.selectedBesoin?.id === besoinId) {
            this.selectedBesoin = {
              ...this.selectedBesoin,
              documents: this.selectedBesoin.documents.filter((d: any) => d.id !== docId),
            };
          }
          this.detailModifie = true;
          this.toastService.success('Document supprimé avec succès.', 'Succès');
        },
        error: (err) => this.toastService.error(
          typeof err === 'string' && err ? err : 'Échec lors de la suppression du document.', 'Erreur'),
      });
  }

  onDetailFileAdded(file: File) {
    if (!this.fichierAutorise(file)) return;
    if (!this.detailRawFiles.includes(file)) {
      this.detailRawFiles = [...this.detailRawFiles, file];
    }
  }

  clearDetailFiles() {
    this.detailRawFiles = [];
    this.dropzoneDetail?.directiveRef?.reset();
  }

  uploadDocumentsToDetail() {
    const besoinId = this.selectedBesoin?.id;
    if (!besoinId || this.detailRawFiles.length === 0 || this.isUploadingDetail) return;
    this.isUploadingDetail = true;
    this.besoinService.addDocuments(besoinId, this.detailRawFiles)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (newDocs) => {
          this.isUploadingDetail = false;
          if (this.selectedBesoin?.id === besoinId) {
            this.selectedBesoin = {
              ...this.selectedBesoin,
              documents: [...(this.selectedBesoin.documents || []), ...(newDocs ?? [])],
            };
          }
          this.clearDetailFiles();
          this.detailModifie = true;
          this.toastService.success(`${newDocs?.length ?? 0} document(s) ajouté(s) avec succès.`, 'Succès');
        },
        error: (err) => {
          this.isUploadingDetail = false;
          this.toastService.error(
            typeof err === 'string' && err ? err : "Échec lors de l'envoi des documents.", 'Erreur');
        },
      });
  }

  // Services non encore affectés au besoin affiché
  get servicesDisponibles(): any[] {
    const affectes = new Set((this.selectedBesoin?.services ?? []).map((s: BesoinServiceModel) => s.service));
    return this.servicesListe.filter(s => !affectes.has(s.id));
  }

  assignService() {
    const besoinId = this.selectedBesoin?.id;
    const serviceId = this.selectedServiceId;
    if (!besoinId || serviceId == null || this.isSavingService) return;
    this.isSavingService = true;
    this.besoinService.addServiceToBesoin(besoinId, serviceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (bs) => {
          this.isSavingService = false;
          if (this.selectedBesoin?.id === besoinId) {
            this.selectedBesoin = {
              ...this.selectedBesoin,
              services: [...(this.selectedBesoin.services ?? []), bs],
            };
          }
          this.selectedServiceId = null;
          this.detailModifie = true;
          this.toastService.success('Service affecté au besoin.', 'Succès');
        },
        error: (err) => {
          this.isSavingService = false;
          this.toastService.error(
            typeof err === 'string' && err ? err : "Échec de l'affectation du service.", 'Erreur');
        },
      });
  }

  removeService(bs: BesoinServiceModel) {
    const besoinId = this.selectedBesoin?.id;
    if (!besoinId || this.isSavingService) return;
    this.isSavingService = true;
    this.besoinService.removeServiceFromBesoin(bs.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSavingService = false;
          if (this.selectedBesoin?.id === besoinId) {
            this.selectedBesoin = {
              ...this.selectedBesoin,
              services: this.selectedBesoin.services.filter((s: BesoinServiceModel) => s.id !== bs.id),
            };
          }
          this.detailModifie = true;
          this.toastService.success('Service retiré du besoin.', 'Succès');
        },
        error: (err) => {
          this.isSavingService = false;
          this.toastService.error(
            typeof err === 'string' && err ? err : 'Échec du retrait du service.', 'Erreur');
        },
      });
  }

  libelleService(bs: BesoinServiceModel): string {
    return bs.service_libelle
      ?? this.servicesListe.find(s => s.id === bs.service)?.libelle_service
      ?? `Service n° ${bs.service}`;
  }

  closeViewModal() {
    this.clearDetailFiles();
    this.restoreFocus();
    const recharger = this.detailModifie;
    this.detailModifie = false;
    setTimeout(() => {
      this.viewBesoin?.hide();
      this.selectedBesoin = null;
    }, 10);
    // Documents / services modifiés : la liste reflète l'état du serveur
    if (recharger) this.loadData(this.currentPage);
  }

  // ══════════════════════════════════════════════════════════
  // Checkboxes / tri / recherche / pagination
  // ══════════════════════════════════════════════════════════
  checkUncheckAll(ev: any) {
    this.besoins.forEach(x => x.state = ev.target.checked);
    this.masterSelected = ev.target.checked;
    this.updateCheckedValues();
  }

  onCheckboxChange() {
    this.updateCheckedValues();
  }

  private updateCheckedValues() {
    this.checkedValGet = this.besoins.filter(item => item.state === true).map(item => item.id);
    this.masterSelected = this.besoins.length > 0 && this.checkedValGet.length === this.besoins.length;
  }

  // Tri (page courante)
  onSort(column: any) {
    this.direction = this.direction === 'asc' ? 'desc' : 'asc';
    this.besoins = [...this.besoins].sort((a, b) => {
      const res = this.compare(a[column] ?? '', b[column] ?? '');
      return this.direction === 'asc' ? res : -res;
    });
  }

  compare(v1: string | number, v2: string | number) {
    return v1 < v2 ? -1 : v1 > v2 ? 1 : 0;
  }

  // Recherche (debounce 300 ms, côté serveur : référence, titre, description)
  onSearchChange(value: string) {
    this.search$.next((value ?? '').trim());
  }

  pageChanged(event: PageChangedEvent): void {
    if (event.page === this.currentPage) return;
    this.loadData(event.page);
  }
}
