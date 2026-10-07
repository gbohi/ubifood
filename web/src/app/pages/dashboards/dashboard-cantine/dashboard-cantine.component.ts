// src/app/pages/dashboard-cantine/dashboard-cantine.component.ts

import { Component, OnInit, OnDestroy } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { fetchDashboardCantine } from 'src/app/store/DashboardCantine/dashboard-cantine.action';
import {
  selectDashboardCantineLoading,
  selectKpis,
  selectParMois,
  selectTopPlats,
  selectParAgence,
  selectParTypeEquipe,
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
  ParTypeEquipeItem, ParTypePlatItem, MenuRecentItem, EvolutionHebdoItem,
  FactFournisseur, FactEmploye,
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
    { value: 'retiree',    label: 'Retiree',    color: '#51d78e' },
    { value: 'annulee',    label: 'Annulee',    color: '#ff4d4f' },
  ];

  moisLibelles: string[] = [
    'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
  ];

  // ── Observables ──────────────────────────────────────────────
  isLoading$:        Observable<boolean>;
  kpis$:             Observable<KpisCantine | null>;
  parMois$:          Observable<{ [k: number]: ParMoisItem } | null>;
  topPlats$:         Observable<TopPlatItem[] | null>;
  parAgence$:        Observable<ParAgenceItem[] | null>;
  parTypeEquipe$:    Observable<ParTypeEquipeItem[] | null>;
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
  chartFactPrestPrest:   any = null;
  chartFactEmpMois:      any = null;
  chartFactEmpAgence:    any = null;
  chartFactEmpCategorie: any = null;

  // ── Snapshots exports ────────────────────────────────────────
  private _kpis:            KpisCantine | null   = null;
  private _parMois:         { [k: number]: ParMoisItem } = {};
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

  constructor(private store: Store) {
    this.isLoading$       = this.store.select(selectDashboardCantineLoading);
    this.kpis$            = this.store.select(selectKpis);
    this.parMois$         = this.store.select(selectParMois);
    this.topPlats$        = this.store.select(selectTopPlats);
    this.parAgence$       = this.store.select(selectParAgence);
    this.parTypeEquipe$   = this.store.select(selectParTypeEquipe);
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
      { label: 'Dashboard', active: true },
    ];

    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.dispatch(fetchtypeequipeNoPaginateData());

    this.store.select(selectAllAgenceWithoutPagination)
      .pipe(takeUntil(this._destroy$))
      .subscribe(data => { if (data) this.agences = data; });

    this.store.select(selectAllTypeequipeWithoutPagination)
      .pipe(takeUntil(this._destroy$))
      .subscribe(data => { if (data) this.typeequipes = data; });

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
          this._buildChartFactPrestPrest(f);
        }
      });

    this.factEmploye$.pipe(takeUntil(this._destroy$))
      .subscribe(f => {
        if (f) {
          this._factEmploye = f;
          this._buildChartFactEmpMois(f);
          this._buildChartFactEmpAgence(f);
          this._buildChartFactEmpCategorie(f);
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
    if (this.selectedTypeEquipes.length) parts.push(this.selectedTypeEquipes.length + ' equipe(s)');
    if (this.selectedStatuts.length)     parts.push(this.selectedStatuts.length + ' statut(s)');
    return parts.length ? parts.join(' | ') : 'Toutes les donnees';
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

  parMoisArray(parMois: { [k: number]: ParMoisItem } | null): { mois: number; label: string; data: ParMoisItem }[] {
    if (!parMois) return [];
    const empty: ParMoisItem = { total: 0, en_attente: 0, retiree: 0, annulee: 0 };
    return Array.from({ length: 12 }, (_, i) => {
      const key   = i + 1;
      // JSON retourne les clés comme strings "1","2"... → chercher les deux
      const data  = parMois[key] || (parMois as any)[String(key)] || empty;
      // Sécuriser : s'assurer que les valeurs sont bien des numbers
      return {
        mois:  key,
        label: this.moisLibelles[i],
        data: {
          total:      Number(data.total      || 0),
          en_attente: Number(data.en_attente || 0),
          retiree:    Number(data.retiree    || 0),
          annulee:    Number(data.annulee    || 0),
        },
      };
    });
  }

  sumParMois(parMois: { [k: number]: ParMoisItem } | null, field: 'total' | 'en_attente' | 'retiree' | 'annulee'): number {
    if (!parMois) return 0;
    return Object.values(parMois).reduce((acc, m) => {
      const v = m && typeof m === 'object' ? m[field] : 0;
      return acc + (Number(v) || 0);
    }, 0);
  }

  tauxRetrait(row: ParMoisItem): number {
    const total   = Number(row?.total)   || 0;
    const retiree = Number(row?.retiree) || 0;
    if (total === 0) return 0;
    return Math.round((retiree / total) * 100);
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

  private _buildChartMois(data: { [k: number]: ParMoisItem }): void {
    // JSON retourne les clés comme strings → chercher data[i+1] ET data[String(i+1)]
    const getVal = (i: number, field: keyof ParMoisItem): number => {
      const row = data[i + 1] || (data as any)[String(i + 1)];
      return row ? Number(row[field]) || 0 : 0;
    };
    this.chartCommandesMois = {
      series: [
        { name: 'Retirees',   data: Array.from({length:12},(_,i) => getVal(i,'retiree'))    },
        { name: 'En attente', data: Array.from({length:12},(_,i) => getVal(i,'en_attente')) },
        { name: 'Annulees',   data: Array.from({length:12},(_,i) => getVal(i,'annulee'))    },
      ],
      chart: { type: 'bar', height: 320, stacked: true, toolbar: { show: false } },
      colors: ['#51d78e', '#ffc107', '#ff4d4f'],
      plotOptions: { bar: { columnWidth: '55%', borderRadius: 4 } },
      dataLabels: { enabled: false },
      xaxis: { categories: this.moisLibelles, labels: { style: { fontSize: '11px' } } },
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
    if (!data.length) return;
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
    if (!data.length) return;
    this.chartParAgence = {
      series: [
        { name: 'En attente', data: data.map(a => Number(a.en_attente) || 0) },
        { name: 'Retirees',   data: data.map(a => Number(a.retiree)    || 0) },
        { name: 'Annulees',   data: data.map(a => Number(a.annulee)    || 0) },
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
  if (!data.length) return;
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
    if (!data.length) return;
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

  // ── Chart builder — evolution par date ──────────────────────────

  private _buildChartEvolutionParDate(data: EvolutionParDateItem[]): void {
    if (!data.length) return;

    // Formater les dates : YYYY-MM-DD → DD/MM
    const labels = data.map(d => {
      const parts = d.date.split('-');
      return parts.length === 3 ? parts[2] + '/' + parts[1] : d.date;
    });

    this.chartEvolutionParDate = {
      series: [
        { name: 'En attente', data: data.map(d => Number(d.en_attente) || 0) },
        { name: 'Retirees',   data: data.map(d => Number(d.retiree)    || 0) },
        { name: 'Annulees',   data: data.map(d => Number(d.annulee)    || 0) },
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

  // ── Chart builders — facturation prestataire ──────────────────

  private _buildChartFactPrestMois(f: FactFournisseur): void {
    const montants = Array.from({ length: 12 }, (_, i) =>
      Number(f.par_mois[i + 1] || (f.par_mois as any)[String(i + 1)] || 0));
    this.chartFactPrestMois = {
      series: [{ name: 'Montant FCFA', data: montants }],
      chart: { type: 'bar', height: 260, toolbar: { show: false } },
      colors: ['#092440'],
      plotOptions: { bar: { columnWidth: '55%', borderRadius: 4 } },
      dataLabels: { enabled: false },
      xaxis: { categories: this.moisLibelles, labels: { style: { fontSize: '10px' } } },
      yaxis: { labels: { formatter: (v: any) => (typeof v === 'number' ? this.formatMontant(v) : '') } },
      grid: { borderColor: '#f3f4f6' },
      tooltip: { y: { formatter: (v: any) => (typeof v === 'number' ? this.formatMontant(v) : '') } },
    };
  }

  private _buildChartFactPrestAgence(f: FactFournisseur): void {
    if (!f.par_agence.length) return;
    this.chartFactPrestAgence = {
      series: [{ name: 'Montant', data: f.par_agence.map(a => a.montant) }],
      chart: { type: 'bar', height: 260, toolbar: { show: false } },
      colors: ['#092440'],
      plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '55%' } },
      dataLabels: { enabled: false },
      xaxis: { categories: f.par_agence.map(a => a.agence) },
      yaxis: { labels: { formatter: (v: any) => (typeof v === 'number' ? this.formatMontant(v) : '') } },
      grid: { borderColor: '#f3f4f6' },
      tooltip: { y: { formatter: (v: any) => (typeof v === 'number' ? this.formatMontant(v) : '') } },
    };
  }

  private _buildChartFactPrestPrest(f: FactFournisseur): void {
    if (!f.par_prestataire.length) return;
    this.chartFactPrestPrest = {
      series: f.par_prestataire.map(p => p.montant),
      chart: { type: 'donut', height: 260 },
      labels: f.par_prestataire.map(p => p.prestataire),
      colors: ['#092440', '#51d78e', '#ffc107', '#17a2b8', '#6f42c1', '#ff4d4f'],
      legend: { position: 'bottom' },
      dataLabels: { enabled: true },
      plotOptions: { pie: { donut: { size: '60%' } } },
      tooltip: { y: { formatter: (v: any) => (typeof v === 'number' ? this.formatMontant(v) : '') } },
    };
  }

  // ── Chart builders — facturation employé ─────────────────────

  private _buildChartFactEmpMois(f: FactEmploye): void {
    const montants = Array.from({ length: 12 }, (_, i) =>
      Number(f.par_mois[i + 1] || (f.par_mois as any)[String(i + 1)] || 0));
    this.chartFactEmpMois = {
      series: [{ name: 'Montant FCFA', data: montants }],
      chart: { type: 'bar', height: 260, toolbar: { show: false } },
      colors: ['#51d78e'],
      plotOptions: { bar: { columnWidth: '55%', borderRadius: 4 } },
      dataLabels: { enabled: false },
      xaxis: { categories: this.moisLibelles, labels: { style: { fontSize: '10px' } } },
      yaxis: { labels: { formatter: (v: any) => (typeof v === 'number' ? this.formatMontant(v) : '') } },
      grid: { borderColor: '#f3f4f6' },
      tooltip: { y: { formatter: (v: any) => (typeof v === 'number' ? this.formatMontant(v) : '') } },
    };
  }

  private _buildChartFactEmpAgence(f: FactEmploye): void {
    if (!f.par_agence.length) return;
    this.chartFactEmpAgence = {
      series: [{ name: 'Montant', data: f.par_agence.map(a => a.montant) }],
      chart: { type: 'bar', height: 260, toolbar: { show: false } },
      colors: ['#51d78e'],
      plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '55%' } },
      dataLabels: { enabled: false },
      xaxis: { categories: f.par_agence.map(a => a.agence) },
      yaxis: { labels: { formatter: (v: any) => (typeof v === 'number' ? this.formatMontant(v) : '') } },
      grid: { borderColor: '#f3f4f6' },
      tooltip: { y: { formatter: (v: any) => (typeof v === 'number' ? this.formatMontant(v) : '') } },
    };
  }

  private _buildChartFactEmpCategorie(f: FactEmploye): void {
    if (!f.par_categorie.length) return;
    this.chartFactEmpCategorie = {
      series: f.par_categorie.map(c => c.montant),
      chart: { type: 'donut', height: 260 },
      labels: f.par_categorie.map(c => c.categorie),
      colors: ['#51d78e', '#092440', '#ffc107', '#17a2b8', '#6f42c1', '#ff4d4f'],
      legend: { position: 'bottom' },
      dataLabels: { enabled: true },
      plotOptions: { pie: { donut: { size: '60%' } } },
      tooltip: { y: { formatter: (v: any) => (typeof v === 'number' ? this.formatMontant(v) : '') } },
    };
  }

  // ── Exports ───────────────────────────────────────────────────

  exporterExcel(): void {
    const wb = XLSX.utils.book_new();
    const kpisRows: any[][] = this._kpis ? [
      ['Indicateur', 'Valeur'],
      ['Total commandes',  this._kpis.total_commandes],
      ['En attente',       this._kpis.total_en_attente],
      ['Retirees',         this._kpis.total_retirees],
      ['Annulees',         this._kpis.total_annulees],
      ['Total menus',      this._kpis.total_menus],
      ['Taux retrait (%)', this._kpis.taux_retrait],
      ['Taux annul. (%)',  this._kpis.taux_annulation],
    ] : [['Aucune donnee']];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpisRows), 'KPIs');

    const moisRows: any[][] = [
      ['Mois', 'Total', 'En attente', 'Retirees', 'Annulees'],
      ...this.moisLibelles.map((label, i) => {
        const m = this._parMois[i + 1] || { total: 0, en_attente: 0, retiree: 0, annulee: 0 };
        return [label, m.total, m.en_attente, m.retiree, m.annulee];
      }),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(moisRows), 'Par mois');

    if (this._factFournisseur) {
      const f = this._factFournisseur;
      const fpRows: any[][] = [
        ['Total prestataire', this.formatMontant(f.total_montant)],
        [],
        ['Mois', 'Montant'],
        ...this.moisLibelles.map((l, i) => [l, this.formatMontant(f.par_mois[i + 1] || 0)]),
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
        ['Total employe', this.formatMontant(f.total_montant)],
        [],
        ['Mois', 'Montant'],
        ...this.moisLibelles.map((l, i) => [l, this.formatMontant(f.par_mois[i + 1] || 0)]),
        [],
        ['Categorie', 'Montant', 'Nb commandes'],
        ...f.par_categorie.map(c => [c.categorie, this.formatMontant(c.montant), c.nb_commandes]),
        [],
        ['Agence', 'Montant', 'Nb commandes'],
        ...f.par_agence.map(a => [a.agence, this.formatMontant(a.montant), a.nb_commandes]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(feRows), 'Fact. Employe');
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
    doc.setFontSize(14); doc.setTextColor(9, 36, 64);
    doc.text('Dashboard Cantine', 14, 15);
    doc.setFontSize(9); doc.setTextColor(100);
    doc.text('Filtres : ' + this.getFiltresActifs() + '  -  Edite le ' + today, 14, 22);

    if (this._kpis) {
      autoTable(doc, {
        startY: 28,
        head: [['Indicateur', 'Valeur']],
        body: [
          ['Total commandes', this._kpis.total_commandes],
          ['En attente',      this._kpis.total_en_attente],
          ['Retirees',        this._kpis.total_retirees],
          ['Annulees',        this._kpis.total_annulees],
          ['Taux retrait',    this._kpis.taux_retrait + '%'],
        ],
        headStyles: { fillColor: [9, 36, 64] }, styles: { fontSize: 9 },
      });
    }

    if (this._factFournisseur) {
      autoTable(doc, {
        startY: ((doc as any).lastAutoTable?.finalY ?? 70) + 10,
        head: [['Prestataire', 'Montant', 'Nb commandes']],
        body: this._factFournisseur.par_prestataire.map(p =>
          [p.prestataire, this.formatMontant(p.montant), p.nb_commandes]
        ),
        headStyles: { fillColor: [9, 36, 64] }, styles: { fontSize: 9 },
      });
    }

    if (this._factEmploye) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [['Categorie', 'Montant', 'Nb commandes']],
        body: this._factEmploye.par_categorie.map(c =>
          [c.categorie, this.formatMontant(c.montant), c.nb_commandes]
        ),
        headStyles: { fillColor: [81, 215, 142], textColor: 0 }, styles: { fontSize: 9 },
      });
    }

    doc.save('dashboard_cantine.pdf');
  }
}
