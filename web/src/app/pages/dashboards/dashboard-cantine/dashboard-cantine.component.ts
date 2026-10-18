// src/app/pages/dashboard-cantine/dashboard-cantine.component.ts

import { Component, OnInit, OnDestroy } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { fetchDashboardCantine } from 'src/app/store/DashboardCantine/dashboard-cantine.action';
import {
  selectDashboardCantineLoading,
  selectDashboardCantineError,
  selectKpis,
  selectParMois,
  selectTopPlats,
  selectParAgence,
  selectParTypePlat,
  selectMenusRecents,
  selectEvolutionHebdo,
  selectFactFournisseur,
  selectFactEmploye,
  selectEvolutionParDate,
} from 'src/app/store/DashboardCantine/dashboard-cantine-selector';

import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';
import { selectAllTypeequipeWithoutPagination } from 'src/app/store/Typeequipe/typeequipe-selector';
import { fetchtypeequipeNoPaginateData } from 'src/app/store/Typeequipe/typeequipe.action';

import {
  KpisCantine, ParMoisItem, TopPlatItem, ParAgenceItem,
  ParTypePlatItem, MenuRecentItem, EvolutionHebdoItem,
  FactFournisseur, FactEmploye, FactMoisItem,
  StatutCommande, StatutOption, DashboardCantineFilters,
  EvolutionParDateItem,
} from 'src/app/store/DashboardCantine/dashboard-cantine.model';

@Component({
  selector: 'app-dashboard-cantine',
  templateUrl: './dashboard-cantine.component.html',
  styleUrls: ['./dashboard-cantine.component.scss'],
})
export class DashboardCantineComponent implements OnInit, OnDestroy {

  breadCrumbItems: Array<{}> = [];

  // ── Filtres ──────────────────────────────────────────────────
  dateDebut:           string           = DashboardCantineComponent.debutMoisCourant();
  dateFin:             string           = DashboardCantineComponent.finMoisCourant();
  selectedAgences:     number[]         = [];
  selectedTypeEquipes: number[]         = [];
  selectedStatuts:     StatutCommande[] = [];

  agences:     any[] = [];
  typeequipes: any[] = [];

  readonly statutOptions: StatutOption[] = [
    { value: 'en_attente', label: 'En attente', color: '#ffc107' },
    { value: 'retiree',    label: 'Retirée',    color: '#51d78e' },
    { value: 'annulee',    label: 'Annulée',    color: '#ff4d4f' },
  ];

  moisLibelles: string[] = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
  ];

  moisCourts: string[] = [
    'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
  ];

  // ── Observables ──────────────────────────────────────────────
  isLoading$:        Observable<boolean>;
  error$:            Observable<string | null>;
  kpis$:             Observable<KpisCantine | null>;
  parMois$:          Observable<ParMoisItem[] | null>;
  topPlats$:         Observable<TopPlatItem[] | null>;
  parAgence$:        Observable<ParAgenceItem[] | null>;
  parTypePlat$:      Observable<ParTypePlatItem[] | null>;
  menusRecents$:     Observable<MenuRecentItem[] | null>;
  evolutionHebdo$:   Observable<EvolutionHebdoItem[] | null>;
  factFournisseur$:      Observable<FactFournisseur | null>;
  factEmploye$:          Observable<FactEmploye | null>;
  evolutionParDate$:     Observable<EvolutionParDateItem[] | null>;

  // ── Charts ───────────────────────────────────────────────────
  chartCommandesMois:    any = null;
  chartTopPlats:         any = null;
  chartParAgence:        any = null;
  chartTypePlat:         any = null;
  chartEvolution:        any = null;
  chartEvolutionParDate: any = null;
  chartFactPrestMois:    any = null;
  chartFactPrestAgence:  any = null;
  chartFactEmpMois:      any = null;
  chartFactEmpAgence:    any = null;

  // ── Snapshots exports ────────────────────────────────────────
  private _kpis:            KpisCantine | null   = null;
  private _parMois:         ParMoisItem[]         = [];
  private _topPlats:        TopPlatItem[]         = [];
  private _parAgence:       ParAgenceItem[]        = [];
  private _factFournisseur: FactFournisseur | null = null;
  private _factEmploye:     FactEmploye | null     = null;
  private _destroy$         = new Subject<void>();

  // ── Dates statiques ──────────────────────────────────────────
  static debutMoisCourant(): string {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
  }

  static finMoisCourant(): string {
    const d    = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(last).padStart(2, '0');
  }

  constructor(private store: Store, private toastService: ToastrService) {
    this.isLoading$       = this.store.select(selectDashboardCantineLoading);
    this.error$           = this.store.select(selectDashboardCantineError);
    this.kpis$            = this.store.select(selectKpis);
    this.parMois$         = this.store.select(selectParMois);
    this.topPlats$        = this.store.select(selectTopPlats);
    this.parAgence$       = this.store.select(selectParAgence);
    this.parTypePlat$     = this.store.select(selectParTypePlat);
    this.menusRecents$    = this.store.select(selectMenusRecents);
    this.evolutionHebdo$  = this.store.select(selectEvolutionHebdo);
    this.factFournisseur$  = this.store.select(selectFactFournisseur);
    this.factEmploye$      = this.store.select(selectFactEmploye);
    this.evolutionParDate$ = this.store.select(selectEvolutionParDate);
  }

  ngOnInit(): void {
    this.breadCrumbItems = [
      { label: 'Cantine', active: false },
      { label: 'Tableau de bord', active: true },
    ];

    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.dispatch(fetchtypeequipeNoPaginateData());

    this.store.select(selectAllAgenceWithoutPagination)
      .pipe(takeUntil(this._destroy$))
      .subscribe(data => { if (data) this.agences = data; });

    this.store.select(selectAllTypeequipeWithoutPagination)
      .pipe(takeUntil(this._destroy$))
      .subscribe(data => { if (data) this.typeequipes = data; });

    this.error$.pipe(takeUntil(this._destroy$))
      .subscribe(e => {
        if (e) this.toastService.error(e, 'Tableau de bord : chargement impossible');
      });

    this.kpis$.pipe(takeUntil(this._destroy$))
      .subscribe(k => { if (k) this._kpis = k; });

    this.parMois$.pipe(takeUntil(this._destroy$))
      .subscribe(m => { if (m) { this._parMois = m; this._buildChartMois(m); } });

    this.topPlats$.pipe(takeUntil(this._destroy$))
      .subscribe(t => { if (t) { this._topPlats = t; this._buildChartTopPlats(t); } });

    this.parAgence$.pipe(takeUntil(this._destroy$))
      .subscribe(a => { if (a) { this._parAgence = a; this._buildChartAgence(a); } });

    this.parTypePlat$.pipe(takeUntil(this._destroy$))
      .subscribe(d => { if (d) this._buildChartTypePlat(d); });

    this.evolutionHebdo$.pipe(takeUntil(this._destroy$))
      .subscribe(d => { if (d) this._buildChartEvolution(d); });

    this.evolutionParDate$.pipe(takeUntil(this._destroy$))
      .subscribe(d => { if (d) this._buildChartEvolutionParDate(d); });

    this.factFournisseur$.pipe(takeUntil(this._destroy$))
      .subscribe(f => {
        if (f) {
          this._factFournisseur = f;
          this._buildChartFactPrestMois(f);
          this._buildChartFactPrestAgence(f);
        }
      });

    this.factEmploye$.pipe(takeUntil(this._destroy$))
      .subscribe(f => {
        if (f) {
          this._factEmploye = f;
          this._buildChartFactEmpMois(f);
          this._buildChartFactEmpAgence(f);
        }
      });

    this.charger();
  }

  ngOnDestroy(): void {
    this._destroy$.next();
    this._destroy$.complete();
  }

  // ── Actions ───────────────────────────────────────────────────

  charger(): void {
    const filters: DashboardCantineFilters = {};
    if (this.dateDebut)                  filters.date_debut  = this.dateDebut;
    if (this.dateFin)                    filters.date_fin    = this.dateFin;
    if (this.selectedAgences.length)     filters.agences     = this.selectedAgences;
    if (this.selectedTypeEquipes.length) filters.typeequipes = this.selectedTypeEquipes;
    if (this.selectedStatuts.length)     filters.statuts     = this.selectedStatuts;
    this.store.dispatch(fetchDashboardCantine({ filters }));
  }

  filtrer(): void { this.charger(); }

  resetFiltres(): void {
    this.dateDebut           = DashboardCantineComponent.debutMoisCourant();
    this.dateFin             = DashboardCantineComponent.finMoisCourant();
    this.selectedAgences     = [];
    this.selectedTypeEquipes = [];
    this.selectedStatuts     = [];
    this.charger();
  }

  // ── Filtres actifs ────────────────────────────────────────────

  get hasFiltresActifs(): boolean {
    return !!(this.dateDebut || this.dateFin ||
      this.selectedAgences.length || this.selectedTypeEquipes.length || this.selectedStatuts.length);
  }

  getFiltresActifs(): string {
    const parts: string[] = [];
    if (this.dateDebut || this.dateFin)
      parts.push((this.dateDebut || '...') + ' -> ' + (this.dateFin || '...'));
    if (this.selectedAgences.length)     parts.push(this.selectedAgences.length + ' agence(s)');
    if (this.selectedTypeEquipes.length) parts.push(this.selectedTypeEquipes.length + ' équipe(s)');
    if (this.selectedStatuts.length)     parts.push(this.selectedStatuts.length + ' statut(s)');
    return parts.length ? parts.join(' | ') : 'Mois en cours';
  }

  // ── Helpers template ──────────────────────────────────────────

  formatNombre(val: any): string {
    const n = Number(val) || 0;
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  formatMontant(val: any): string {
    const n = Number(val) || 0;
    return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' FCFA';
  }

  /** Plusieurs années dans la période → on affiche l'année avec le mois. */
  private _plusieursAnnees(items: { annee: number }[]): boolean {
    return new Set(items.map(i => i.annee)).size > 1;
  }

  /** « Octobre » si une seule année, « oct. 2026 » (court) / « Octobre 2026 » (long) sinon. */
  libelleMois(item: { annee: number; mois: number }, avecAnnee: boolean, court = false): string {
    const nom = (court ? this.moisCourts : this.moisLibelles)[item.mois - 1] || String(item.mois);
    return avecAnnee ? nom + ' ' + item.annee : nom;
  }

  parMoisArray(parMois: ParMoisItem[] | null): { label: string; data: ParMoisItem }[] {
    if (!parMois) return [];
    const avecAnnee = this._plusieursAnnees(parMois);
    return parMois.map(m => ({ label: this.libelleMois(m, avecAnnee), data: m }));
  }

  sumParMois(parMois: ParMoisItem[] | null, field: 'total' | 'en_attente' | 'retiree' | 'annulee'): number {
    if (!parMois) return 0;
    return parMois.reduce((acc, m) => acc + (Number(m?.[field]) || 0), 0);
  }

  /** Taux calculé par le serveur : retirées / non annulées dont le menu est passé. */
  tauxRetrait(row: ParMoisItem): number {
    return Number(row?.taux_retrait) || 0;
  }

  maxNombre(topPlats: TopPlatItem[] | null): number {
    if (!topPlats || !topPlats.length) return 1;
    return Number(topPlats[0].nombre) || 1;
  }

  maxMontantFact(items: any[] | null): number {
    if (!items || !items.length) return 1;
    return Math.max(...items.map(i => Number(i.montant) || 0), 1);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  getStatutColor(statut: string): string {
    return this.statutOptions.find(s => s.value === statut)?.color || '#6c757d';
  }

  // Sécurité : convertit n'importe quelle valeur en string lisible
  // Évite [object Object] si Django retourne un objet FK au lieu d'un string
  str(val: any): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'object') {
      // Essayer les champs nom courants
      return val.nom || val.libelle || val.label || val.name || val.prenom
        || val.title || val.designation || JSON.stringify(val);
    }
    return String(val);
  }

  // ── Chart builders — commandes ────────────────────────────────

  private _buildChartMois(data: ParMoisItem[]): void {
    if (!data.length || !data.some(m => Number(m.total) > 0)) { this.chartCommandesMois = null; return; }
    const avecAnnee = this._plusieursAnnees(data);
    this.chartCommandesMois = {
      series: [
        { name: 'Retirées',   data: data.map(m => Number(m.retiree)    || 0) },
        { name: 'En attente', data: data.map(m => Number(m.en_attente) || 0) },
        { name: 'Annulées',   data: data.map(m => Number(m.annulee)    || 0) },
      ],
      chart: { type: 'bar', height: 320, stacked: true, toolbar: { show: false } },
      colors: ['#51d78e', '#ffc107', '#ff4d4f'],
      plotOptions: { bar: { columnWidth: '55%', borderRadius: 4 } },
      dataLabels: { enabled: false },
      xaxis: {
        categories: data.map(m => this.libelleMois(m, avecAnnee, avecAnnee)),
        labels: { style: { fontSize: '11px' } },
      },
      yaxis: { labels: { formatter: (v: any) => (typeof v === 'number' ? Math.round(v).toString() : '') } },
      legend: { position: 'top' },
      grid:   { borderColor: '#f3f4f6' },
      tooltip: {
        shared: true,
        intersect: false,
        y: { formatter: (v: any) => (typeof v === 'number' ? Math.round(v).toString() : '') },
      },
    };
  }

  private _buildChartTopPlats(data: TopPlatItem[]): void {
    if (!data.length) { this.chartTopPlats = null; return; }
    const top7 = data.slice(0, 7);
    this.chartTopPlats = {
      series: [{ name: 'Commandes', data: top7.map(p => p.nombre) }],
      chart: { type: 'bar', height: 300, toolbar: { show: false } },
      colors: ['#092440'],
      plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '60%' } },
      dataLabels: { enabled: true },
      xaxis: { categories: top7.map(p => p.nom) },
      grid: { borderColor: '#f3f4f6' },
    };
  }

  private _buildChartAgence(data: ParAgenceItem[]): void {
    if (!data.length) { this.chartParAgence = null; return; }
    this.chartParAgence = {
      series: [
        { name: 'En attente', data: data.map(a => Number(a.en_attente) || 0) },
        { name: 'Retirées',   data: data.map(a => Number(a.retiree)    || 0) },
        { name: 'Annulées',   data: data.map(a => Number(a.annulee)    || 0) },
      ],
      chart: { type: 'bar', height: 300, toolbar: { show: false } },
      colors: ['#ffc107', '#51d78e', '#ff4d4f'],
      plotOptions: { bar: { columnWidth: '50%', borderRadius: 4 } },
      dataLabels: { enabled: false },
      xaxis: { categories: data.map(a => a.agence) },
      legend: { position: 'top' },
      grid:   { borderColor: '#f3f4f6' },
      tooltip: {
        shared: true,
        intersect: false,
        y: { formatter: (v: any) => (typeof v === 'number' ? Math.round(v).toString() : '') },
      },
    };
  }

  private _buildChartTypePlat(data: ParTypePlatItem[]): void {
  if (!data.length) { this.chartTypePlat = null; return; }
  this.chartTypePlat = {
    series: data.map(d => d.total),
    chart: {
      type: 'donut',
      height: 300,
      parentHeightOffset: 0 // Aide à mieux utiliser l'espace
    },
    labels: data.map(d => d.type_plat || 'Inconnu'),
    colors: ['#092440', '#51d78e', '#ffc107', '#17a2b8', '#6f42c1', '#ff4d4f'],
    legend: {
      position: 'bottom',
      horizontalAlign: 'center',
      fontSize: '12px',
      markers: { radius: 12 },
      itemMargin: {
        horizontal: 5,
        vertical: 2
      },
      // Permet de masquer la légende si l'écran est vraiment trop petit
      // ou de la forcer sur plusieurs lignes proprement
    },
    dataLabels: {
      enabled: true,
      dropShadow: { enabled: false } // Plus propre sur un donut
    },
    plotOptions: {
      pie: {
        donut: {
          size: '70%', // Légèrement plus grand pour la lisibilité
          labels: {
            show: true,
            total: {
              show: true,
              label: 'Total',
              formatter: (w: any) => {
                return w.globals.seriesTotals.reduce((a: any, b: any) => a + b, 0);
              }
            }
          }
        }
      }
    },
  };
}

  private _buildChartEvolution(data: EvolutionHebdoItem[]): void {
    if (!data.length) { this.chartEvolution = null; return; }
    this.chartEvolution = {
      series: [{ name: 'Commandes', data: data.map(d => d.total) }],
      chart: { type: 'area', height: 180, sparkline: { enabled: true } },
      colors: ['#51d78e'],
      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.1 } },
      stroke: { curve: 'smooth', width: 2 },
      xaxis: { categories: data.map(d => d.label) },
      tooltip: { fixed: { enabled: false }, x: { show: true }, y: { title: { formatter: () => '' } } },
    };
  }

  // ── Chart builder — évolution par date ──────────────────────────

  private _buildChartEvolutionParDate(data: EvolutionParDateItem[]): void {
    if (!data.length) { this.chartEvolutionParDate = null; return; }

    // Formater les dates : YYYY-MM-DD → DD/MM
    const labels = data.map(d => {
      const parts = d.date.split('-');
      return parts.length === 3 ? parts[2] + '/' + parts[1] : d.date;
    });

    this.chartEvolutionParDate = {
      series: [
        { name: 'En attente', data: data.map(d => Number(d.en_attente) || 0) },
        { name: 'Retirées',   data: data.map(d => Number(d.retiree)    || 0) },
        { name: 'Annulées',   data: data.map(d => Number(d.annulee)    || 0) },
      ],
      chart: {
        type: 'line',
        height: 320,
        toolbar: { show: true, tools: { download: true, zoom: true, pan: true, reset: true } },
        zoom: { enabled: true },
      },
      colors:  ['#ffc107', '#51d78e', '#ff4d4f'],
      // stroke uniforme sur toutes les séries — pas de tableau pour éviter
      // que certaines courbes soient écrasées par le fill
      stroke:  { curve: 'smooth', width: 2 },
      markers: { size: 4, strokeWidth: 2, hover: { size: 6 } },
      xaxis: {
        categories: labels,
        labels: { rotate: -45, style: { fontSize: '10px' } },
        tickAmount: Math.min(data.length, 30),
      },
      yaxis: {
        min: 0,
        labels: { formatter: (v: any) => (typeof v === 'number' ? Math.round(v).toString() : '') },
      },
      legend: { position: 'top' },
      grid:   { borderColor: '#f3f4f6', strokeDashArray: 4 },
      tooltip: {
        shared: true,
        intersect: false,
        x: { show: true },
        y: { formatter: (v: any) => (typeof v === 'number' ? Math.round(v).toString() + ' cmd' : '') },
      },
      // fill: solid sur toutes les séries — pas de gradient
      // le gradient masquait les courbes qui passent derrière
      fill: { type: 'solid', opacity: 1 },
      dataLabels: { enabled: false },
    };
  }

  // ── Chart builders — facturation ──────────────────────────────

  private _chartFactMois(parMois: FactMoisItem[], couleur: string): any {
    if (!parMois.length || !parMois.some(m => Number(m.montant) > 0)) return null;
    const avecAnnee = this._plusieursAnnees(parMois);
    return {
      series: [{ name: 'Montant FCFA', data: parMois.map(m => Number(m.montant) || 0) }],
      chart: { type: 'bar', height: 260, toolbar: { show: false } },
      colors: [couleur],
      plotOptions: { bar: { columnWidth: '55%', borderRadius: 4 } },
      dataLabels: { enabled: false },
      xaxis: {
        categories: parMois.map(m => this.libelleMois(m, avecAnnee, avecAnnee)),
        labels: { style: { fontSize: '10px' } },
      },
      yaxis: { labels: { formatter: (v: any) => (typeof v === 'number' ? this.formatMontant(v) : '') } },
      grid: { borderColor: '#f3f4f6' },
      tooltip: { y: { formatter: (v: any) => (typeof v === 'number' ? this.formatMontant(v) : '') } },
    };
  }

  private _chartFactAgence(parAgence: { agence: string; montant: number }[], couleur: string): any {
    if (!parAgence.length) return null;
    return {
      series: [{ name: 'Montant', data: parAgence.map(a => a.montant) }],
      chart: { type: 'bar', height: 260, toolbar: { show: false } },
      colors: [couleur],
      plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '55%' } },
      dataLabels: { enabled: false },
      xaxis: { categories: parAgence.map(a => a.agence) },
      yaxis: { labels: { formatter: (v: any) => (typeof v === 'number' ? this.formatMontant(v) : '') } },
      grid: { borderColor: '#f3f4f6' },
      tooltip: { y: { formatter: (v: any) => (typeof v === 'number' ? this.formatMontant(v) : '') } },
    };
  }

  private _buildChartFactPrestMois(f: FactFournisseur): void {
    this.chartFactPrestMois = this._chartFactMois(f.par_mois || [], '#092440');
  }

  private _buildChartFactPrestAgence(f: FactFournisseur): void {
    this.chartFactPrestAgence = this._chartFactAgence(f.par_agence || [], '#092440');
  }

  private _buildChartFactEmpMois(f: FactEmploye): void {
    this.chartFactEmpMois = this._chartFactMois(f.par_mois || [], '#51d78e');
  }

  private _buildChartFactEmpAgence(f: FactEmploye): void {
    this.chartFactEmpAgence = this._chartFactAgence(f.par_agence || [], '#51d78e');
  }

  // ── Exports ───────────────────────────────────────────────────

  exporterExcel(): void {
    const wb = XLSX.utils.book_new();
    const kpisRows: any[][] = this._kpis ? [
      ['Indicateur', 'Valeur'],
      ['Total commandes',  this._kpis.total_commandes],
      ['En attente',       this._kpis.total_en_attente],
      ['Retirées',         this._kpis.total_retirees],
      ['Annulées',         this._kpis.total_annulees],
      ['Total menus',      this._kpis.total_menus],
      ['Taux retrait (%)', this._kpis.taux_retrait],
      ['Taux annul. (%)',  this._kpis.taux_annulation],
    ] : [['Aucune donnée']];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpisRows), 'KPIs');

    const moisRows: any[][] = [
      ['Mois', 'Total', 'En attente', 'Retirées', 'Annulées', 'Taux retrait (%)'],
      ...this.parMoisArray(this._parMois).map(r =>
        [r.label, r.data.total, r.data.en_attente, r.data.retiree, r.data.annulee, r.data.taux_retrait]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(moisRows), 'Par mois');

    const lignesMois = (parMois: FactMoisItem[]) => {
      const avecAnnee = this._plusieursAnnees(parMois);
      return parMois.map(m => [this.libelleMois(m, avecAnnee), this.formatMontant(m.montant)]);
    };

    if (this._factFournisseur) {
      const f = this._factFournisseur;
      const fpRows: any[][] = [
        ['Total prestataire', this.formatMontant(f.total_montant)],
        ['Repas sans tarif',  f.repas_sans_tarif || 0],
        [],
        ['Mois', 'Montant'],
        ...lignesMois(f.par_mois || []),
        [],
        ['Prestataire', 'Montant', 'Nb commandes'],
        ...f.par_prestataire.map(p => [p.prestataire, this.formatMontant(p.montant), p.nb_commandes]),
        [],
        ['Agence', 'Montant', 'Nb commandes'],
        ...f.par_agence.map(a => [a.agence, this.formatMontant(a.montant), a.nb_commandes]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fpRows), 'Fact. Prestataire');
    }

    if (this._factEmploye) {
      const f = this._factEmploye;
      const feRows: any[][] = [
        ['Total employé',    this.formatMontant(f.total_montant)],
        ['Repas sans tarif', f.repas_sans_tarif || 0],
        [],
        ['Mois', 'Montant'],
        ...lignesMois(f.par_mois || []),
        [],
        ['Catégorie', 'Montant', 'Nb commandes'],
        ...f.par_categorie.map(c => [c.categorie, this.formatMontant(c.montant), c.nb_commandes]),
        [],
        ['Agence', 'Montant', 'Nb commandes'],
        ...f.par_agence.map(a => [a.agence, this.formatMontant(a.montant), a.nb_commandes]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(feRows), 'Fact. Employé');
    }

    XLSX.utils.book_append_sheet(
      wb, XLSX.utils.aoa_to_sheet([
        ['Plat', 'Type', 'Commandes'],
        ...this._topPlats.map(p => [p.nom, p.type_plat, p.nombre]),
      ]), 'Top plats'
    );

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf]), 'dashboard_cantine_' + new Date().getFullYear() + '.xlsx');
  }

  exporterPDF(): void {
    const doc   = new jsPDF();
    const today = new Date().toLocaleDateString('fr-FR');
    // Position sous le dernier tableau (ou sous l'en-tête s'il n'y en a pas encore)
    const suite = () => ((doc as any).lastAutoTable?.finalY ?? 18) + 10;
    doc.setFontSize(14); doc.setTextColor(9, 36, 64);
    doc.text('Tableau de bord cantine', 14, 15);
    doc.setFontSize(9); doc.setTextColor(100);
    doc.text('Filtres : ' + this.getFiltresActifs() + '  -  Édité le ' + today, 14, 22);

    if (this._kpis) {
      autoTable(doc, {
        startY: 28,
        head: [['Indicateur', 'Valeur']],
        body: [
          ['Total commandes', this._kpis.total_commandes],
          ['En attente',      this._kpis.total_en_attente],
          ['Retirées',        this._kpis.total_retirees],
          ['Annulées',        this._kpis.total_annulees],
          ['Taux retrait',    this._kpis.taux_retrait + '%'],
        ],
        headStyles: { fillColor: [9, 36, 64] }, styles: { fontSize: 9 },
      });
    }

    if (this._factFournisseur) {
      autoTable(doc, {
        startY: suite(),
        head: [['Prestataire', 'Montant', 'Nb commandes']],
        body: this._factFournisseur.par_prestataire.map(p =>
          [p.prestataire, this.formatMontant(p.montant), p.nb_commandes]
        ),
        headStyles: { fillColor: [9, 36, 64] }, styles: { fontSize: 9 },
      });
    }

    if (this._factEmploye) {
      autoTable(doc, {
        startY: suite(),
        head: [['Catégorie', 'Montant', 'Nb commandes']],
        body: this._factEmploye.par_categorie.map(c =>
          [c.categorie, this.formatMontant(c.montant), c.nb_commandes]
        ),
        headStyles: { fillColor: [81, 215, 142], textColor: 0 }, styles: { fontSize: 9 },
      });
    }

    doc.save('dashboard_cantine.pdf');
  }
}
