// src/app/pages/cantine/facturation-prestataire/facturation-prestataire.component.ts
//
// Facturation prestataire : ce que nous devons payer au prestataire
//
// Logique montant par commande :
//   1. Récupérer plat_id + date_menu de la commande
//   2. Chercher dans PlatPrestataire la ligne active :
//      plat = plat_id
//      prestataire = prestataire sélectionné
//      date_debut <= date_menu <= date_fin (ou date_fin null)
//      Parmi les lignes qui correspondent, prendre celle avec date_debut la plus récente
//   3. montant = PlatPrestataire.montant
//   4. Total agent = somme des montants de ses commandes
//   5. Total général = montant dû au prestataire

import { Component, OnInit, OnDestroy, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';
import { selectAllTypeequipeWithoutPagination } from 'src/app/store/Typeequipe/typeequipe-selector';
import { fetchtypeequipeNoPaginateData } from 'src/app/store/Typeequipe/typeequipe.action';

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

// ── Interface ligne facturation prestataire ────────────────────
export interface LigneFacturationPrestataire {
  userId:       number | null;
  username:     string;
  nomPrenom:    string;
  agenceMenu:   string;
  agenceAgent:  string;
  equipe:       string;
  service:      string;
  poste:        string;
  nbCommandes:  number;
  totalMontant: number;   // somme des montants PlatPrestataire de ses commandes
  detail: {               // détail par date_menu
    dateMenu:   string;
    platNom:    string;
    montant:    number;   // tarif prestataire actif ce jour
    nbFois:     number;
    sousTotal:  number;
  }[];
  statuts: {
    en_attente: number;
    retiree:    number;
    annulee:    number;
  };
}

@Component({
  selector: 'app-facturation-prestataire',
  templateUrl: './facturation-prestataire.component.html',
  styleUrl: './facturation-prestataire.component.scss',
})
export class FacturationPrestataireComponent implements OnInit, OnDestroy {

  breadCrumbItems = [
    { label: 'Cantine', active: false },
    { label: 'Facturation prestataire', active: true },
  ];

  agences:      any[] = [];
  typeEquipes:  any[] = [];
  prestataires: any[] = [];   // liste des prestataires
  platPrestataires: any[] = []; // PlatPrestataire avec montants

  usersMap: Map<string, any> = new Map();

  isLoading    = false;
  isLoadingRef = false;
  hasSearched  = false;
  error: string | null = null;

  filterForm!: UntypedFormGroup;

  // ✅ Statuts multiples (ng-select)
  readonly TOUS_STATUTS = [
    { value: 'en_attente', label: 'En attente' },
    { value: 'retiree',    label: 'Retirée'    },
    { value: 'annulee',    label: 'Annulée'    },
  ];
  statutsSelectionnes: string[] = [];

  lignesFacturation: LigneFacturationPrestataire[] = [];
  totalNbCommandes = 0;
  totalMontant     = 0;

  // Prestataire sélectionné (objet complet pour affichage)
  prestataireSelectionne: any | null = null;

  // Lignes détail dépliées
  detailOuvert: Set<string> = new Set();

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
      date_debut:   [today],
      date_fin:     [''],
      prestataire:  ['', [Validators.required]],  // obligatoire
      agence:       [''],
      typeequipe:   [''],
    });

    // ── Référentiels ──────────────────────────────────────────
    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.select(selectAllAgenceWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(a => this.agences = a ?? []);

    this.store.dispatch(fetchtypeequipeNoPaginateData());
    this.store.select(selectAllTypeequipeWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(t => this.typeEquipes = t ?? []);

    // ── Charger les prestataires ──────────────────────────────
    this._chargerPrestataires();

    // ── Users ─────────────────────────────────────────────────
    this.store.dispatch(fetchuserData({ page: 1 }));
    this.store.select(selectuserData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(users => {
        this.usersMap = new Map();
        (users ?? []).forEach(u => {
          if (u.username) this.usersMap.set(u.username, u);
          const nomComplet = `${u.first_name || ''} ${u.last_name || ''}`.trim();
          if (nomComplet) this.usersMap.set(nomComplet, u);
          const nomCustom = `${u.nom || ''} ${u.prenom || ''}`.trim();
          if (nomCustom) this.usersMap.set(nomCustom, u);
        });
        if (this._commandesBrutes.length > 0) {
          this._construireFacturation(this._commandesBrutes);
        }
      });

    // ── Commandes ─────────────────────────────────────────────
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
  // CHARGEMENT RÉFÉRENTIELS
  // ══════════════════════════════════════════════════════════

  private _chargerPrestataires(): void {
    this.http.get<any>(`${this.apiUrl}/prestataires/?page_size=1000`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(response => {
        this.prestataires = Array.isArray(response) ? response : (response.results ?? []);
      });
  }

  private _chargerPlatPrestataires(prestataireId: number): void {
    this.isLoadingRef = true;
    this.http.get<any>(
      `${this.apiUrl}/plat-prestataires/?prestataire=${prestataireId}&page_size=1000`
    ).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.platPrestataires = Array.isArray(response) ? response : (response.results ?? []);
          this.isLoadingRef = false;
          if (this._commandesBrutes.length > 0) {
            this._construireFacturation(this._commandesBrutes);
          }
        },
        error: () => { this.isLoadingRef = false; }
      });
  }

  // ══════════════════════════════════════════════════════════
  // ✅ MONTANT DEPUIS PlatPrestataire
  //
  // PlatPrestataire = tarif global du prestataire sur une période
  // (pas de lien avec un plat spécifique)
  //
  // Pour une date_menu donnée, on cherche la ligne PlatPrestataire active :
  //   date_debut <= date_menu
  //   date_fin   >= date_menu  OU  date_fin est null
  // Parmi les lignes valides → prendre celle avec date_debut la plus récente
  // ══════════════════════════════════════════════════════════

  private _getMontantPourDate(dateMenu: string): number {
    if (!dateMenu || !this.platPrestataires.length) return 0;

    const lignesValides = this.platPrestataires.filter(pp => {
      const apresDebut = !pp.date_debut || pp.date_debut.substring(0, 10) <= dateMenu;
      const avantFin   = !pp.date_fin   || pp.date_fin.substring(0, 10)   >= dateMenu;
      return apresDebut && avantFin;
    });

    if (!lignesValides.length) return 0;

    const derniere = lignesValides.reduce((prev: any, curr: any) =>
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

  private _getUsername(user: any, fallback: string): string {
    return user?.username || fallback;
  }

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
  // ✅ CONSTRUCTION FACTURATION
  // ══════════════════════════════════════════════════════════

  private _construireFacturation(commandes: CommandeModel[]): void {
    // Filtre statuts
    const cmdFiltrees = this.statutsSelectionnes.length > 0
      ? commandes.filter(c => this.statutsSelectionnes.includes(c.statut))
      : commandes;

    // Grouper par user_nom
    const grouped: Map<string, { commandes: CommandeModel[]; user: any | null }> = new Map();

    cmdFiltrees.forEach(c => {
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
      const statuts = { en_attente: 0, retiree: 0, annulee: 0 };
      cmds.forEach(c => {
        if      (c.statut === 'en_attente') statuts.en_attente++;
        else if (c.statut === 'retiree')    statuts.retiree++;
        else if (c.statut === 'annulee')    statuts.annulee++;
      });

      // ✅ Montant global du prestataire par commande selon la date_menu
      // Regrouper les commandes par date_menu pour le détail
      const dateMap: Map<string, { dateMenu: string; platNom: string; montant: number; nbFois: number }> = new Map();
      let totalAgent = 0;

      cmds.forEach(c => {
        const dateMenu = c.menu_detail?.date_menu ?? '';
        const platNom  = c.plat_detail?.nom ?? '—';
        // ✅ montant = tarif du prestataire actif à la date_menu
        const montant  = this._getMontantPourDate(dateMenu);

        totalAgent += montant;

        // Détail regroupé par date_menu
        const key = dateMenu;
        if (!dateMap.has(key)) {
          dateMap.set(key, { dateMenu, platNom, montant, nbFois: 0 });
        }
        const entry = dateMap.get(key)!;
        entry.nbFois++;
        // Si plusieurs plats le même jour, on note "Plusieurs plats"
        if (entry.platNom !== platNom) entry.platNom = 'Plusieurs plats';
      });

      const detail = Array.from(dateMap.values())
        .sort((a, b) => a.dateMenu.localeCompare(b.dateMenu))
        .map(d => ({
          platNom:   d.platNom,
          montant:   d.montant,
          nbFois:    d.nbFois,
          sousTotal: d.montant * d.nbFois,
          // On stocke aussi la date pour l'affichage
          dateMenu:  d.dateMenu,
        }));

      // Données RH
      const dernierSvc  = user ? this._derniereLigne(user.user_services  || []) : null;
      const derniereAgc = user ? this._derniereLigne(user.user_agences   || []) : null;
      const dernierPst  = user ? this._derniereLigne(user.user_postes    || []) : null;

      this.lignesFacturation.push({
        userId:       user?.id ?? null,
        username:     this._getUsername(user, userNomKey),
        nomPrenom:    this._getNomPrenom(user),
        agenceMenu:   cmds[0]?.menu_detail?.agence_nom          ?? '—',
        agenceAgent:  derniereAgc ? (derniereAgc.agence_nom     || '—') : '—',
        equipe:       cmds[0]?.menu_detail?.typeequipe_libelle  ?? '—',
        service:      dernierSvc  ? (dernierSvc.service_libelle  || '—') : '—',
        poste:        dernierPst  ? (dernierPst.poste_libelle    || '—') : '—',
        nbCommandes:  cmds.length,
        totalMontant: totalAgent,
        detail,
        statuts,
      });

      this.totalNbCommandes += cmds.length;
      this.totalMontant     += totalAgent;
    });

    this.lignesFacturation.sort((a, b) => a.username.localeCompare(b.username));
  }

  // ══════════════════════════════════════════════════════════
  // RECHERCHE
  // ══════════════════════════════════════════════════════════

  onPrestataireChange(): void {
    const id = this.filterForm.get('prestataire')?.value;
    if (id) {
      this.prestataireSelectionne = this.prestataires.find(p => p.id === +id) ?? null;
      this._chargerPlatPrestataires(+id);
    } else {
      this.prestataireSelectionne = null;
      this.platPrestataires       = [];
    }
  }

  onStatutChange(): void {
    if (this._commandesBrutes.length > 0) {
      this._construireFacturation(this._commandesBrutes);
    }
  }

  rechercher(): void {
    if (this.filterForm.get('prestataire')?.invalid) return;
    const { date_debut, date_fin, agence, typeequipe } = this.filterForm.value;
    this.hasSearched = true;
    this.store.dispatch(fetchCommandesParAgencePeriode({
      date_debut: date_debut || undefined,
      date_fin:   date_fin   || undefined,
      agence:     agence     ? +agence     : undefined,
      typeequipe: typeequipe ? +typeequipe : undefined,
    }));
  }

  resetFilters(): void {
    const today = new Date().toISOString().split('T')[0];
    this.filterForm.reset({ date_debut: today, date_fin: '', prestataire: '', agence: '', typeequipe: '' });
    this.hasSearched           = false;
    this.statutsSelectionnes   = [];
    this.lignesFacturation     = [];
    this.totalNbCommandes      = 0;
    this.totalMontant          = 0;
    this._commandesBrutes      = [];
    this.prestataireSelectionne = null;
    this.platPrestataires      = [];
    this.detailOuvert          = new Set();
    this.store.dispatch(resetCommandesParAgencePeriode());
  }

  // ── Toggle détail plats par agent ─────────────────────────
  toggleDetail(username: string): void {
    if (this.detailOuvert.has(username)) this.detailOuvert.delete(username);
    else                                  this.detailOuvert.add(username);
  }

  isDetailOuvert(username: string): boolean {
    return this.detailOuvert.has(username);
  }

  // ══════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════

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

  get hasPlatsSansMontant(): boolean {
    return this.lignesFacturation.some(l =>
      l.detail.some(d => d.montant === 0)
    );
  }

  get prestataireNom(): string {
    return this.prestataireSelectionne?.libelle ?? '';
  }

  // ══════════════════════════════════════════════════════════
  // ✅ EXPORT EXCEL
  // ══════════════════════════════════════════════════════════

  exportExcel(): void {
    const { date_debut, date_fin } = this.filterForm.value;
    const data: any[] = [];

    this.lignesFacturation.forEach((l, i) => {
      // Ligne agent (résumé)
      data.push({
        'N°':            i + 1,
        'Username':      l.username,
        'Nom & Prénom':  l.nomPrenom,
        'Agence menu':   l.agenceMenu,
        'Agence agent':  l.agenceAgent,
        'Équipe':        l.equipe,
        'Service':       l.service,
        'Poste':         l.poste,
        'Date menu':     '',
        'Plat':          '',
        'Tarif (FCFA)':  '',
        'Nb cmd':        l.nbCommandes,
        'Total (FCFA)':  l.totalMontant,
      });
      // Détail par date_menu (sous-lignes indentées)
      l.detail.forEach(d => {
        data.push({
          'N°':            '',
          'Username':      '',
          'Nom & Prénom':  '',
          'Agence menu':   '',
          'Agence agent':  '',
          'Équipe':        '',
          'Service':       '',
          'Poste':         '',
          'Date menu':     this.formatDate(d.dateMenu),
          'Plat':          `  → ${d.platNom}`,
          'Tarif (FCFA)':  d.montant,
          'Nb cmd':        d.nbFois,
          'Total (FCFA)':  d.sousTotal,
        });
      });
    });

    // Ligne total
    data.push({
      'N°':            '',
      'Username':      'TOTAL',
      'Nom & Prénom':  '',
      'Agence menu':   '',
      'Agence agent':  '',
      'Équipe':        '',
      'Service':       '',
      'Poste':         '',
      'Date menu':     '',
      'Plat':          '',
      'Tarif (FCFA)':  '',
      'Nb cmd':        this.totalNbCommandes,
      'Total (FCFA)':  this.totalMontant,
    });

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 5  }, { wch: 18 }, { wch: 28 }, { wch: 20 }, { wch: 20 },
      { wch: 15 }, { wch: 22 }, { wch: 22 },
      { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 10 }, { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fact. Prestataire');
    XLSX.writeFile(wb, `fact-prestataire-${this.prestataireNom}-${date_debut ?? ''}-${date_fin ?? ''}.xlsx`);
  }

  // ══════════════════════════════════════════════════════════
  // ✅ EXPORT PDF
  // ══════════════════════════════════════════════════════════

  exportPdf(): void {
    const { date_debut, date_fin } = this.filterForm.value;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });

    // En-tête
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(
      `Facturation prestataire : ${this.prestataireNom}`,
      14, 14
    );
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Période : ${date_debut ? this.formatDate(date_debut) : ''}${date_fin ? ' au ' + this.formatDate(date_fin) : ''} — ` +
      `Généré le : ${new Date().toLocaleDateString('fr-FR')} — ` +
      `${this.lignesFacturation.length} agent(s) — ` +
      `${this.totalNbCommandes} commande(s) — ` +
      `Total dû : ${this.formatMontant(this.totalMontant)} FCFA`,
      14, 21
    );

    // ── Tableau résumé par agent ──────────────────────────────
    const head = [[
      'N°', 'Username', 'Nom & Prénom', 'Agence menu', 'Agence agent',
      'Équipe', 'Service', 'Poste',
      'Nb cmd', 'Att.', 'Ret.', 'Ann.', 'Total dû (FCFA)',
    ]];

    const body: any[][] = [];

    this.lignesFacturation.forEach((l, i) => {
      // Ligne principale agent
      body.push([
        i + 1,
        l.username,
        l.nomPrenom,
        l.agenceMenu,
        l.agenceAgent,
        l.equipe,
        l.service,
        l.poste,
        l.nbCommandes,
        l.statuts.en_attente,
        l.statuts.retiree,
        l.statuts.annulee,
        this.formatMontant(l.totalMontant),
      ]);
      // Sous-lignes détail plats
      l.detail.forEach(d => {
        body.push([
          '',
          { content: `→ ${d.platNom}`, colSpan: 7, styles: { fontStyle: 'italic', textColor: [100, 100, 100] } },
          d.nbFois,
          '', '', '',
          { content: this.formatMontant(d.sousTotal), styles: { textColor: [80, 80, 80] } },
        ]);
      });
    });

    // Ligne total
    body.push([
      '', 'TOTAL', '', '', '', '', '', '',
      this.totalNbCommandes, '', '', '',
      this.formatMontant(this.totalMontant),
    ]);

    autoTable(doc, {
      head,
      body,
      startY: 26,
      styles:     { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [155, 89, 182], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 245, 255] },
      didParseCell: (data) => {
        // Ligne total en gras
        if (data.row.index === body.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [235, 225, 255];
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
        8:  { cellWidth: 12, halign: 'center' },
        9:  { cellWidth: 10, halign: 'center' },
        10: { cellWidth: 10, halign: 'center' },
        11: { cellWidth: 10, halign: 'center' },
        12: { cellWidth: 22, halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    });

    doc.save(`fact-prestataire-${this.prestataireNom}-${date_debut ?? ''}-${date_fin ?? ''}.pdf`);
  }


  // ══════════════════════════════════════════════════════════
  // ✅ EXPORT PDF SYNTHÉTIQUE (Sans détails des plats)
  // ══════════════════════════════════════════════════════════

  exportPdfSynthetique(): void {
    const { date_debut, date_fin } = this.filterForm.value;
    // Utilisation du format A4 paysage pour une vue plus serrée
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // En-tête
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`État Récapitulatif : ${this.prestataireNom}`, 14, 15);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Période : ${date_debut ? this.formatDate(date_debut) : ''}${date_fin ? ' au ' + this.formatDate(date_fin) : ''} | ` +
      `Généré le : ${new Date().toLocaleDateString('fr-FR')} | ` +
      `Total agents : ${this.lignesFacturation.length}`,
      14, 22
    );

    // Définition des colonnes
    const head = [[
      'N°', 'Username', 'Nom & Prénom', 'Agence', 'Service', 'Poste',
      'Nb cmd', 'Att.', 'Ret.', 'Ann.', 'Total dû (FCFA)',
    ]];

    const body: any[][] = [];

    this.lignesFacturation.forEach((l, i) => {
      body.push([
        i + 1,
        l.username,
        l.nomPrenom,
        l.agenceAgent, // On privilégie l'agence de l'agent pour la synthèse
        l.service,
        l.poste,
        l.nbCommandes,
        l.statuts.en_attente,
        l.statuts.retiree,
        l.statuts.annulee,
        this.formatMontant(l.totalMontant),
      ]);
    });

    // Ligne de total général
    body.push([
      { content: 'TOTAL GÉNÉRAL', colSpan: 6, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: this.totalNbCommandes, styles: { halign: 'center', fontStyle: 'bold' } },
      '', '', '',
      { content: this.formatMontant(this.totalMontant), styles: { halign: 'right', fontStyle: 'bold' } },
    ]);

    autoTable(doc, {
      head,
      body,
      startY: 28,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' }, // Bleu plus sobre pour la synthèse
      alternateRowStyles: { fillColor: [245, 245, 245] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        6: { cellWidth: 15, halign: 'center' },
        7: { cellWidth: 12, halign: 'center' },
        8: { cellWidth: 12, halign: 'center' },
        9: { cellWidth: 12, halign: 'center' },
        10: { cellWidth: 30, halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    });

    // Signature ou pied de page optionnel
    const finalY = (doc as any).lastAutoTable.finalY || 30;
    doc.setFontSize(8);
    doc.text("Document certifié conforme pour facturation.", 14, finalY + 10);

    doc.save(`synthese-prestataire-${this.prestataireNom}-${date_debut ?? ''}.pdf`);
  }
  
}
