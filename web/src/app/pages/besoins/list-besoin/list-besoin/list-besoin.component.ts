// list-besoin.component.ts

import { Component, ViewChild, ElementRef } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { take } from 'rxjs';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { DatePipe } from '@angular/common';
import { DropzoneConfigInterface } from 'ngx-dropzone-wrapper';
import { Store } from '@ngrx/store';
import {
  addbesoinData,
  addNoAuthbesoinData,
  addNoAuthbesoinDataSuccess,
  addNoAuthbesoinDataFailure,
  deletebesoinData,
  deletemultiplebesoinData,
  fetchbesoinData,
  updatebesoinData,
  updatebesoinDataSuccess,
  updatebesoinDataFailure,
  addbesoinDataSuccess,
  addbesoinDataFailure,
  fetchstatistiquebesoinData,
} from 'src/app/store/Besoin/besoin.action';
import {
  selectbesoinData,
  selectTotalItems,
  selectLoading,
  selectCurrentPage,
  selectStatistiqueGlobale,
} from 'src/app/store/Besoin/besoin-selector';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';
import { Actions, ofType } from '@ngrx/effects';

// ✅ Listes sans pagination pour les selects
import { selectAllTypebesoinWithoutPagination } from 'src/app/store/Typebesoin/typebesoin-selector';
import { fetchtypebesoinNoPaginateData } from 'src/app/store/Typebesoin/typebesoin.action';

import { selectAllPrioritesWithoutPagination } from 'src/app/store/Priorite/priorite-selector';
import { fetchprioriteNoPaginateData } from 'src/app/store/Priorite/priorite.action';

import { selectAllEtatWithoutPagination } from 'src/app/store/Etat/etat-selector';
import { fetchetatNoPaginateData } from 'src/app/store/Etat/etat.action';

// ✅ Users sans pagination
import { selectAlluserWithoutPagination } from 'src/app/store/User/user-selector';
import { fetchuserNoPaginateData } from 'src/app/store/User/user.action';

import { StatistiqueGlobale } from 'src/app/store/Besoin/besoin.model';
import { BesoinService } from 'src/app/core/services/besoin/besoin.service';

@Component({
  selector: 'app-list-besoin',
  templateUrl: './list-besoin.component.html',
  styleUrl: './list-besoin.component.scss',
  providers: [DecimalPipe],
})
export class ListBesoinComponent {

  breadCrumbItems!: Array<{}>;

  besoins: any[]     = [];
  besoinList: any[]  = [];
  totalItems: number = 0;
  currentPage: number = 1;
  isLoading: boolean = true;

  besoinForm!: UntypedFormGroup;
  submitted    = false;
  masterSelected!: boolean;
  term: any;
  checkedValGet: any[] = [];

  priorites:   any[] = [];
  typebesoins: any[] = [];
  users:       any[] = [];
  etatlistes:  any[] = [];

  statistiques: StatistiqueGlobale | null = null;

  private lastActiveElement: HTMLElement | null = null;

  @ViewChild('addBesoin',        { static: false }) addBesoin?:        ModalDirective;
  @ViewChild('deleteRecordModal',{ static: false }) deleteRecordModal?: ModalDirective;
  @ViewChild('viewBesoin',       { static: false }) viewBesoin?:       ModalDirective;

  selectedBesoin: any = null;
  deleteID: any;
  direction: any = 'asc';

  // ── URL de base pour les fichiers ──────────────────────────
  baseUrl = 'http://localhost:8000';

  // ── Gestion documents en mode modification ─────────────────
  editingBesoinId: number | null = null;        // ID du besoin en cours de modification
  existingDocuments: any[]       = [];           // documents déjà rattachés (depuis l'API)
  docsToDelete: number[]         = [];           // IDs documents à supprimer (marqués)

  // ── Dropzone ───────────────────────────────────────────────
  public dropzoneConfig: DropzoneConfigInterface = {
    clickable: true,
    addRemoveLinks: true,
    previewsContainer: false,
    autoProcessQueue: false,  // ✅ on gère l'envoi manuellement via FormData
  };
  uploadedFiles: any[] = []; // preview affichage
  rawFiles: File[]     = []; // ✅ vrais fichiers File pour FormData → documents[]

  // ── Dropzone modal détails (ajout docs à un besoin existant) ──
  public dropzoneConfigDetail: DropzoneConfigInterface = {
    clickable: true,
    addRemoveLinks: true,
    previewsContainer: false,
    autoProcessQueue: false,
  };
  detailRawFiles: File[] = [];

  constructor(
    private formBuilder: UntypedFormBuilder,
    private datePipe: DatePipe,
    public toastService: ToastrService,
    public store: Store,
    private actions$: Actions,
    private besoinService: BesoinService,  // ✅ pour add/delete documents
  ) {}

  // ══════════════════════════════════════════════════════════
  // ngOnInit
  // ══════════════════════════════════════════════════════════
  ngOnInit(): void {
    this.breadCrumbItems = [
      { label: 'Besoin', active: true },
      { label: 'Besoin List', active: true },
    ];

    this.besoinForm = this.formBuilder.group({
      id:          [''],
      titre:       ['', [Validators.required]],
      description: ['', [Validators.required]],
      typebesoin:  ['', [Validators.required]],
      priorite:    ['', [Validators.required]],
      user:        ['', [Validators.required]],
      etat:        [8, [Validators.required]],
      date_debut:  ['2025-03-31T00:00:00Z'],
      date_fin:    ['2025-04-01T00:00:00Z'],
      commentaire: [''],
    });

    // ── Loading ─────────────────────────────────────────────
    this.store.select(selectLoading).subscribe(loading => {
      this.isLoading = loading;
      const loader = document.getElementById('elmLoader');
      if (loader) loader.classList.toggle('d-none', !loading);
    });

    // ── Total & page courante ───────────────────────────────
    this.store.select(selectTotalItems).subscribe(total   => this.totalItems  = total  || 0);
    this.store.select(selectCurrentPage).subscribe(page   => this.currentPage = page   || 1);

    // ── Données besoins ─────────────────────────────────────
    this.store.select(selectbesoinData).subscribe(data => {
      if (data) {
        this.besoins    = data.map(item => ({ ...item, state: false }));
        this.besoinList = [...this.besoins];
        this.updateNoResultDisplay();
      }
    });

    // ── Selects (listes sans pagination) ───────────────────
    // ✅ Users sans pagination
    this.store.select(selectAlluserWithoutPagination).subscribe(data => {
      if (data) this.users = data;
    });

    // ✅ Priorités sans pagination
    this.store.select(selectAllPrioritesWithoutPagination).subscribe(data => {
      if (data) this.priorites = data;
    });

    // ✅ Types besoin sans pagination
    this.store.select(selectAllTypebesoinWithoutPagination).subscribe(data => {
      if (data) this.typebesoins = data;
    });

    // ✅ Etats sans pagination
    this.store.select(selectAllEtatWithoutPagination).subscribe(data => {
      if (data) this.etatlistes = data;
    });

    // ── Statistiques ────────────────────────────────────────
    this.store.select(selectStatistiqueGlobale).subscribe(data => {
      if (data) this.statistiques = data;
    });

    this.loadData(1);
  }

  ngAfterViewInit() {
    this.addBesoin?.onHidden.subscribe(() => {
      // ✅ Réinitialiser uniquement si pas d'opération async en cours
      // (saveProperty capture les données avant closeAddModal, donc c'est safe)
      this.resetModalState();
    });

    this.deleteRecordModal?.onHidden.subscribe(() => {
      this.deleteID = null;
    });
  }

  // ══════════════════════════════════════════════════════════
  // Chargement des données
  // ══════════════════════════════════════════════════════════
  loadData(page: number = 1): void {
    this.store.dispatch(fetchbesoinData({ page }));
    // ✅ Listes sans pagination pour les selects
    this.store.dispatch(fetchuserNoPaginateData());
    this.store.dispatch(fetchprioriteNoPaginateData());
    this.store.dispatch(fetchtypebesoinNoPaginateData());
    this.store.dispatch(fetchetatNoPaginateData());
    this.store.dispatch(fetchstatistiquebesoinData());
  }

  // ══════════════════════════════════════════════════════════
  // Styles états
  // ══════════════════════════════════════════════════════════
  getEtatStyle(etat: string): { icon: string; textClass: string; borderClass: string } {
    switch (etat.toLowerCase()) {
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

  getBadgeClass(etat: string): string {
    switch (etat) {
      case 'Clôturé':   return 'bg-success-subtle text-success';
      case 'Annulé':    return 'bg-danger-subtle text-danger';
      case 'En cours':  return 'bg-warning-subtle text-warning';
      case 'En attente':return 'bg-info-subtle text-info';
      default:          return 'bg-secondary-subtle text-secondary';
    }
  }

  getPourcentageNonCloture(): number {
    if (!this.statistiques || this.statistiques.total_besoin === 0) return 0;
    return Math.round((this.statistiques.total_non_cloture / this.statistiques.total_besoin) * 100);
  }

  // ══════════════════════════════════════════════════════════
  // Fichiers / Documents
  // ══════════════════════════════════════════════════════════
  isImage(documentPath: string): boolean {
    if (!documentPath) return false;
    // ✅ Fonctionner avec URL complète ou chemin relatif
    const path = documentPath.split('?')[0]; // supprimer query params éventuels
    return ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].some(ext =>
      path.toLowerCase().endsWith(ext)
    );
  }

  getFullUrl(documentPath: string): string {
    if (!documentPath) return '';
    // ✅ Si le chemin contient déjà http (URL complète retournée par Django), ne pas ajouter baseUrl
    if (documentPath.startsWith('http://') || documentPath.startsWith('https://')) {
      return documentPath;
    }
    // Chemin relatif (ex: /media/documents_besoins/...) → ajouter baseUrl
    return this.baseUrl + documentPath;
  }

  getFileName(documentPath: string): string {
    return documentPath.split('/').pop() || 'Document';
  }

  // ── Dropzone ───────────────────────────────────────────────
  // Dropzone appelle onUploadSuccess(event) avec event = [file, serverResponse]
  // Avec autoProcessQueue: false, le fichier n'est pas envoyé — on le stocke
  onUploadSuccess(event: any) {
    setTimeout(() => {
      const file: File = event[0];
      this.uploadedFiles.push(file);  // affichage preview
      this.rawFiles.push(file);        // ✅ pour le FormData
    }, 0);
  }

  // Appelé aussi par l'event "addedfile" si autoProcessQueue: false
  onFileAdded(file: File) {
    if (!this.rawFiles.includes(file)) {
      this.uploadedFiles.push(file);
      this.rawFiles.push(file);
    }
  }

  removeFile(file: any) {
    const idx = this.uploadedFiles.indexOf(file);
    if (idx > -1) {
      this.uploadedFiles.splice(idx, 1);
      this.rawFiles.splice(idx, 1);
    }
  }

  // ══════════════════════════════════════════════════════════
  // Modals
  // ══════════════════════════════════════════════════════════
  // ── Réinitialiser tous les états de la modal ──────────────
  private resetModalState() {
    this.editingBesoinId   = null;
    this.existingDocuments = [];
    this.docsToDelete      = [];
    this.uploadedFiles     = [];
    this.rawFiles          = [];
    this.besoinForm.reset({
      id: '', titre: '', description: '', typebesoin: '',
      priorite: '', user: '', etat: '', date_debut: '', date_fin: '', commentaire: '',
    });
    const title = document.querySelector('.modal-title') as HTMLElement;
    if (title) title.innerHTML = 'Ajouter un besoin';
    const btn = document.getElementById('add-btn') as HTMLElement;
    if (btn) btn.innerHTML = 'Ajouter';
  }

  closeAddModal() {
    (this.lastActiveElement ?? document.body).focus();
    // ✅ NE PAS vider rawFiles/docsToDelete ici si une opération async est en cours
    // resetModalState() est appelé explicitement après les opérations async dans saveProperty
    this.addBesoin?.hide();
    const title = document.querySelector('.modal-title') as HTMLElement;
    if (title) title.innerHTML = 'Ajouter un besoin';
    const btn = document.getElementById('add-btn') as HTMLElement;
    if (btn) btn.innerHTML = 'Ajouter';
  }

  editList(id: any) {
    this.lastActiveElement = document.activeElement as HTMLElement;

    const editData = typeof id === 'number'
      ? this.besoins[id]
      : this.besoins.find(p => p.id === id);

    if (!editData) return;

    // ── Réinitialiser l'état documents ──────────────────────
    this.editingBesoinId   = editData.id;
    this.existingDocuments = editData.documents ? [...editData.documents] : [];
    this.docsToDelete      = [];
    this.uploadedFiles     = [];
    this.rawFiles          = [];

    this.addBesoin?.show();

    const title = document.querySelector('.modal-title') as HTMLElement;
    if (title) title.innerHTML = 'Modifier le besoin';
    const btn = document.getElementById('add-btn') as HTMLElement;
    if (btn) btn.innerHTML = 'Mettre à jour';

    // ✅ Formatter les dates ISO → format attendu par datetime-local (YYYY-MM-DDTHH:mm)
    const formatDateLocal = (iso: string) => iso ? iso.substring(0, 16) : '';

    this.besoinForm.patchValue({
      id:          editData.id,
      titre:       editData.titre,
      description: editData.description,
      commentaire: editData.commentaire ?? '',
      typebesoin:  editData.typebesoin,
      priorite:    editData.priorite,
      etat:        editData.etat,
      user:        editData.user,
      date_debut:  formatDateLocal(editData.date_debut),
      date_fin:    formatDateLocal(editData.date_fin),
    });
  }

  // ── Marquer un document existant pour suppression ──────────
  markDocumentForDeletion(docId: number) {
    if (!this.docsToDelete.includes(docId)) {
      this.docsToDelete.push(docId);
    }
    // Retirer de l'affichage immédiatement (UX)
    this.existingDocuments = this.existingDocuments.filter(d => d.id !== docId);
  }

  // ── Annuler le marquage (restaurer dans la liste) ──────────
  restoreDocument(doc: any) {
    this.docsToDelete      = this.docsToDelete.filter(id => id !== doc.id);
    this.existingDocuments = [...this.existingDocuments, doc];
  }

  saveProperty() {
    if (!this.besoinForm.valid) {
      this.toastService.error('Veuillez vérifier les informations saisies.', 'Erreur');
      return;
    }

    const formValue = { ...this.besoinForm.value };
    const isUpdate  = !!formValue.id;
    if (!formValue.id) delete formValue.id;

    if (isUpdate) {
      // ── 1. Mise à jour des champs du besoin (JSON) ─────────
      // ✅ Capturer AVANT dispatch — le dispatch est synchrone mais le callback est async
      const besoinId     = this.editingBesoinId!;
      const filesToAdd   = [...this.rawFiles];
      const docsToRemove = [...this.docsToDelete];

      // ✅ Fermer la modal MAINTENANT (UX) — les données sont capturées ci-dessus
      this.closeAddModal();
      this.resetModalState();

      this.actions$.pipe(ofType(updatebesoinDataSuccess, updatebesoinDataFailure), take(1))
        .subscribe(action => {
          if (action.type === updatebesoinDataSuccess.type) {

            console.log('[UPDATE] besoinId:', besoinId);
            console.log('[UPDATE] filesToAdd:', filesToAdd.length, 'fichiers');
            console.log('[UPDATE] docsToRemove:', docsToRemove);

            // ── 2. Supprimer les documents marqués ──────────
            const deleteOps = docsToRemove.map(docId => {
              console.log('[DELETE DOC]', docId, 'sur besoin', besoinId);
              return this.besoinService.deleteDocument(besoinId, docId).toPromise();
            });

            // ── 3. Ajouter les nouveaux documents ───────────
            const addOp = filesToAdd.length > 0
              ? (() => {
                  console.log('[ADD DOCS]', filesToAdd.length, 'fichiers sur besoin', besoinId);
                  return this.besoinService.addDocuments(besoinId, filesToAdd).toPromise();
                })()
              : Promise.resolve(null);

            Promise.all([...deleteOps, addOp])
              .then((results) => {
                console.log('[DONE] opérations documents terminées:', results);
                this.toastService.success('Besoin mis à jour avec succès !', 'Succès');
                this.loadData(this.currentPage);
              })
              .catch((err) => {
                console.error('[ERROR] documents:', err);
                this.toastService.warning(
                  'Besoin mis à jour mais une erreur est survenue sur les documents.',
                  'Attention'
                );
              });

          } else {
            this.toastService.error('Échec lors de la mise à jour.', 'Erreur');
          }
        });

      this.store.dispatch(updatebesoinData({ updatedData: formValue }));

    } else {
      // ── Création avec FormData + documents[] ───────────────
      // Django : BesoinCreateView → BesoinWithDocumentsSerializer
      const fd = new FormData();
      fd.append('titre',       formValue.titre       ?? '');
      fd.append('description', formValue.description ?? '');
      fd.append('commentaire', formValue.commentaire ?? '');
      fd.append('typebesoin',  formValue.typebesoin  ?? '');
      fd.append('priorite',    formValue.priorite    ?? '');
      fd.append('etat',        formValue.etat        ?? '');
      fd.append('user',        formValue.user        ?? '');
      // ✅ Convertir datetime-local (YYYY-MM-DDTHH:mm) → ISO complet pour Django
      const toISO = (d: string) => d ? (d.length === 16 ? d + ':00Z' : d) : '';
      fd.append('date_debut', toISO(formValue.date_debut));
      fd.append('date_fin',   toISO(formValue.date_fin));
      // ✅ Django : request.FILES.getlist('documents[]')
      this.rawFiles.forEach(file => fd.append('documents[]', file, file.name));

      // ✅ Appel direct au service pour garantir l'envoi du FormData avec documents[]
      // NgRx sérialise parfois les actions et perd les objets non-sérialisables (File, FormData)
      // POST /api/besoins/creer/ → BesoinCreateView → BesoinWithDocumentsSerializer
      this.besoinService.createBesoinWithDocuments(fd).subscribe({
        next: () => {
          this.toastService.success('Besoin ajouté avec succès !', 'Succès');
          this.loadData(this.currentPage);
        },
        error: (err) => {
          console.error('Erreur création besoin:', err);
          this.toastService.error("Échec lors de l'ajout : " + (err?.error?.detail ?? err?.message ?? 'Erreur inconnue'), 'Erreur');
        }
      });

      this.uploadedFiles = [];
      this.rawFiles      = [];
      this.besoinForm.reset();
      this.closeAddModal();
    }
  }

  removeItem(id: any) {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.deleteID = id;
    this.deleteRecordModal?.show();
  }

  closeDeleteModal() {
    (this.lastActiveElement ?? document.body).focus();
    setTimeout(() => this.deleteRecordModal?.hide(), 10);
  }

  confirmDelete(id?: any) {
    if (id) {
      this.store.dispatch(deletebesoinData({ id: id.toString() }));
      this.toastService.success('Besoin supprimé avec succès !', 'Succès');
    } else if (this.checkedValGet.length > 0) {
      this.store.dispatch(deletemultiplebesoinData({ id: this.checkedValGet.join(',') }));
      this.toastService.success('Besoins supprimés avec succès !', 'Succès');
    } else {
      this.toastService.error('Aucun besoin sélectionné.', 'Erreur');
      this.closeDeleteModal();
      return;
    }
    this.afterDeleteActions();
  }

  private afterDeleteActions() {
    this.closeDeleteModal();
    this.masterSelected = false;
    this.deleteID       = null;
    this.checkedValGet  = [];
  }

  viewDetails(id: any) {
    this.lastActiveElement = document.activeElement as HTMLElement;
    const besoinData = this.besoins.find(p => p.id === id);
    if (besoinData) {
      this.selectedBesoin = besoinData;
      this.viewBesoin?.show();
    } else {
      this.toastService.error('Besoin introuvable', 'Erreur');
    }
  }

  // ── Supprimer un document depuis la modal détails ─────────
  deleteDocumentFromDetail(besoinId: number, docId: number) {
    if (!confirm('Supprimer ce document ?')) return;
    this.besoinService.deleteDocument(besoinId, docId).subscribe({
      next: () => {
        // Retirer le doc de l'affichage immédiatement
        this.selectedBesoin = {
          ...this.selectedBesoin,
          documents: this.selectedBesoin.documents.filter((d: any) => d.id !== docId)
        };
        // Mettre à jour aussi dans la liste principale
        const idx = this.besoins.findIndex(b => b.id === besoinId);
        if (idx > -1) {
          this.besoins[idx] = {
            ...this.besoins[idx],
            documents: this.besoins[idx].documents.filter((d: any) => d.id !== docId)
          };
        }
        this.toastService.success('Document supprimé avec succès.', 'Succès');
      },
      error: () => this.toastService.error('Échec lors de la suppression du document.', 'Erreur')
    });
  }

  // ── Ajouter un fichier à la dropzone de la modal détails ───
  onDetailFileAdded(file: File) {
    if (!this.detailRawFiles.includes(file)) {
      this.detailRawFiles.push(file);
    }
  }

  // ── Uploader les documents depuis la modal détails ─────────
  uploadDocumentsToDetail() {
    if (!this.selectedBesoin?.id || this.detailRawFiles.length === 0) return;
    this.besoinService.addDocuments(this.selectedBesoin.id, this.detailRawFiles).subscribe({
      next: (newDocs: any[]) => {
        // Ajouter les nouveaux docs à l'affichage
        this.selectedBesoin = {
          ...this.selectedBesoin,
          documents: [...(this.selectedBesoin.documents || []), ...newDocs]
        };
        // Mettre à jour dans la liste principale
        const idx = this.besoins.findIndex(b => b.id === this.selectedBesoin.id);
        if (idx > -1) {
          this.besoins[idx] = { ...this.besoins[idx], documents: this.selectedBesoin.documents };
        }
        this.detailRawFiles = [];
        this.toastService.success(`${newDocs.length} document(s) ajouté(s) avec succès.`, 'Succès');
      },
      error: () => this.toastService.error("Échec lors de l'upload des documents.", 'Erreur')
    });
  }

  closeViewModal() {
    this.detailRawFiles = [];
    (this.lastActiveElement ?? document.body).focus();
    setTimeout(() => {
      this.viewBesoin?.hide();
      this.selectedBesoin = null;
    }, 10);
  }

  // ══════════════════════════════════════════════════════════
  // Checkboxes / tri / filtre / pagination
  // ══════════════════════════════════════════════════════════
  checkUncheckAll(ev: any) {
    if (!this.besoins) return;
    this.besoins.forEach(x => { if (x) x.state = ev.target.checked; });
    this.masterSelected = ev.target.checked;
    this.updateCheckedValues();
  }

  onCheckboxChange(_e: any) {
    this.updateCheckedValues();
  }

  private updateCheckedValues() {
    this.checkedValGet = this.besoins
      .filter(item => item && item.state === true)
      .map(item => item.id);
  }

  onSort(column: any) {
    this.direction = this.direction === 'asc' ? 'desc' : 'asc';
    this.besoins = [...this.besoins].sort((a, b) => {
      const res = this.compare(a[column], b[column]);
      return this.direction === 'asc' ? res : -res;
    });
  }

  compare(v1: string | number, v2: string | number) {
    return v1 < v2 ? -1 : v1 > v2 ? 1 : 0;
  }

  filterdata() {
    if (this.term) {
      this.besoins = this.besoinList.filter(el =>
        el.titre?.toLowerCase().includes(this.term.toLowerCase()) ||
        el.id?.toString().includes(this.term)
      );
    } else {
      this.loadData(this.currentPage);
    }
    this.updateNoResultDisplay();
  }

  updateNoResultDisplay() {
    const el = document.querySelector('.noresult') as HTMLElement;
    if (el) el.style.display = this.term && this.besoins.length === 0 ? 'block' : 'none';
  }

  pageChanged(event: PageChangedEvent): void {
    this.loadData(event.page);
  }
}
