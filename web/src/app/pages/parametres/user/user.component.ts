// src/app/pages/user/user.component.ts

import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import {
  UntypedFormBuilder, UntypedFormGroup, Validators, AbstractControl,
  ValidationErrors, ValidatorFn,
} from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { Actions, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';
import { Observable, Subject, concat, of } from 'rxjs';
import { catchError, map, switchMap, takeUntil, toArray } from 'rxjs/operators';

import {
  deleteuserData, deletemultipleuserData, fetchuserData,
  activerUser, desactiverUser,
  activerMultipleUsers, desactiverMultipleUsers,
  deleteuserFailure, deletemultipleuserFailure,
  activerUserFailure, desactiverUserFailure,
  activerMultipleUsersFailure, desactiverMultipleUsersFailure,
} from 'src/app/store/User/user.action';
import {
  selectuserData, selectTotalItems, selectLoading, selectCurrentPage,
} from 'src/app/store/User/user-selector';

import { selectAllSatutWithoutPagination } from 'src/app/store/Statut/statut-selector';
import { fetchstatutNoPaginateData } from 'src/app/store/Statut/statut.action';
import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';
import { selectAllDepartementWithoutPagination } from 'src/app/store/Departement/departement-selector';
import { fetchdepartementNoPaginateData } from 'src/app/store/Departement/departement.action';
import { selectAllPosteWithoutPagination } from 'src/app/store/Poste/poste-selector';
import { fetchposteNoPaginateData } from 'src/app/store/Poste/poste.action';
import { selectAllCategoriesalarieWithoutPagination } from 'src/app/store/Categoriesalarie/categoriesalarie-selector';
import { fetchcategoriesalarieNoPaginateData } from 'src/app/store/Categoriesalarie/categoriesalarie.action';



import { UserServiceModel } from 'src/app/store/UserService/user-service.model';
import { UserAgenceModel } from 'src/app/store/UserAgence/user-agence.model';
import { UserPosteModel } from 'src/app/store/UserPoste/user-poste.model';
import { UserCategoriesalarieModel } from 'src/app/store/UserCategoriesalarie/user-categoriesalarie.model';
import { UserAllergieModel } from 'src/app/store/UserAllergie/user-allergie.model';

import { RoleService } from 'src/app/core/services/role/role.service';
import { UserService } from 'src/app/core/services/user/user.service';
import { UserServiceService } from 'src/app/core/services/user-service/user-service.service';
import { UserAgenceService } from 'src/app/core/services/user-agence/user-agence.service';
import { UserPosteService } from 'src/app/core/services/user-poste/user-poste.service';
import { UserCategoriesalarieService } from 'src/app/core/services/user-categoriesalarie/user-categoriesalarie.service';
import { UserAllergieService } from 'src/app/core/services/user-allergie/user-allergie.service';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ============================================================
// VALIDATORS
// ============================================================

export const passwordMatchValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const pwd  = group.get('password')?.value;
  const pwd2 = group.get('password2')?.value;
  return pwd && pwd2 && pwd !== pwd2 ? { passwordMismatch: true } : null;
};

export const passwordStrengthValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value || '';
  if (!value) return null;
  const errors: ValidationErrors = {};
  if (value.length < 8)                                          errors['minLength']  = true;
  if (!/[A-Z]/.test(value))                                      errors['majuscule']  = true;
  if (!/[0-9]/.test(value))                                      errors['chiffre']    = true;
  if (!/[!@#$%^&*()\[\]{}\-_=+\\|;:'",.<>?/`~]/.test(value))   errors['special']    = true;
  return Object.keys(errors).length > 0 ? errors : null;
};

@Component({
  selector: 'app-user',
  templateUrl: './user.component.html',
  styleUrl: './user.component.scss',
  providers: [DecimalPipe, DatePipe],
})
export class UserComponent implements OnInit, AfterViewInit, OnDestroy {

  breadCrumbItems = [
    { label: 'RH', active: false },
    { label: 'Utilisateurs', active: true },
  ];

  users:             any[] = [];
  userList:          any[] = [];
  statuts:           any[] = [];
  agences:           any[] = [];
  services:          any[] = [];
  postes:            any[] = [];
  categoriesalaries: any[] = [];
  groupes:           any[] = [];

  totalItems  = 0;
  currentPage = 1;
  isLoading   = true;

  userForm!:      UntypedFormGroup;
  mdpForm!:       UntypedFormGroup;
  searchForm!:    UntypedFormGroup;
  submitted       = false;
  mdpSubmitted    = false;
  masterSelected  = false;
  term: any;
  checkedValGet:  any[] = [];
  selectedUser:   any   = null;
  deleteID: any;
  direction = 'asc';
  currentUserId: number | null = null;
  showSearchPanel = false;

  isServicesLoading    = false; isServicesSubmitting    = false;
  isAgencesLoading     = false; isAgencesSubmitting     = false;
  isPostesLoading      = false; isPostesSubmitting      = false;
  isCategoriesLoading  = false; isCategoriesSubmitting  = false;
  isAllergiesLoading   = false; isAllergiesSubmitting   = false;

  serviceLignes:   UserServiceModel[]          = [];
  agenceLignes:    UserAgenceModel[]           = [];
  posteLignes:     UserPosteModel[]            = [];
  categorieLignes: UserCategoriesalarieModel[] = [];
  allergieLignes:  UserAllergieModel[]          = [];

  /** Enregistrement en cours (fiche + historique) : bouton désactivé */
  isSaving = false;
  /** Id de l'utilisateur connecté (le changement de SON mot de passe exige l'ancien) */
  connectedUserId: number | null = null;

  private destroy$ = new Subject<void>();
  private lastActiveElement: HTMLElement | null = null;

  @ViewChild('addUser',           { static: false }) addUser?:           ModalDirective;
  @ViewChild('deleteRecordModal', { static: false }) deleteRecordModal?: ModalDirective;
  @ViewChild('viewUser',          { static: false }) viewUser?:          ModalDirective;
  @ViewChild('mdpModal',          { static: false }) mdpModal?:          ModalDirective;
  @ViewChild('mainContainer',     { static: false }) mainContainer?:     ElementRef;

  constructor(
    private fb: UntypedFormBuilder,
    private toastService: ToastrService,
    private store: Store,
    private actions$: Actions,
    private roleService: RoleService,
    private userService: UserService,
    private userServiceService: UserServiceService,
    private userAgenceService: UserAgenceService,
    private userPosteService: UserPosteService,
    private userCategoriesalarieService: UserCategoriesalarieService,
    private userAllergieService: UserAllergieService,
    private tokenStorage: TokenStorageService,
  ) {}

  ngOnInit(): void {

    this.userForm = this.fb.group({
      id:              [''],
      username:        ['', [Validators.required]],
      email:           ['', [Validators.email]],
      nom:             ['', [Validators.required]],
      prenom:          ['', [Validators.required]],
      contact:         [''],
      poste_telephone: [''],
      statut:          ['', [Validators.required]],
      password:        ['', [passwordStrengthValidator]],
      password2:       [''],
      is_active:       [true],
      groups:          [[]],
    }, { validators: passwordMatchValidator });

    this.mdpForm = this.fb.group({
      old_password: [''],
      password:  ['', [Validators.required, passwordStrengthValidator]],
      password2: ['', [Validators.required]],
    }, { validators: passwordMatchValidator });

    // ✅ Recherche avancée étendue
    this.searchForm = this.fb.group({
      nom:              [''],
      prenom:           [''],
      username:         [''],
      email:            [''],
      statut:           [''],
      is_active:        [''],
      groupe:           [''],
      service:          [''],
      agence:           [''],
      poste:            [''],
      categoriesalarie: [''],
      allergie:         [''],
    });

    this.store.select(selectLoading).pipe(takeUntil(this.destroy$)).subscribe(v => this.isLoading = v);
    this.store.select(selectTotalItems).pipe(takeUntil(this.destroy$)).subscribe(v => this.totalItems = v ?? 0);
    this.store.select(selectCurrentPage).pipe(takeUntil(this.destroy$)).subscribe(v => this.currentPage = v ?? 1);
    this.store.select(selectuserData).pipe(takeUntil(this.destroy$)).subscribe(data => {
      if (data) {
        this.users    = data.map(item => ({ ...item, state: false }));
        this.userList = [...this.users];
        this.updateNoResultDisplay();
      }
    });

    this.store.dispatch(fetchstatutNoPaginateData());
    this.store.select(selectAllSatutWithoutPagination).pipe(takeUntil(this.destroy$)).subscribe(d => this.statuts = d ?? []);

    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.select(selectAllAgenceWithoutPagination).pipe(takeUntil(this.destroy$)).subscribe(d => this.agences = d ?? []);

    this.store.dispatch(fetchdepartementNoPaginateData());
    this.store.select(selectAllDepartementWithoutPagination).pipe(takeUntil(this.destroy$)).subscribe(d => this.services = d ?? []);

    this.store.dispatch(fetchposteNoPaginateData());
    this.store.select(selectAllPosteWithoutPagination).pipe(takeUntil(this.destroy$)).subscribe(d => this.postes = d ?? []);

    this.store.dispatch(fetchcategoriesalarieNoPaginateData());
    this.store.select(selectAllCategoriesalarieWithoutPagination).pipe(takeUntil(this.destroy$)).subscribe(d => this.categoriesalaries = d ?? []);

    this.roleService.getAllRolesNoPaginate().pipe(takeUntil(this.destroy$)).subscribe(data => this.groupes = data ?? []);

    this.connectedUserId = this.tokenStorage.getUser()?.id ?? null;

    // Erreurs des actions de liste (suppression, activation) : message du serveur
    this.actions$.pipe(
      ofType(deleteuserFailure, deletemultipleuserFailure, activerUserFailure, desactiverUserFailure,
             activerMultipleUsersFailure, desactiverMultipleUsersFailure),
      takeUntil(this.destroy$),
    ).subscribe(({ error }) => {
      this.toastService.error(error || 'Opération refusée.', 'Erreur');
      this.loadData(this.currentPage);
    });

    this.loadData(1);
  }

  ngAfterViewInit(): void {
    this.addUser?.onHidden.subscribe(() => {
      this.userForm.reset(); this._resetAllLignes(); this.currentUserId = null;
      this.submitted = false;
      this.setModalTitle('Ajouter un utilisateur'); this.setModalBtn('Enregistrer');
    });
    this.deleteRecordModal?.onHidden.subscribe(() => { this.deleteID = null; });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  loadData(page: number = 1): void { this.store.dispatch(fetchuserData({ page })); }

  // ══════════════════════════════════════════════════════════
  // ✅ HELPERS SOUS-STORES IMBRIQUÉS
  // Les données user_services, user_agences, etc. sont retournées
  // directement par Django dans la réponse de /users/.
  // On prend la ligne la plus récente (date_debut max).
  // ══════════════════════════════════════════════════════════

/** Service le plus récent d'un user — fourni directement par le serializer */
getDernierService(user: any): any | null {
  return user.dernier_service ?? null;
}

/** Agence la plus récente d'un user — fourni directement par le serializer */
getDerniereAgence(user: any): any | null {
  return user.derniere_agence ?? null;
}

/** Poste le plus récent d'un user — fourni directement par le serializer */
getDernierPoste(user: any): any | null {
  return user.dernier_poste ?? null;
}

/** Catégorie salarié la plus récente d'un user — fourni directement par le serializer */
getDerniereCategorie(user: any): any | null {
  return user.derniere_categoriesalarie ?? null;
}

  /** Toutes les allergies d'un user (liste complète) */
  getAllergiesStr(user: any): string {
    const al = user.user_allergies || [];
    if (al.length === 0) return '—';
    return al.map((a: any) => a.libelle).join(', ');
  }

  // ══════════════════════════════════════════════════════════
  // ✅ RECHERCHE AVANCÉE
  // ══════════════════════════════════════════════════════════

  toggleSearchPanel(): void { this.showSearchPanel = !this.showSearchPanel; }

  applySearch(): void {
    const {
      nom, prenom, username, email, statut, is_active, groupe,
      service, agence, poste, categoriesalarie, allergie
    } = this.searchForm.value;

    this.users = this.userList.filter(u => {
      // Champs directs
      const mNom      = !nom      || u.nom?.toLowerCase().includes(nom.toLowerCase());
      const mPrenom   = !prenom   || u.prenom?.toLowerCase().includes(prenom.toLowerCase());
      const mUsername = !username || u.username?.toLowerCase().includes(username.toLowerCase());
      const mEmail    = !email    || u.email?.toLowerCase().includes(email.toLowerCase());
      const mStatut   = !statut   || u.statut?.toString() === statut.toString();
      const mActif    = (is_active === '' || is_active === null || is_active === undefined)
                          ? true : u.is_active?.toString() === is_active.toString();
      const mGroupe   = !groupe   || (u.groups || []).map(Number).includes(Number(groupe));

      // ✅ Sous-stores — ligne la plus récente
      const dernierSvc  = this.getDernierService(u);
      const derniereAgc = this.getDerniereAgence(u);
      const dernierPst  = this.getDernierPoste(u);
      const derniereCat = this.getDerniereCategorie(u);

      const mService          = !service          || (dernierSvc  && dernierSvc.service?.toString()  === service.toString());
      const mAgence           = !agence           || (derniereAgc && derniereAgc.agence?.toString()  === agence.toString());
      const mPoste            = !poste            || (dernierPst  && dernierPst.poste?.toString()    === poste.toString());
      const mCategoriesalarie = !categoriesalarie || (derniereCat && derniereCat.categoriesalarie?.toString() === categoriesalarie.toString());

      // Allergie : recherche dans toutes les lignes
      const mAllergie = !allergie || (u.user_allergies || []).some((a: any) =>
        a.libelle?.toLowerCase().includes(allergie.toLowerCase())
      );

      return mNom && mPrenom && mUsername && mEmail && mStatut && mActif && mGroupe
          && mService && mAgence && mPoste && mCategoriesalarie && mAllergie;
    });

    this.updateNoResultDisplay();
  }

  resetSearch(): void {
    this.searchForm.reset({
      nom: '', prenom: '', username: '', email: '', statut: '', is_active: '', groupe: '',
      service: '', agence: '', poste: '', categoriesalarie: '', allergie: '',
    });
    this.term = '';
    this.loadData(1);
    this.updateNoResultDisplay();
  }

  filterdata(): void {
    if (this.term) {
      this.users = this.userList.filter(el =>
        el.nom?.toLowerCase().includes(this.term.toLowerCase()) ||
        el.prenom?.toLowerCase().includes(this.term.toLowerCase()) ||
        el.username?.toLowerCase().includes(this.term.toLowerCase()) ||
        el.email?.toLowerCase().includes(this.term.toLowerCase()) ||
        el.id?.toString().includes(this.term)
      );
    } else {
      this.loadData(this.currentPage);
    }
    this.updateNoResultDisplay();
  }

  hasActiveSearch(): boolean {
    const v = this.searchForm?.value;
    return v && (v.nom || v.prenom || v.username || v.email || v.statut ||
      (v.is_active !== '' && v.is_active !== null) || v.groupe ||
      v.service || v.agence || v.poste || v.categoriesalarie || v.allergie);
  }

  // ══════════════════════════════════════════════════════════
  // ✅ EXPORT EXCEL — colonnes étendues avec dernière ligne
  // ══════════════════════════════════════════════════════════

  exportExcel(): void {
    const data = this.users.map(u => {
      const svc  = this.getDernierService(u);
      const agc  = this.getDerniereAgence(u);
      const pst  = this.getDernierPoste(u);
      const cat  = this.getDerniereCategorie(u);

      return {
        'ID':                    u.id,
        'Nom':                   u.nom || '',
        'Prénom':                u.prenom || '',
        'Username':              u.username || '',
        'Email':                 u.email || '',
        'Contact':               u.contact || '',
        'Rôle(s)':               this.getGroupesLibelle(u.groups || []),
        'Statut':                this.getStatutLibelle(u.statut),
        'État':                  u.is_active ? 'Actif' : 'Inactif',
        // ✅ Dernière ligne sous-store
        'Service (dernier)':     svc  ? this.getServiceLibelle(svc.service)        : '—',
        'Svc Date début':        svc  ? this.formatDate(svc.date_debut)            : '—',
        'Agence (dernière)':     agc  ? this.getAgenceLibelle(agc.agence)          : '—',
        'Agc Date début':        agc  ? this.formatDate(agc.date_debut)            : '—',
        'Poste (dernier)':       pst  ? this.getPosteLibelle(pst.poste)            : '—',
        'Pst Date début':        pst  ? this.formatDate(pst.date_debut)            : '—',
        'Catégorie (dernière)':  cat  ? this.getCategorieLibelle(cat.categoriesalarie) : '—',
        'Cat Date début':        cat  ? this.formatDate(cat.date_debut)            : '—',
        'Allergies':             this.getAllergiesStr(u),
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 6  }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 28 },
      { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 10 },
      { wch: 22 }, { wch: 12 }, { wch: 22 }, { wch: 12 },
      { wch: 22 }, { wch: 12 }, { wch: 24 }, { wch: 12 }, { wch: 30 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Utilisateurs');
    XLSX.writeFile(wb, `utilisateurs_${this._dateStr()}.xlsx`);
    this.toastService.success('Export Excel généré avec succès !', 'Succès');
  }

  // ══════════════════════════════════════════════════════════
  // ✅ EXPORT PDF — colonnes étendues (deux tableaux par page)
  // ══════════════════════════════════════════════════════════

  exportPdf(): void {
    const doc = new jsPDF({ orientation: 'landscape', format: 'a3' });

    doc.setFontSize(14);
    doc.text('Liste des utilisateurs', 14, 15);
    doc.setFontSize(9);
    doc.text(`Généré le : ${new Date().toLocaleDateString('fr-FR')} — ${this.users.length} utilisateur(s)`, 14, 21);

    // ── Tableau 1 : Informations personnelles ────────────
    const head1 = [['#', 'Nom', 'Prénom', 'Username', 'Email', 'Rôle(s)', 'Statut', 'État']];
    const body1 = this.users.map(u => [
      u.id, u.nom || '', u.prenom || '', u.username || '', u.email || '',
      this.getGroupesLibelle(u.groups || []),
      this.getStatutLibelle(u.statut),
      u.is_active ? 'Actif' : 'Inactif',
    ]);

    autoTable(doc, {
      head: head1, body: body1, startY: 26,
      styles:     { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 248, 252] },
      columnStyles: { 0: { cellWidth: 10 }, 4: { cellWidth: 45 }, 5: { cellWidth: 30 } },
      margin: { left: 14, right: 14 },
    });

    // ── Tableau 2 : Affectations RH ──────────────────────
    const finalY1 = (doc as any).lastAutoTable.finalY + 10;

    doc.setFontSize(11);
    doc.text('Affectations RH (dernière ligne par employé)', 14, finalY1);

    const head2 = [[
      'Nom & Prénom',
      'Service', 'Svc Début',
      'Agence', 'Agc Début',
      'Poste', 'Pst Début',
      'Catégorie', 'Cat Début',
      'Allergies',
    ]];

    const body2 = this.users.map(u => {
      const svc = this.getDernierService(u);
      const agc = this.getDerniereAgence(u);
      const pst = this.getDernierPoste(u);
      const cat = this.getDerniereCategorie(u);
      return [
        `${u.nom || ''} ${u.prenom || ''}`.trim(),
        svc ? this.getServiceLibelle(svc.service)              : '—',
        svc ? this.formatDate(svc.date_debut)                  : '—',
        agc ? this.getAgenceLibelle(agc.agence)                : '—',
        agc ? this.formatDate(agc.date_debut)                  : '—',
        pst ? this.getPosteLibelle(pst.poste)                  : '—',
        pst ? this.formatDate(pst.date_debut)                  : '—',
        cat ? this.getCategorieLibelle(cat.categoriesalarie)   : '—',
        cat ? this.formatDate(cat.date_debut)                  : '—',
        this.getAllergiesStr(u),
      ];
    });

    autoTable(doc, {
      head: head2, body: body2, startY: finalY1 + 5,
      styles:     { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [39, 174, 96], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 255, 245] },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 25 }, 2: { cellWidth: 18 },
        3: { cellWidth: 25 }, 4: { cellWidth: 18 },
        5: { cellWidth: 25 }, 6: { cellWidth: 18 },
        7: { cellWidth: 25 }, 8: { cellWidth: 18 },
        9: { cellWidth: 35 },
      },
      margin: { left: 14, right: 14 },
    });

    doc.save(`utilisateurs_${this._dateStr()}.pdf`);
    this.toastService.success('Export PDF généré avec succès !', 'Succès');
  }

  private _dateStr(): string {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  }

  // ══════════════════════════════════════════════════════════
  // HELPERS GROUPES
  // ══════════════════════════════════════════════════════════

  getGroupeName(id: number): string { return this.groupes.find(g => g.id === Number(id))?.name ?? `#${id}`; }
  getGroupesLibelle(ids: number[]): string { return !ids || !ids.length ? '—' : ids.map(id => this.getGroupeName(id)).join(', '); }
  isGroupSelected(groupId: number): boolean { return (this.userForm.get('groups')?.value || []).map(Number).includes(Number(groupId)); }
  toggleGroup(groupId: number): void {
    const current: number[] = [...(this.userForm.get('groups')?.value || [])].map(Number);
    const id = Number(groupId);
    const idx = current.indexOf(id);
    if (idx > -1) current.splice(idx, 1); else current.push(id);
    this.userForm.get('groups')?.setValue(current);
  }

  // ══════════════════════════════════════════════════════════
  // RESET
  // ══════════════════════════════════════════════════════════

  private _resetAllLignes(): void {
    this.serviceLignes=[]; this.agenceLignes=[]; this.posteLignes=[]; this.categorieLignes=[]; this.allergieLignes=[];
  }
  private _mapLignes<T extends { date_debut?: string; date_fin?: string | null; _isNew?: boolean; _isDeleted?: boolean; _hasError?: boolean }>(items: T[]): T[] {
    return items.map(t => ({ ...t, date_debut: t.date_debut ? t.date_debut.split('T')[0] : '', date_fin: t.date_fin ? t.date_fin.split('T')[0] : '', _isNew: false, _isDeleted: false, _hasError: false }));
  }

  /**
   * Historique de l'agent : repris directement de la fiche renvoyée par /users/
   * (user_services, user_agences…). Avant : 5 requêtes paginées (10 lignes
   * maximum) et des abonnements jamais terminés quand une liste était vide.
   */
  private _chargerHistorique(user: any): void {
    this.serviceLignes   = this._mapLignes(user.user_services          || []);
    this.agenceLignes    = this._mapLignes(user.user_agences           || []);
    this.posteLignes     = this._mapLignes(user.user_postes            || []);
    this.categorieLignes = this._mapLignes(user.user_categoriesalaries || []);
    this.allergieLignes  = (user.user_allergies || []).map((a: any) => ({ ...a, _isNew: false, _isDeleted: false, _hasError: false }));
  }

  // ══════════════════════════════════════════════════════════
  // MODALS AJOUTER / MODIFIER
  // ══════════════════════════════════════════════════════════

  openAddModal(): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    this.currentUserId = null; this._resetAllLignes();
    this.submitted = false; this.userForm.reset();
    this.userForm.patchValue({ is_active: true, groups: [] });
    this._motDePasseObligatoire(true);
    this.setModalTitle('Ajouter un utilisateur'); this.setModalBtn('Enregistrer'); this.addUser?.show();
  }

  closeAddModal(): void {
    this.lastActiveElement?.focus();
    setTimeout(() => { this.addUser?.hide(); this.setModalTitle('Ajouter un utilisateur'); this.setModalBtn('Enregistrer'); }, 10);
  }

  editList(id: any): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    const editData = this.users.find(u => u.id === id);
    if (!editData) return;
    this.currentUserId = id; this._resetAllLignes(); this.submitted = false;
    this.userForm.patchValue({ ...editData, password: '', password2: '', groups: (editData.groups || []).map(Number) });
    this._motDePasseObligatoire(false);
    this._chargerHistorique(editData);
    this.setModalTitle('Modifier l\'utilisateur'); this.setModalBtn('Enregistrer'); this.addUser?.show();
  }

  // ── Tableaux dynamiques ────────────────────────────────────
  ajouterService(): void    { this.serviceLignes.push({ service: undefined, date_debut: '', date_fin: null, statut: undefined, _isNew: true, _isDeleted: false, _hasError: false }); }
  ajouterAgence(): void     { this.agenceLignes.push({ agence: undefined, date_debut: '', date_fin: null, statut: undefined, _isNew: true, _isDeleted: false, _hasError: false }); }
  ajouterPoste(): void      { this.posteLignes.push({ poste: undefined, date_debut: '', date_fin: null, statut: undefined, _isNew: true, _isDeleted: false, _hasError: false }); }
  ajouterCategorie(): void  { this.categorieLignes.push({ categoriesalarie: undefined, date_debut: '', date_fin: null, statut: undefined, _isNew: true, _isDeleted: false, _hasError: false }); }
  ajouterAllergie(): void   { this.allergieLignes.push({ libelle: '', _isNew: true, _isDeleted: false, _hasError: false }); }

  supprimerService(i: number): void   { this._supprimerLigne(i, this.serviceLignes); }
  supprimerAgence(i: number): void    { this._supprimerLigne(i, this.agenceLignes); }
  supprimerPoste(i: number): void     { this._supprimerLigne(i, this.posteLignes); }
  supprimerCategorie(i: number): void { this._supprimerLigne(i, this.categorieLignes); }
  supprimerAllergie(i: number): void  { this._supprimerLigne(i, this.allergieLignes); }

  /**
   * Ligne existante : seulement marquée, supprimée au clic sur « Enregistrer »
   * (avant : supprimée immédiatement, même si on annulait ensuite).
   */
  private _supprimerLigne(index: number, lignes: any[]): void {
    const l = lignes[index];
    if (!l) return;
    if (l._isNew) lignes.splice(index, 1);
    else l._isDeleted = true;
  }

  /** Mot de passe obligatoire à la création, facultatif en modification */
  private _motDePasseObligatoire(obligatoire: boolean): void {
    const ctrl = this.userForm.get('password');
    ctrl?.setValidators(obligatoire ? [Validators.required, passwordStrengthValidator] : [passwordStrengthValidator]);
    ctrl?.updateValueAndValidity();
  }

  get serviceLignesVisibles()   { return this.serviceLignes.filter(l => !l._isDeleted); }
  get agenceLignesVisibles()    { return this.agenceLignes.filter(l => !l._isDeleted); }
  get posteLignesVisibles()     { return this.posteLignes.filter(l => !l._isDeleted); }
  get categorieLignesVisibles() { return this.categorieLignes.filter(l => !l._isDeleted); }
  get allergieLignesVisibles()  { return this.allergieLignes.filter(l => !l._isDeleted); }

  // ── Getters formulaires ────────────────────────────────────
  get f() { return this.userForm.controls; }
  get passwordMismatch(): boolean { return this.userForm.hasError('passwordMismatch') && !!this.userForm.get('password2')?.value; }
  get pwdErrors()  { return this.userForm.get('password')?.errors; }
  get pwdTouched(): boolean { return (this.userForm.get('password')?.touched || this.submitted) ?? false; }
  get mdpMismatch(): boolean { return this.mdpForm.hasError('passwordMismatch') && !!this.mdpForm.get('password2')?.value; }
  get mdpErrors()  { return this.mdpForm.get('password')?.errors; }
  get mdpTouched(): boolean { return (this.mdpForm.get('password')?.touched || this.mdpSubmitted) ?? false; }

  // ── Validation lignes ──────────────────────────────────────
  private _validerLignesAvecDate(lignes: any[], champFK: string): boolean {
    let valid = true;
    lignes.filter(l => !l._isDeleted).forEach(l => {
      const hasError = !l[champFK] || !l.date_debut || !l.statut || (!!l.date_fin && l.date_fin < l.date_debut);
      l._hasError = hasError;
      if (hasError) valid = false;
    });
    return valid;
  }
  private _validerAllergies(): boolean {
    let valid = true;
    this.allergieLignes.filter(l => !l._isDeleted).forEach(l => { l._hasError = !l.libelle?.trim(); if (l._hasError) valid = false; });
    return valid;
  }

  // ── Sauvegarde ─────────────────────────────────────────────
  /**
   * 1. Enregistre la fiche (création ou modification) ;
   * 2. puis l'historique, requête par requête et dans cet ordre : suppressions,
   *    modifications, créations (clôturer l'ancienne agence AVANT d'ajouter la
   *    nouvelle, sinon le serveur refuse le chevauchement des périodes).
   * Les messages de succès / d'erreur reflètent la réponse réelle du serveur
   * (avant : « succès » affiché et fenêtre fermée même en cas de refus).
   */
  saveProperty(): void {
    this.submitted = true;
    if (this.userForm.invalid) { this.toastService.error('Veuillez vérifier les informations saisies.', 'Erreur'); return; }
    if (!this._validerLignesAvecDate(this.serviceLignes, 'service') ||
        !this._validerLignesAvecDate(this.agenceLignes, 'agence')   ||
        !this._validerLignesAvecDate(this.posteLignes, 'poste')     ||
        !this._validerLignesAvecDate(this.categorieLignes, 'categoriesalarie') ||
        !this._validerAllergies()) {
      this.toastService.error('Veuillez corriger les erreurs dans les tableaux.', 'Erreur'); return;
    }
    const formValue = { ...this.userForm.value };
    if (!formValue.password) { delete formValue.password; delete formValue.password2; }
    formValue.groups = (formValue.groups || []).map(Number);
    formValue.email = formValue.email || '';
    formValue.contact = formValue.contact || '';
    formValue.poste_telephone = formValue.poste_telephone || '';
    const creation = !formValue.id;
    if (creation) delete formValue.id;

    this.isSaving = true;
    const fiche$: Observable<any> = creation
      ? this.userService.createUser(formValue)
      : this.userService.updateUser(formValue);

    fiche$.pipe(
      switchMap(user => this._enregistrerHistorique(user?.id ?? formValue.id)),
      takeUntil(this.destroy$),
    ).subscribe({
      next: erreurs => {
        this.isSaving = false;
        if (erreurs.length) {
          this.toastService.warning(
            `Agent enregistré, mais une partie de l'historique a été refusée : ${erreurs.join(' ; ')}`,
            'Attention', { timeOut: 10000 });
        } else {
          this.toastService.success(creation ? 'Utilisateur ajouté avec succès !' : 'Utilisateur mis à jour avec succès !', 'Succès');
        }
        this.submitted = false;
        this.closeAddModal();
        this.loadData(creation ? 1 : this.currentPage);
      },
      error: err => {
        // Fiche refusée (identifiant déjà utilisé, mot de passe trop faible…) : la fenêtre reste ouverte
        this.isSaving = false;
        this.toastService.error(typeof err === 'string' ? err : 'Enregistrement impossible.', 'Erreur');
      },
    });
  }

  /** Enregistre l'historique de l'agent ; renvoie la liste des messages d'erreur */
  private _enregistrerHistorique(uid: number): Observable<string[]> {
    const erreurs: string[] = [];
    const appel = (obs: Observable<any>, quoi: string) => obs.pipe(
      catchError(err => { erreurs.push(`${quoi} : ${typeof err === 'string' ? err : 'refusé'}`); return of(null); }));

    const tables: { lignes: any[]; fk: string; quoi: string; api: any }[] = [
      { lignes: this.serviceLignes,   fk: 'service',          quoi: 'Service',   api: this.userServiceService },
      { lignes: this.agenceLignes,    fk: 'agence',           quoi: 'Agence',    api: this.userAgenceService },
      { lignes: this.posteLignes,     fk: 'poste',            quoi: 'Poste',     api: this.userPosteService },
      { lignes: this.categorieLignes, fk: 'categoriesalarie', quoi: 'Catégorie', api: this.userCategoriesalarieService },
    ];
    const donnees = (l: any, fk: string) =>
      ({ user: uid, [fk]: Number(l[fk]), date_debut: l.date_debut, date_fin: l.date_fin || null, statut: Number(l.statut) });

    const operations: Observable<any>[] = [];
    for (const t of tables) {
      t.lignes.filter(l => l._isDeleted && l.id).forEach(l => operations.push(appel(t.api.delete(l.id), t.quoi)));
      t.lignes.filter(l => !l._isNew && !l._isDeleted && l.id).forEach(l => operations.push(appel(t.api.update(l.id, donnees(l, t.fk)), t.quoi)));
      t.lignes.filter(l => l._isNew && !l._isDeleted).forEach(l => operations.push(appel(t.api.create(donnees(l, t.fk)), t.quoi)));
    }
    const al = this.allergieLignes;
    al.filter(l => l._isDeleted && l.id).forEach(l => operations.push(appel(this.userAllergieService.delete(l.id!), 'Allergie')));
    al.filter(l => !l._isNew && !l._isDeleted && l.id).forEach(l => operations.push(appel(this.userAllergieService.update(l.id!, { user: uid, libelle: l.libelle }), 'Allergie')));
    al.filter(l => l._isNew && !l._isDeleted).forEach(l => operations.push(appel(this.userAllergieService.create({ user: uid, libelle: l.libelle }), 'Allergie')));

    if (!operations.length) return of([]);
    return concat(...operations).pipe(toArray(), map(() => erreurs));
  }

  // ── Activation ─────────────────────────────────────────────
  toggleActivation(user: any): void {
    if (user.is_active) { this.store.dispatch(desactiverUser({ id: user.id })); this.toastService.success(`${user.username} désactivé.`, 'Succès'); }
    else { this.store.dispatch(activerUser({ id: user.id })); this.toastService.success(`${user.username} activé.`, 'Succès'); }
  }
  activerSelection(): void { if (!this.checkedValGet.length) return; this.store.dispatch(activerMultipleUsers({ ids: this.checkedValGet })); this.toastService.success(`${this.checkedValGet.length} activé(s).`, 'Succès'); this.checkedValGet = []; this.masterSelected = false; }
  desactiverSelection(): void { if (!this.checkedValGet.length) return; this.store.dispatch(desactiverMultipleUsers({ ids: this.checkedValGet })); this.toastService.success(`${this.checkedValGet.length} désactivé(s).`, 'Succès'); this.checkedValGet = []; this.masterSelected = false; }

  // ── Modal MDP ──────────────────────────────────────────────
  /** Changer SON propre mot de passe exige l'ancien (règle du serveur) */
  get mdpPourSoi(): boolean { return this.currentUserId != null && this.currentUserId === this.connectedUserId; }

  openMdpModal(user: any): void {
    this.lastActiveElement = document.activeElement as HTMLElement; this.currentUserId = user.id;
    this.mdpSubmitted = false; this.mdpForm.reset();
    this.mdpForm.get('old_password')?.setValidators(this.mdpPourSoi ? [Validators.required] : []);
    this.mdpForm.get('old_password')?.updateValueAndValidity();
    this.mdpModal?.show();
  }
  closeMdpModal(): void { this.lastActiveElement?.focus(); setTimeout(() => { this.mdpModal?.hide(); this.currentUserId = null; }, 10); }
  saveMdp(): void {
    this.mdpSubmitted = true;
    if (this.mdpForm.invalid || !this.currentUserId) return;
    const { password, old_password } = this.mdpForm.value;
    this.userService.changerMotDePasse(this.currentUserId, password, this.mdpPourSoi ? old_password : undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => { this.toastService.success('Mot de passe modifié avec succès !', 'Succès'); this.closeMdpModal(); },
        error: err => this.toastService.error(typeof err === 'string' ? err : 'Modification impossible.', 'Erreur'),
      });
  }

  // ── Modal suppression ──────────────────────────────────────
  removeItem(id: any): void { this.lastActiveElement = document.activeElement as HTMLElement; this.deleteID = id; this.deleteRecordModal?.show(); }
  closeDeleteModal(): void { this.lastActiveElement?.focus(); setTimeout(() => this.deleteRecordModal?.hide(), 10); }
  confirmDelete(id?: any): void {
    if (id) { this.store.dispatch(deleteuserData({ id: id.toString() })); this.toastService.success('Supprimé !', 'Succès'); this.afterDeleteActions(); return; }
    if (this.checkedValGet?.length > 0) { this.store.dispatch(deletemultipleuserData({ id: this.checkedValGet.join(',') })); this.toastService.success(`${this.checkedValGet.length} supprimé(s) !`, 'Succès'); this.afterDeleteActions(); return; }
    this.toastService.error('Aucun utilisateur sélectionné.', 'Erreur'); this.closeDeleteModal();
  }
  private afterDeleteActions(): void { this.closeDeleteModal(); this.masterSelected = false; this.deleteID = null; this.checkedValGet = []; }

  // ── Modal détails ──────────────────────────────────────────
  viewDetails(id: any): void {
    this.lastActiveElement = document.activeElement as HTMLElement;
    const data = this.users.find(u => u.id === id);
    if (data) { this.selectedUser = data; this._chargerHistorique(data); this.viewUser?.show(); }
    else this.toastService.error('Utilisateur introuvable', 'Erreur');
  }
  closeViewModal(): void { this.lastActiveElement?.focus(); setTimeout(() => { this.viewUser?.hide(); this.selectedUser = null; this._resetAllLignes(); }, 10); }

  // ── Helpers affichage ──────────────────────────────────────
  getStatutLibelle(id: number): string    { return this.statuts.find(s => s.id === Number(id))?.libelle_statut ?? '—'; }
  getAgenceLibelle(id: number): string    { return this.agences.find(a => a.id === Number(id))?.nom_agence ?? '—'; }
  getServiceLibelle(id: number): string   { return this.services.find(s => s.id === Number(id))?.libelle_service ?? '—'; }
  getPosteLibelle(id: number): string     { return this.postes.find(p => p.id === Number(id))?.libelle ?? '—'; }
  getCategorieLibelle(id: number): string { return this.categoriesalaries.find(c => c.id === Number(id))?.libelle ?? '—'; }

  formatDate(d: string): string {
    if (!d) return '—';
    const date = d.includes('T') ? d.split('T')[0] : d;
    const [y, m, day] = date.split('-');
    return `${day}/${m}/${y}`;
  }

  // ── Checkboxes / Tri / Pagination ─────────────────────────
  checkUncheckAll(ev: any): void { this.users.forEach(x => x.state = ev.target.checked); this.masterSelected = ev.target.checked; this.updateCheckedValues(); }
  onCheckboxChange(): void { this.updateCheckedValues(); }
  private updateCheckedValues(): void { this.checkedValGet = this.users.filter(u => u.state === true).map(u => u.id); }

  onSort(column: string): void {
    this.direction = this.direction === 'asc' ? 'desc' : 'asc';
    this.users = [...this.users].sort((a, b) => { const res = this.compare(a[column], b[column]); return this.direction === 'asc' ? res : -res; });
  }
  compare(v1: string | number, v2: string | number): number { return v1 < v2 ? -1 : v1 > v2 ? 1 : 0; }

  updateNoResultDisplay(): void {
    const el = document.querySelector('.noresult') as HTMLElement;
    if (!el) return;
    el.style.display = (this.term || this.hasActiveSearch()) && this.users.length === 0 ? 'block' : 'none';
  }

  pageChanged(event: PageChangedEvent): void { this.loadData(event.page); }

  private setModalTitle(t: string): void { const el = document.querySelector('.modal-title') as HTMLElement; if (el) el.innerHTML = t; }
  private setModalBtn(l: string): void { const el = document.getElementById('add-btn') as HTMLElement; if (el) el.innerHTML = l; }
}
