// src/app/pages/cantine/facturation-commande/facturation-commande.component.ts

import { Component, OnInit, OnDestroy, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';
import { selectAllTypeequipeWithoutPagination } from 'src/app/store/Typeequipe/typeequipe-selector';
import { fetchtypeequipeNoPaginateData } from 'src/app/store/Typeequipe/typeequipe.action';
import { selectAllCategoriesalarieWithoutPagination } from 'src/app/store/Categoriesalarie/categoriesalarie-selector';
import { fetchcategoriesalarieNoPaginateData } from 'src/app/store/Categoriesalarie/categoriesalarie.action';

import {
  fetchCommandesParAgencePeriode,
  resetCommandesParAgencePeriode,
  resetCommandeError,
} from 'src/app/store/Commande/commande.action';
import {
  selectCommandesParAgencePeriode,
  selectCommandeIsLoading,
  selectCommandeError,
} from 'src/app/store/Commande/commande-selector';
import { CommandeModel } from 'src/app/store/Commande/commande.model';

import { selectuserData } from 'src/app/store/User/user-selector';
import { fetchuserData } from 'src/app/store/User/user.action';

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface LigneFacturation {
  userId:             number | null;
  // ✅ username (badge) + nom/prénom séparés
  username:           string;
  nomPrenom:          string;
  agenceMenu:         string;
  agenceAgent:        string;
  equipe:             string;
  service:            string;
  poste:              string;
  categoriesalarie:   string;
  categoriesalarieId: number | null;
  montant:            number;
  nbCommandes:        number;
  total:              number;
  statuts: {
    en_attente: number;
    retiree:    number;
    annulee:    number;
  };
}

@Component({
  selector: 'app-facturation-commande',
  templateUrl: './facturation-commande.component.html',
  styleUrl: './facturation-commande.component.scss',
})
export class FacturationCommandeComponent implements OnInit, OnDestroy {

  breadCrumbItems = [
    { label: 'Cantine', active: false },
    { label: 'Facturation commandes', active: true },
  ];

  agences:           any[] = [];
  typeEquipes:       any[] = [];
  categoriesalaries: any[] = [];
  platCategoriesalaries: any[] = [];

  // ✅ Map indexée par username + nom complet
  usersMap: Map<string, any> = new Map();

  isLoading    = false;
  isLoadingRef = false;
  hasSearched  = false;
  error: string | null = null;

  filterForm!: UntypedFormGroup;

  // ✅ Statuts multiples
  readonly TOUS_STATUTS = [
    { value: 'en_attente', label: 'En attente' },
    { value: 'retiree',    label: 'Retirée'    },
    { value: 'annulee',    label: 'Annulée'    },
  ];
  statutsSelectionnes: string[] = [];

  lignesFacturation: LigneFacturation[] = [];
  totalNbCommandes = 0;
  totalMontant     = 0;

  private _commandesBrutes: CommandeModel[] = [];
  private destroyRef = inject(DestroyRef);
  private apiUrl = `${environment.apiUrl}/api/api`;

  constructor(
    private store: Store,
    private fb: UntypedFormBuilder,
    private http: HttpClient,
  ) {}

  ngOnInit(): void {
    this.store.dispatch(resetCommandeError());
    const today = new Date().toISOString().split('T')[0];

    this.filterForm = this.fb.group({
      date_debut: [today],
      date_fin:   [''],
      agence:     [''],
      typeequipe: [''],
    });

    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.select(selectAllAgenceWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(a => this.agences = a ?? []);

    this.store.dispatch(fetchtypeequipeNoPaginateData());
    this.store.select(selectAllTypeequipeWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(t => this.typeEquipes = t ?? []);

    this.store.dispatch(fetchcategoriesalarieNoPaginateData());
    this.store.select(selectAllCategoriesalarieWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(d => this.categoriesalaries = d ?? []);

    this._chargerPlatCategoriesalaries();

    // ✅ Users indexés par username EN PRIORITÉ
    this.store.dispatch(fetchuserData({ page: 1 }));
    this.store.select(selectuserData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(users => {
        this.usersMap = new Map();
        (users ?? []).forEach(u => {
          // Index principal : username (badge)
          if (u.username) this.usersMap.set(u.username, u);
          // Index secondaire : nom complet Django (first_name + last_name)
          const nomComplet = `${u.first_name || ''} ${u.last_name || ''}`.trim();
          if (nomComplet) this.usersMap.set(nomComplet, u);
          // Index tertiaire : nom + prénom custom
          const nomCustom = `${u.nom || ''} ${u.prenom || ''}`.trim();
          if (nomCustom) this.usersMap.set(nomCustom, u);
        });
        if (this._commandesBrutes.length > 0) {
          this._construireFacturation(this._commandesBrutes);
        }
      });

    this.store.select(selectCommandeIsLoading)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.isLoading = v);

    this.store.select(selectCommandeError)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(e => this.error = e);

    this.store.select(selectCommandesParAgencePeriode)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(commandes => {
        if (commandes) {
          this._commandesBrutes = commandes;
          this._construireFacturation(commandes);
        }
      });
  }

  ngOnDestroy(): void {
    this.store.dispatch(resetCommandesParAgencePeriode());
  }

  // ══════════════════════════════════════════════════════════
  // CHARGEMENT PlatCategoriesalarie
  // ══════════════════════════════════════════════════════════

  private _chargerPlatCategoriesalaries(): void {
    this.isLoadingRef = true;
    this.http.get<any>(`${this.apiUrl}/plat-categoriesalaries/?page_size=1000`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.platCategoriesalaries = Array.isArray(response)
            ? response
            : (response.results ?? []);
          this.isLoadingRef = false;
          if (this._commandesBrutes.length > 0) {
            this._construireFacturation(this._commandesBrutes);
          }
        },
        error: () => { this.isLoadingRef = false; }
      });
  }

  // ══════════════════════════════════════════════════════════
  // MONTANT DEPUIS PlatCategoriesalarie
  // ══════════════════════════════════════════════════════════

  private _getMontantParCategorie(categoriesalarieId: number | null): number {
    if (!categoriesalarieId || !this.platCategoriesalaries.length) return 0;
    const lignes = this.platCategoriesalaries.filter(
      p => Number(p.categoriesalarie) === Number(categoriesalarieId)
    );
    if (!lignes.length) return 0;
    const derniere = lignes.reduce((prev: any, curr: any) =>
      (curr.date_debut || '') > (prev.date_debut || '') ? curr : prev
    );
    return parseFloat(derniere.montant) || 0;
  }

  // ══════════════════════════════════════════════════════════
  // HELPERS USER
  // ══════════════════════════════════════════════════════════

  private _getUserFromNom(nom: string): any | null {
    return this.usersMap.get(nom) ?? null;
  }

  /** Username de l'agent depuis le user object */
  private _getUsername(user: any, fallback: string): string {
    return user?.username || fallback;
  }

  /** Nom & Prénom depuis le user object (champs custom ou Django) */
  private _getNomPrenom(user: any): string {
    if (!user) return '—';
    const nom    = user.nom    || user.last_name  || '';
    const prenom = user.prenom || user.first_name || '';
    return `${nom} ${prenom}`.trim() || user.username || '—';
  }

  private _derniereLigne(lignes: any[]): any | null {
    if (!lignes || !lignes.length) return null;
    return lignes.reduce((prev: any, curr: any) =>
      (curr.date_debut || '') > (prev.date_debut || '') ? curr : prev
    );
  }

  // ══════════════════════════════════════════════════════════
  // CONSTRUCTION FACTURATION
  // ══════════════════════════════════════════════════════════

  private _construireFacturation(commandes: CommandeModel[]): void {
    // ✅ Filtre local multi-statuts avant groupement
    const commandesFiltrees = this.statutsSelectionnes.length > 0
      ? commandes.filter(c => this.statutsSelectionnes.includes(c.statut))
      : commandes;
    const grouped: Map<string, { commandes: CommandeModel[]; user: any | null }> = new Map();

    commandesFiltrees.forEach(c => {
      const key = c.user_nom ?? 'Inconnu';
      if (!grouped.has(key)) {
        grouped.set(key, { commandes: [], user: this._getUserFromNom(key) });
      }
      grouped.get(key)!.commandes.push(c);
    });

    this.lignesFacturation = [];
    this.totalNbCommandes  = 0;
    this.totalMontant      = 0;

    grouped.forEach(({ commandes: cmds, user }, userNomKey) => {
      const nbCommandes = cmds.length;
      const statuts     = { en_attente: 0, retiree: 0, annulee: 0 };
      cmds.forEach(c => {
        if      (c.statut === 'en_attente') statuts.en_attente++;
        else if (c.statut === 'retiree')    statuts.retiree++;
        else if (c.statut === 'annulee')    statuts.annulee++;
      });

      const dernierSvc  = user ? this._derniereLigne(user.user_services        || []) : null;
      const derniereAgc = user ? this._derniereLigne(user.user_agences          || []) : null;
      const dernierPst  = user ? this._derniereLigne(user.user_postes           || []) : null;
      const derniereCat = user ? this._derniereLigne(user.user_categoriesalaries || []) : null;

      const categoriesalarieId = derniereCat ? Number(derniereCat.categoriesalarie) : null;
      const montant            = this._getMontantParCategorie(categoriesalarieId);
      const total              = montant * nbCommandes;

      const catLibelle     = this.categoriesalaries.find(c => c.id === categoriesalarieId)?.libelle ?? '—';
      const serviceLibelle = dernierSvc  ? (dernierSvc.service_libelle  || '—') : '—';
      const agenceLibelle  = derniereAgc ? (derniereAgc.agence_nom      || '—') : '—';
      const posteLibelle   = dernierPst  ? (dernierPst.poste_libelle    || '—') : '—';
      const agenceMenu     = cmds[0]?.menu_detail?.agence_nom          ?? '—';
      const equipe         = cmds[0]?.menu_detail?.typeequipe_libelle  ?? '—';

      this.lignesFacturation.push({
        userId:             user?.id ?? null,
        username:           this._getUsername(user, userNomKey),  // ✅ username
        nomPrenom:          this._getNomPrenom(user),              // ✅ nom & prénom
        agenceMenu,
        agenceAgent:        agenceLibelle,
        equipe,
        service:            serviceLibelle,
        poste:              posteLibelle,
        categoriesalarie:   catLibelle,
        categoriesalarieId,
        montant,
        nbCommandes,
        total,
        statuts,
      });

      this.totalNbCommandes += nbCommandes;
      this.totalMontant     += total;
    });

    this.lignesFacturation.sort((a, b) => a.username.localeCompare(b.username));
  }

  // ══════════════════════════════════════════════════════════
  // RECHERCHE
  // ══════════════════════════════════════════════════════════

  /** Déclenché par ng-select (change) — recalcule la facturation immédiatement */
  onStatutChange(): void {
    if (this._commandesBrutes.length > 0) {
      this._construireFacturation(this._commandesBrutes);
    }
  }

  isStatutSelected(value: string): boolean {
    return this.statutsSelectionnes.includes(value);
  }

  rechercher(): void {
    const { date_debut, date_fin, agence, typeequipe } = this.filterForm.value;
    this.hasSearched = true;
    // ✅ On ne passe plus statut à l'API — filtre local dans _construireFacturation
    this.store.dispatch(fetchCommandesParAgencePeriode({
      date_debut: date_debut || undefined,
      date_fin:   date_fin   || undefined,
      agence:     agence     ? +agence     : undefined,
      typeequipe: typeequipe ? +typeequipe : undefined,
    }));
  }

  resetFilters(): void {
    const today = new Date().toISOString().split('T')[0];
    this.filterForm.reset({ date_debut: today, date_fin: '', agence: '', typeequipe: '' });
    this.hasSearched         = false;
    this.statutsSelectionnes = [];  // ✅ reset statuts
    this.lignesFacturation   = [];
    this.totalNbCommandes    = 0;
    this.totalMontant        = 0;
    this._commandesBrutes    = [];
    this.store.dispatch(resetCommandesParAgencePeriode());
  }

  formatDate(d: string): string {
    if (!d) return '';
    const date = d.includes('T') ? d.split('T')[0] : d;
    const [y, m, day] = date.split('-');
    return `${day}/${m}/${y}`;
  }

  formatMontant(n: number): string {
    return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  dismissAlert(): void { this.store.dispatch(resetCommandeError()); }

  get isLoadingAll(): boolean { return this.isLoading || this.isLoadingRef; }

  get hasAgentsSansMontant(): boolean {
    return this.lignesFacturation.some(l => l.montant === 0);
  }

  // ══════════════════════════════════════════════════════════
  // ✅ EXPORT EXCEL (username + nom/prénom)
  // ══════════════════════════════════════════════════════════

  exportExcel(): void {
    const { date_debut, date_fin } = this.filterForm.value;

    const data: any[] = this.lignesFacturation.map((l, i) => ({
      'N°':                i + 1,
      'Username':          l.username,
      'Nom & Prénom':      l.nomPrenom,
      'Agence menu':       l.agenceMenu,
      'Agence agent':      l.agenceAgent,
      'Équipe':            l.equipe,
      'Service':           l.service,
      'Poste':             l.poste,
      'Catégorie salarié': l.categoriesalarie,
      'Montant (FCFA)':    l.montant,
      'Nb commandes':      l.nbCommandes,
      'En attente':        l.statuts.en_attente,
      'Retirées':          l.statuts.retiree,
      'Annulées':          l.statuts.annulee,
      'Total (FCFA)':      l.total,
    }));

    // Ligne total
    data.push({
      'N°':                '',
      'Username':          'TOTAL',
      'Nom & Prénom':      '',
      'Agence menu':       '',
      'Agence agent':      '',
      'Équipe':            '',
      'Service':           '',
      'Poste':             '',
      'Catégorie salarié': '',
      'Montant (FCFA)':    '',
      'Nb commandes':      this.totalNbCommandes,
      'En attente':        '',
      'Retirées':          '',
      'Annulées':          '',
      'Total (FCFA)':      this.totalMontant,
    });

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 5  }, { wch: 18 }, { wch: 28 }, { wch: 20 }, { wch: 20 },
      { wch: 15 }, { wch: 22 }, { wch: 22 }, { wch: 24 },
      { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Facturation');
    XLSX.writeFile(wb, `facturation-${date_debut ?? ''}-${date_fin ?? ''}.xlsx`);
  }

  // ══════════════════════════════════════════════════════════
  // ✅ EXPORT PDF (username + nom/prénom)
  // ══════════════════════════════════════════════════════════

  exportPdf(): void {
    const { date_debut, date_fin } = this.filterForm.value;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    const titre = `Facturation commandes cantine — ${
      date_debut ? this.formatDate(date_debut) : ''
    }${date_fin ? ' au ' + this.formatDate(date_fin) : ''}`;
    doc.text(titre, 14, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Généré le : ${new Date().toLocaleDateString('fr-FR')} — ` +
      `${this.lignesFacturation.length} agent(s) — ` +
      `${this.totalNbCommandes} commande(s) — ` +
      `Total : ${this.formatMontant(this.totalMontant)} FCFA`,
      14, 21
    );

    const head = [[
      'N°', 'Username', 'Nom & Prénom', 'Agence menu', 'Agence agent', 'Équipe',
      'Service', 'Poste', 'Catégorie', 'Montant', 'Nb cmd',
      'Att.', 'Ret.', 'Ann.', 'Total',
    ]];

    const body: any[][] = this.lignesFacturation.map((l, i) => [
      i + 1,
      l.username,
      l.nomPrenom,
      l.agenceMenu,
      l.agenceAgent,
      l.equipe,
      l.service,
      l.poste,
      l.categoriesalarie,
      this.formatMontant(l.montant),
      l.nbCommandes,
      l.statuts.en_attente,
      l.statuts.retiree,
      l.statuts.annulee,
      this.formatMontant(l.total),
    ]);

    // Ligne total
    body.push([
      '', 'TOTAL', '', '', '', '', '', '', '', '',
      this.totalNbCommandes, '', '', '',
      this.formatMontant(this.totalMontant),
    ]);

    autoTable(doc, {
      head,
      body,
      startY: 26,
      styles:     { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [41, 98, 255], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 255] },
      didParseCell: (data) => {
        if (data.row.index === body.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [230, 235, 255];
        }
      },
      columnStyles: {
        0:  { cellWidth: 8,  halign: 'center' },
        1:  { cellWidth: 22 },
        2:  { cellWidth: 30 },
        3:  { cellWidth: 22 },
        4:  { cellWidth: 22 },
        5:  { cellWidth: 15 },
        6:  { cellWidth: 22 },
        7:  { cellWidth: 22 },
        8:  { cellWidth: 22 },
        9:  { cellWidth: 16, halign: 'right' },
        10: { cellWidth: 12, halign: 'center' },
        11: { cellWidth: 10, halign: 'center' },
        12: { cellWidth: 10, halign: 'center' },
        13: { cellWidth: 10, halign: 'center' },
        14: { cellWidth: 18, halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    });

    doc.save(`facturation-${date_debut ?? ''}-${date_fin ?? ''}.pdf`);
  }
}
