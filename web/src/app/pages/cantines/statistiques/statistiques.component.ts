// src/app/pages/cantines/statistiques/statistiques.component.ts
//
// Page « Cantine › Statistiques » (maquettes stats-2 et stats-3) : périodes en
// un clic, 5 chiffres clés comparés à la période précédente, puis 4 sections
// (Commandes · Repas & catégories · Plats & avis · Fréquentation). Chaque bloc
// s'exporte (Excel, image PNG, CSV) ; « Exporter le rapport » produit un PDF
// complet (graphiques en images + tableaux) ou un classeur Excel (une feuille
// par bloc). Données : GET /api/api/statistiques/ (api/statistiques.py).
// Styles : assets/scss/pages/_statistiques.scss (app-statistiques).

import { Component, DestroyRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { ChartComponent } from 'ng-apexcharts';
import { BsModalService } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';

import { filtrerAgencesGerees } from 'src/app/core/helpers/roles';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';
import { selectAllTypeequipeWithoutPagination } from 'src/app/store/Typeequipe/typeequipe-selector';
import { fetchtypeequipeNoPaginateData } from 'src/app/store/Typeequipe/typeequipe.action';
import {
  Compteurs, FiltresStats, LigneCategorie, LigneRepas, MOIS_COURTS, MOIS_LONGS, Statistiques,
  StatistiquesService, Variation, dateDe, isoLocal, jourMoisCourt, libelleComparaison, libellePeriode,
  nombreFr, noteFr, pourcentFr, variation,
} from 'src/app/core/services/statistiques/statistiques.service';
import {
  Cellule, DocPdf, Feuille, enregistrerPdf, exporterCsv, exporterExcel, imagePdf, nomFichier,
  nouveauPdf, placePdf, tableauPdf, telechargerImage, titrePdf,
} from 'src/app/core/helpers/exports';
import { DetailServiceComponent } from 'src/app/shared/detail-service/detail-service.component';

type Periode = 'mois' | 'mois_dernier' | 'trois_mois' | 'annee' | 'perso';
type Section = 'commandes' | 'repas' | 'plats' | 'frequentation';
export type Bloc = 'mois' | 'agence' | 'evolution' | 'detail_mensuel' | 'repas' | 'categorie' | 'top'
  | 'type' | 'classement' | 'non_retires' | 'annulations' | 'jours';

const C = { navy: '#0F3A6E', vert: '#3EC970', orange: '#F7B84B', gris: '#9AA9BE', rouge: '#F06548', bleu: '#2F80ED' };
const POLICE = 'inherit';

interface Kpi {
  id: string; libelle: string; icone: string; pastille: string; valeur: string; unite?: string;
  variation: Variation | null; neutre?: string; note: string; ancre: Section;
}

@Component({
  selector: 'app-statistiques',
  templateUrl: './statistiques.component.html',
})
export class StatistiquesComponent implements OnInit {
  private service = inject(StatistiquesService);
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private modal = inject(BsModalService);
  private toastr = inject(ToastrService);
  private destroyRef = inject(DestroyRef);
  private userConnecte = inject(TokenStorageService).getUser();

  // ── Filtres ───────────────────────────────────────────────────
  periode: Periode = 'mois';
  readonly periodes: { id: Periode; libelle: string }[] = [
    { id: 'mois', libelle: 'Ce mois' },
    { id: 'mois_dernier', libelle: 'Mois dernier' },
    { id: 'trois_mois', libelle: '3 mois' },
    { id: 'annee', libelle: 'Cette année' },
    { id: 'perso', libelle: 'Personnalisée' },
  ];
  debutPerso = '';
  finPerso = '';
  agence: number | null = null;
  typeequipe: number | null = null;
  agences: any[] = [];
  typeequipes: any[] = [];

  // ── Données ───────────────────────────────────────────────────
  d: Statistiques | null = null;
  chargement = false;
  erreur: string | null = null;
  exportRapport: 'pdf' | 'excel' | null = null;
  section: Section = 'commandes';
  readonly sections: { id: Section; libelle: string; icone: string; nouveau?: boolean }[] = [
    { id: 'commandes', libelle: 'Commandes', icone: 'ri-shopping-bag-3-line' },
    { id: 'repas', libelle: 'Repas & catégories', icone: 'ri-restaurant-2-line', nouveau: true },
    { id: 'plats', libelle: 'Plats & avis', icone: 'ri-star-smile-line' },
    { id: 'frequentation', libelle: 'Fréquentation', icone: 'ri-group-line', nouveau: true },
  ];
  kpis: Kpi[] = [];

  // ── Graphiques ────────────────────────────────────────────────
  gMois: any = null;
  gAgence: any = null;
  gEvolution: any = null;
  gTop: any = null;
  gType: any = null;
  gNonRetires: any = null;
  gAnnul: any = null;
  gJours: any = null;
  @ViewChild('chMois') chMois?: ChartComponent;
  @ViewChild('chAgence') chAgence?: ChartComponent;
  @ViewChild('chEvolution') chEvolution?: ChartComponent;
  @ViewChild('chTop') chTop?: ChartComponent;
  @ViewChild('chType') chType?: ChartComponent;
  @ViewChild('chNonRetires') chNonRetires?: ChartComponent;
  @ViewChild('chAnnul') chAnnul?: ChartComponent;
  @ViewChild('chJours') chJours?: ChartComponent;

  readonly nombreFr = nombreFr;
  readonly pourcentFr = pourcentFr;
  readonly noteFr = noteFr;
  private ancreDemandee: string | null = null;

  ngOnInit(): void {
    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.select(selectAllAgenceWithoutPagination).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(a => this.agences = filtrerAgencesGerees(a ?? [], this.userConnecte));
    this.store.dispatch(fetchtypeequipeNoPaginateData());
    this.store.select(selectAllTypeequipeWithoutPagination).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(t => this.typeequipes = t ?? []);

    const { debut, fin } = this.bornes('mois');
    this.debutPerso = debut;
    this.finPerso = fin;
    this.route.fragment.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(f => {
      this.ancreDemandee = f;
      if (f && this.d) setTimeout(() => this.allerA(f as Section));
    });
    this.charger();
  }

  // ══════════════════════════════════════════════════════════════
  // PÉRIODE ET CHARGEMENT
  // ══════════════════════════════════════════════════════════════

  private bornes(p: Periode): { debut: string; fin: string } {
    const n = new Date();
    const a = n.getFullYear(), m = n.getMonth();
    switch (p) {
      case 'mois_dernier': return { debut: isoLocal(new Date(a, m - 1, 1)), fin: isoLocal(new Date(a, m, 0)) };
      case 'trois_mois':   return { debut: isoLocal(new Date(a, m - 2, 1)), fin: isoLocal(new Date(a, m + 1, 0)) };
      case 'annee':        return { debut: `${a}-01-01`, fin: `${a}-12-31` };
      case 'perso':        return { debut: this.debutPerso, fin: this.finPerso };
      default:             return { debut: isoLocal(new Date(a, m, 1)), fin: isoLocal(new Date(a, m + 1, 0)) };
    }
  }

  get filtres(): FiltresStats {
    return { ...this.bornes(this.periode), agence: this.agence, typeequipe: this.typeequipe };
  }

  choisirPeriode(p: Periode): void {
    this.periode = p;
    if (p !== 'perso') this.charger();
  }

  appliquerPerso(): void {
    if (!this.debutPerso || !this.finPerso) return;
    if (this.debutPerso > this.finPerso) { this.toastr.warning('La date de début doit précéder la date de fin.'); return; }
    this.charger();
  }

  charger(): void {
    this.chargement = true;
    this.erreur = null;
    this.service.statistiques(this.filtres).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: d => {
        this.d = d;
        this.chargement = false;
        this.construire(d);
        if (this.ancreDemandee) {
          const a = this.ancreDemandee as Section;
          this.ancreDemandee = null;
          setTimeout(() => this.allerA(a), 300);
        }
      },
      error: e => {
        this.chargement = false;
        this.erreur = typeof e === 'string' ? e : (e?.error?.detail || 'Chargement impossible');
      },
    });
  }

  // ── Libellés ──────────────────────────────────────────────────
  get libellePeriodeCourte(): string {
    if (!this.d) return '';
    const p = this.d.periode;
    let t = libellePeriode(p.debut, p.fin);
    if (p.en_cours && p.debut <= p.aujourdhui && p.aujourdhui <= p.fin) t += ` (au ${jourMoisCourt(p.aujourdhui)})`;
    return t;
  }

  get libelleAgences(): string {
    if (this.agence) return this.agences.find(a => a.id === this.agence)?.nom_agence ?? '';
    return this.d?.agences?.length ? this.d.agences.join(', ') : 'Toutes les agences';
  }

  get sousTitre(): string {
    if (!this.d) return 'Chargement…';
    const ag = this.agence || !this.d.agences?.length ? this.libelleAgences : `Vos agences : ${this.libelleAgences}`;
    const comp = libelleComparaison(this.d.periode.precedente).replace(/^vs /, 'comparé à ');
    return `${ag} · ${this.libellePeriodeCourte}, ${comp}`;
  }

  get noteFiltres(): string {
    return `${this.majuscule(this.libellePeriodeCourte)}, ${this.comparaison.replace(/^vs /, 'comparé à ')}`;
  }

  get comparaison(): string { return this.d ? libelleComparaison(this.d.periode.precedente) : ''; }
  get periodeTitre(): string { return this.d ? this.majuscule(libellePeriode(this.d.periode.debut, this.d.periode.fin)) : ''; }

  private majuscule(s: string): string { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  libelleMois(a: number, m: number, court = true): string {
    return court ? MOIS_COURTS[m - 1] : this.majuscule(MOIS_LONGS[m - 1]) + ' ' + a;
  }

  // ══════════════════════════════════════════════════════════════
  // CHIFFRES CLÉS ET GRAPHIQUES
  // ══════════════════════════════════════════════════════════════

  private construire(d: Statistiques): void {
    const k = d.kpis, p = d.precedent, cmp = this.comparaison;
    this.kpis = [
      { id: 'commandes', libelle: 'Commandes', icone: 'ri-shopping-basket-2-line', pastille: 'st-p-bl', ancre: 'commandes',
        valeur: nombreFr(k.commandes), variation: variation(k.commandes, p.commandes, 1), note: cmp },
      { id: 'taux', libelle: 'Taux de retrait', icone: 'ri-checkbox-circle-line', pastille: 'st-p-ve', ancre: 'commandes',
        valeur: pourcentFr(k.taux_retrait),
        variation: d.periode.en_cours ? null : variation(k.taux_retrait, p.taux_retrait, 1, 'diff'),
        neutre: d.periode.en_cours ? 'en cours' : undefined,
        note: d.periode.en_cours ? `${nombreFr(k.a_servir)} repas encore à servir` : cmp },
      { id: 'non_retires', libelle: 'Repas non retirés', icone: 'ri-forbid-line', pastille: 'st-p-or', ancre: 'frequentation',
        valeur: nombreFr(k.non_retires), variation: variation(k.non_retires, p.non_retires, -1), note: cmp },
      { id: 'annulations', libelle: 'Annulations', icone: 'ri-close-circle-line', pastille: 'st-p-ro', ancre: 'frequentation',
        valeur: nombreFr(k.annulees), variation: variation(k.annulees, p.annulees, -1), note: cmp },
      { id: 'note', libelle: 'Note moyenne', icone: 'ri-star-line', pastille: 'st-p-ja', ancre: 'plats',
        valeur: noteFr(k.note_moyenne), unite: k.note_moyenne !== null ? '★ / 5' : '',
        variation: variation(k.note_moyenne, p.note_moyenne, 1, 'diff'),
        note: `${nombreFr(k.nb_avis)} avis` },
    ];

    const base = (type: string, hauteur: number, extra: any = {}) => ({
      type, height: hauteur, fontFamily: POLICE, toolbar: { show: false }, animations: { enabled: false },
      zoom: { enabled: false }, ...extra,
    });
    const entier = (v: any) => (typeof v === 'number' ? nombreFr(Math.round(v)) : v);

    // Commandes par mois (empilé par statut, total des commandes au-dessus)
    const mois = d.par_mois;
    this.gMois = mois.some(m => m.commandes || m.annulees) ? {
      series: [
        { name: 'Retirées', data: mois.map(m => m.servis) },
        { name: 'En attente', data: mois.map(m => m.a_servir) },
        { name: 'Non retirés', data: mois.map(m => m.non_retires) },
        { name: 'Annulées', data: mois.map(m => m.annulees ?? 0) },
      ],
      chart: base('bar', 300, { stacked: true }),
      colors: [C.vert, C.orange, C.gris, C.rouge],
      plotOptions: { bar: { columnWidth: '55%', borderRadius: 3,
        dataLabels: { total: { enabled: true, style: { fontSize: '11px', fontWeight: 700, color: '#092440' },
                               formatter: (_v: any, o: any) => nombreFr(mois[o?.dataPointIndex]?.commandes ?? _v) } } } },
      dataLabels: { enabled: false },
      xaxis: { categories: mois.map(m => this.libelleMois(m.annee, m.mois)) },
      yaxis: { labels: { formatter: entier } },
      legend: { position: 'bottom', fontSize: '12px' },
      grid: { borderColor: '#EEF2F7' },
      tooltip: { shared: true, intersect: false, y: { formatter: entier } },
    } : null;

    // Par agence (barres horizontales empilées)
    const ag = d.par_agence;
    this.gAgence = ag.length ? {
      series: [
        { name: 'Retirées', data: ag.map(a => a.servis) },
        { name: 'En attente', data: ag.map(a => a.a_servir) },
        { name: 'Non retirés', data: ag.map(a => a.non_retires) },
        { name: 'Annulées', data: ag.map(a => a.annulees ?? 0) },
      ],
      chart: base('bar', Math.max(150, 60 + ag.length * 44), { stacked: true }),
      colors: [C.vert, C.orange, C.gris, C.rouge],
      plotOptions: { bar: { horizontal: true, barHeight: '55%', borderRadius: 3 } },
      dataLabels: { enabled: false },
      xaxis: { categories: ag.map(a => a.agence), labels: { formatter: entier } },
      legend: { position: 'bottom', fontSize: '11px' },
      grid: { borderColor: '#EEF2F7' },
      tooltip: { shared: true, intersect: false, y: { formatter: entier } },
    } : null;

    // Évolution par date de menu (jours à venir grisés)
    const evo = d.evolution;
    const libs = evo.map(e => jourMoisCourt(e.date));
    const futurs = evo.filter(e => e.futur);
    this.gEvolution = evo.length ? {
      series: [
        { name: 'Commandes', data: evo.map(e => e.commandes) },
        { name: 'Retirées', data: evo.map(e => e.servis) },
      ],
      chart: base('line', 300),
      colors: ['#092440', C.vert],
      stroke: { curve: 'straight', width: [2.5, 2] },
      markers: { size: evo.length > 40 ? 0 : 3, strokeWidth: 1 },
      dataLabels: { enabled: false },
      xaxis: { categories: libs, tickAmount: Math.min(evo.length, 16), labels: { rotate: 0, hideOverlappingLabels: true, style: { fontSize: '10px' } } },
      yaxis: { min: 0, labels: { formatter: entier } },
      legend: { position: 'bottom', fontSize: '12px' },
      grid: { borderColor: '#EEF2F7' },
      tooltip: { shared: true, intersect: false, y: { formatter: entier } },
      annotations: futurs.length ? { xaxis: [{
        x: jourMoisCourt(futurs[0].date), x2: jourMoisCourt(futurs[futurs.length - 1].date),
        fillColor: '#F7B84B', opacity: 0.12, borderColor: 'transparent',
        label: { text: 'à venir', orientation: 'horizontal', borderColor: 'transparent',
                 style: { background: 'transparent', color: '#c98a16', fontSize: '10px' } },
      }] } : {},
    } : null;

    // Top plats
    const top = d.par_repas.slice(0, 7);
    this.gTop = top.length ? {
      series: [{ name: 'Commandes', data: top.map(p => p.commandes) }],
      chart: base('bar', Math.max(180, 50 + top.length * 34)),
      colors: [C.navy],
      plotOptions: { bar: { horizontal: true, barHeight: '60%', borderRadius: 3, dataLabels: { position: 'top' } } },
      dataLabels: { enabled: true, offsetX: 22, style: { colors: ['#092440'], fontSize: '11px' }, formatter: entier },
      xaxis: { categories: top.map(p => p.plat), labels: { formatter: entier } },
      grid: { borderColor: '#EEF2F7' },
      tooltip: { y: { formatter: entier } },
    } : null;

    // Par type de plat (anneau)
    const types = d.par_type_plat;
    const totalTypes = types.reduce((s, t) => s + t.commandes, 0);
    this.gType = types.length ? {
      series: types.map(t => t.commandes),
      labels: types.map(t => t.type_plat),
      chart: base('donut', 260),
      colors: [C.navy, C.vert, C.orange, C.gris, C.bleu, C.rouge, '#7B61FF'],
      legend: { position: 'right', fontSize: '12px', formatter: (n: string, o: any) =>
        `${n}  ${pourcentFr(totalTypes ? o.w.globals.series[o.seriesIndex] / totalTypes * 100 : 0)}` },
      dataLabels: { enabled: false },
      plotOptions: { pie: { donut: { size: '68%', labels: { show: true,
        value: { fontSize: '20px', fontWeight: 700, formatter: entier },
        total: { show: true, label: 'hors annulations', fontSize: '11px', formatter: () => nombreFr(totalTypes) } } } } },
      responsive: [{ breakpoint: 576, options: { legend: { position: 'bottom' } } }],
      tooltip: { y: { formatter: entier } },
    } : null;

    // Fréquentation
    const sem = d.non_retires_semaine;
    this.gNonRetires = {
      series: [{ name: 'Non retirés', data: sem.map(s => s.non_retires) }],
      chart: base('bar', 230),
      colors: [C.orange],
      plotOptions: { bar: { columnWidth: '60%', borderRadius: 3, dataLabels: { position: 'top' } } },
      dataLabels: { enabled: true, offsetY: -16, style: { colors: ['#092440'], fontSize: '10px' }, formatter: entier },
      xaxis: { categories: sem.map(s => jourMoisCourt(s.semaine)), labels: { style: { fontSize: '10px' } } },
      yaxis: { labels: { formatter: entier } },
      grid: { borderColor: '#EEF2F7' },
      tooltip: { x: { formatter: (v: any) => `Semaine du ${v}` }, y: { formatter: entier } },
    };
    const an = d.annulations;
    this.gAnnul = {
      series: [
        { name: "Par l'agent", data: an.map(a => a.par_agent) },
        { name: 'Par le gestionnaire', data: an.map(a => a.par_gestionnaire) },
      ],
      chart: base('bar', 230, { stacked: true }),
      colors: [C.navy, C.rouge],
      plotOptions: { bar: { columnWidth: '55%', borderRadius: 3,
        dataLabels: { total: { enabled: true, style: { fontSize: '10px', fontWeight: 700, color: '#092440' } } } } },
      dataLabels: { enabled: false },
      xaxis: { categories: an.map(a => this.libelleMois(a.annee, a.mois)), labels: { style: { fontSize: '10px' } } },
      yaxis: { labels: { formatter: entier } },
      legend: { position: 'bottom', fontSize: '11px' },
      grid: { borderColor: '#EEF2F7' },
      tooltip: { shared: true, intersect: false, y: { formatter: entier } },
    };
    const jours = d.jours;
    this.gJours = {
      series: [{ name: 'Commandes / jour', data: jours.map(j => j.moyenne) }],
      chart: base('bar', 230),
      colors: [C.vert],
      plotOptions: { bar: { columnWidth: '55%', borderRadius: 3, dataLabels: { position: 'top' } } },
      dataLabels: { enabled: true, offsetY: -16, style: { colors: ['#092440'], fontSize: '10px' },
                    formatter: (v: number) => nombreFr(v, v % 1 ? 1 : 0) },
      xaxis: { categories: jours.map(j => j.libelle.slice(0, 3) + '.'), labels: { style: { fontSize: '10px' } } },
      yaxis: { labels: { formatter: entier } },
      grid: { borderColor: '#EEF2F7' },
      tooltip: { y: { formatter: (v: number) => nombreFr(v, 1) + ' commandes en moyenne' } },
    };
  }

  // ── Aides du gabarit ──────────────────────────────────────────
  /** Largeurs (%) de la mini-barre : servis / non retirés / à servir */
  barre(l: Compteurs): { s: number; n: number; a: number } {
    const t = l.commandes || 1;
    return { s: l.servis / t * 100, n: l.non_retires / t * 100, a: l.a_servir / t * 100 };
  }

  /** Plats : les 7 premiers, puis « Autres plats (n) » */
  get repasAffiches(): { lignes: LigneRepas[]; autres: (Compteurs & { nb: number }) | null } {
    const r = this.d?.par_repas ?? [];
    if (r.length <= 8) return { lignes: r, autres: null };
    const reste = r.slice(7);
    const somme = (k: 'commandes' | 'servis' | 'non_retires' | 'a_servir') => reste.reduce((s, x) => s + x[k], 0);
    return { lignes: r.slice(0, 7), autres: { nb: reste.length, commandes: somme('commandes'), servis: somme('servis'),
             non_retires: somme('non_retires'), a_servir: somme('a_servir'), taux_retrait: null } };
  }

  get totalCategories(): Compteurs {
    const c = this.d?.par_categorie ?? [];
    const s = (k: 'commandes' | 'servis' | 'non_retires' | 'a_servir') => c.reduce((t, x) => t + x[k], 0);
    return { commandes: s('commandes'), servis: s('servis'), non_retires: s('non_retires'), a_servir: s('a_servir'), taux_retrait: null };
  }

  get tauxParCategorie(): string {
    return (this.d?.par_categorie ?? []).filter(c => c.categorie && c.taux_retrait !== null)
      .map(c => `${c.categorie} ${pourcentFr(c.taux_retrait)}`).join(' · ');
  }

  get totalMois(): Compteurs & { annulees: number; note: number | null } {
    const m = this.d?.par_mois ?? [];
    const s = (k: 'commandes' | 'servis' | 'non_retires' | 'a_servir' | 'annulees') => m.reduce((t, x) => t + (x[k] ?? 0), 0);
    const avis = m.reduce((t, x) => t + (x.nb_avis ?? 0), 0);
    const note = avis ? m.reduce((t, x) => t + (x.note ?? 0) * (x.nb_avis ?? 0), 0) / avis : null;
    const servis = s('servis'), non = s('non_retires');
    return { commandes: s('commandes'), servis, non_retires: non, a_servir: s('a_servir'), annulees: s('annulees'),
             taux_retrait: servis + non ? servis / (servis + non) * 100 : null, note };
  }

  get moisDecroissants() { return [...(this.d?.par_mois ?? [])].reverse(); }

  get perteTexte(): string {
    const p = this.d?.perte_non_retires;
    if (!p || !p.repas) return 'Aucun repas perdu sur la période';
    return `${nombreFr(p.montant)} F`;
  }

  get comparaisonJours(): string {
    const j = (this.d?.jours ?? []).filter(x => x.nb_jours);
    if (j.length < 2) return '';
    const max = j.reduce((a, b) => (b.moyenne > a.moyenne ? b : a));
    const min = j.reduce((a, b) => (b.moyenne < a.moyenne ? b : a));
    if (!max.moyenne || max === min) return '';
    const v = Math.round((min.moyenne - max.moyenne) / max.moyenne * 100);
    return `Le ${min.libelle.toLowerCase()} : ${v < 0 ? '−' : '+'}${Math.abs(v)} % par rapport au ${max.libelle.toLowerCase()}`;
  }

  etoiles(n: number | null): number[] {
    const r = Math.round(n ?? 0);
    return [1, 2, 3, 4, 5].map(i => (i <= r ? 1 : 0));
  }

  // ── Navigation entre sections ─────────────────────────────────
  allerA(s: Section): void {
    this.section = s;
    document.getElementById('st-' + s)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  @HostListener('window:scroll')
  suivreDefilement(): void {
    let courante: Section = 'commandes';
    for (const s of this.sections) {
      const el = document.getElementById('st-' + s.id);
      if (el && el.getBoundingClientRect().top < 160) courante = s.id;
    }
    this.section = courante;
  }

  // ══════════════════════════════════════════════════════════════
  // DÉTAIL NOMINATIF
  // ══════════════════════════════════════════════════════════════

  ouvrirDetail(mode: 'repas' | 'categorie', ligne?: LigneRepas | LigneCategorie | null): void {
    if (!this.d) return;
    const f = this.filtres;
    this.modal.show(DetailServiceComponent, {
      class: 'modal-xl modal-dialog-centered st-modal',
      initialState: {
        debut: this.d.periode.debut, fin: this.d.periode.fin, agence: this.agence, typeequipe: this.typeequipe,
        mode,
        plat: mode === 'repas' && ligne ? (ligne as LigneRepas).plat_id : null,
        categorie: mode === 'categorie' && ligne ? ((ligne as LigneCategorie).categorie_id ?? 'aucune') : null,
        plats: this.d.par_repas.map(p => ({ id: p.plat_id, nom: p.plat })),
        categories: this.d.par_categorie.map(c => ({ id: c.categorie_id, libelle: c.categorie })),
        agences: this.agence ? this.agences.filter(a => a.id === this.agence) : this.agences.filter(a =>
          !this.d?.agences?.length || this.d.agences.includes(a.nom_agence)),
        contexte: f.typeequipe ? (this.typeequipes.find(t => t.id === f.typeequipe)?.libelle ?? '') : '',
      } as Partial<DetailServiceComponent>,
    });
  }

  // ══════════════════════════════════════════════════════════════
  // EXPORTS
  // ══════════════════════════════════════════════════════════════

  private n(v: number | null | undefined, dec = 0): number | string {
    return v === null || v === undefined ? '' : Math.round(v * 10 ** dec) / 10 ** dec;
  }

  /** Tableau d'un bloc : titre, en-tête, lignes (valeurs brutes, nombres en nombres) */
  tableBloc(b: Bloc): { titre: string; entete: string[]; lignes: Cellule[][]; total?: boolean; droite?: number[] } {
    const d = this.d!;
    switch (b) {
      case 'mois':
      case 'detail_mensuel': {
        const t = this.totalMois;
        return {
          titre: b === 'mois' ? 'Commandes par mois' : 'Détail mensuel',
          entete: ['Mois', 'Commandes', 'Retirées', 'En attente', 'Non retirés', 'Annulées', 'Taux de retrait (%)', 'Note moyenne'],
          lignes: [...d.par_mois.map(m => [this.libelleMois(m.annee, m.mois, false), m.commandes, m.servis, m.a_servir,
                    m.non_retires, m.annulees ?? 0, this.n(m.taux_retrait, 1), this.n(m.note, 1)]),
                   [`Total ${d.par_mois.length} mois`, t.commandes, t.servis, t.a_servir, t.non_retires, t.annulees,
                    this.n(t.taux_retrait, 1), this.n(t.note, 1)]],
          total: true, droite: [1, 2, 3, 4, 5, 6, 7],
        };
      }
      case 'agence':
        return {
          titre: 'Par agence', entete: ['Agence', 'Commandes', 'Retirées', 'En attente', 'Non retirés', 'Annulées', 'Taux de retrait (%)', 'Note'],
          lignes: d.par_agence.map(a => [a.agence, a.commandes, a.servis, a.a_servir, a.non_retires, a.annulees ?? 0,
                                          this.n(a.taux_retrait, 1), this.n(a.note, 1)]),
          droite: [1, 2, 3, 4, 5, 6, 7],
        };
      case 'evolution':
        return {
          titre: 'Évolution par date de menu', entete: ['Date du menu', 'Commandes', 'Retirées', 'À venir'],
          lignes: d.evolution.map(e => [dateDe(e.date).toLocaleDateString('fr-FR'), e.commandes, e.servis, e.futur ? 'oui' : '']),
          droite: [1, 2],
        };
      case 'repas': {
        const t = d.total_repas;
        return {
          titre: 'Par repas (plat)', entete: ['Plat', 'Agences', 'Commandés', 'Servis', 'Non retirés', 'À servir', 'Taux de retrait (%)'],
          lignes: [...d.par_repas.map(r => [r.plat, r.agences.join(', '), r.commandes, r.servis, r.non_retires, r.a_servir, this.n(r.taux_retrait, 1)]),
                   ['Total', '', t.commandes, t.servis, t.non_retires, t.a_servir, this.n(t.taux_retrait, 1)]],
          total: true, droite: [2, 3, 4, 5, 6],
        };
      }
      case 'categorie': {
        const t = this.totalCategories;
        return {
          titre: 'Par catégorie de salarié', entete: ['Catégorie', 'Commandés', 'Servis', 'Non retirés', 'À servir', 'Taux de retrait (%)'],
          lignes: [...d.par_categorie.map(c => [c.categorie ?? 'Sans catégorie', c.commandes, c.servis, c.non_retires, c.a_servir, this.n(c.taux_retrait, 1)]),
                   ['Total', t.commandes, t.servis, t.non_retires, t.a_servir, '']],
          total: true, droite: [1, 2, 3, 4, 5],
        };
      }
      case 'top':
        return { titre: 'Top plats', entete: ['Plat', 'Commandes'], lignes: d.par_repas.slice(0, 10).map(p => [p.plat, p.commandes]), droite: [1] };
      case 'type': {
        const tot = d.par_type_plat.reduce((s, t) => s + t.commandes, 0) || 1;
        return {
          titre: 'Par type de plat', entete: ['Type de plat', 'Commandes', 'Part (%)'],
          lignes: d.par_type_plat.map(t => [t.type_plat, t.commandes, this.n(t.commandes / tot * 100, 1)]), droite: [1, 2],
        };
      }
      case 'classement':
        return {
          titre: 'Classement des plats', entete: ['#', 'Plat', 'Note moyenne', "Nb d'avis", 'Commandes', "Taux d'avis (%)"],
          lignes: d.classement_plats.map((c, i) => [i + 1, c.plat, this.n(c.note, 1), c.nb_avis, c.commandes, this.n(c.taux_avis, 1)]),
          droite: [2, 3, 4, 5],
        };
      case 'non_retires':
        return {
          titre: 'Repas non retirés par semaine', entete: ['Semaine du', 'Non retirés'],
          lignes: d.non_retires_semaine.map(s => [dateDe(s.semaine).toLocaleDateString('fr-FR') + (s.en_cours ? ' (en cours)' : ''), s.non_retires]),
          droite: [1],
        };
      case 'annulations':
        return {
          titre: 'Annulations', entete: ['Mois', "Par l'agent", 'Par le gestionnaire', 'Total'],
          lignes: d.annulations.map(a => [this.libelleMois(a.annee, a.mois, false), a.par_agent, a.par_gestionnaire, a.par_agent + a.par_gestionnaire]),
          droite: [1, 2, 3],
        };
      case 'jours':
        return {
          titre: 'Jours les plus fréquentés', entete: ['Jour', 'Commandes en moyenne', 'Jours de menu'],
          lignes: d.jours.map(j => [j.libelle, this.n(j.moyenne, 1), j.nb_jours]), droite: [1, 2],
        };
    }
  }

  private graphique(b: Bloc): ChartComponent | undefined {
    return ({ mois: this.chMois, agence: this.chAgence, evolution: this.chEvolution, top: this.chTop, type: this.chType,
              non_retires: this.chNonRetires, annulations: this.chAnnul, jours: this.chJours } as Record<string, ChartComponent | undefined>)[b];
  }

  private async image(b: Bloc): Promise<string | null> {
    const g = this.graphique(b);
    if (!g) return null;
    try {
      const r: any = await g.dataURI({ scale: 2 });
      if (r?.imgURI) return r.imgURI;
      if (r?.blob) {
        return await new Promise<string>(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(r.blob); });
      }
    } catch { /* graphique non rendu */ }
    return null;
  }

  private get suffixeFichier(): string {
    const p = this.d!.periode;
    return `${p.debut}_${p.fin}`;
  }

  get filtresTexte(): string {
    const eq = this.typeequipe ? (this.typeequipes.find(t => t.id === this.typeequipe)?.libelle ?? '') : 'toutes les équipes';
    return `Période : ${this.libellePeriodeCourte} · ${this.libelleAgences} · ${eq}`;
  }

  async exportBloc(b: Bloc, format: 'excel' | 'csv' | 'png'): Promise<void> {
    if (!this.d) return;
    const t = this.tableBloc(b);
    const fichier = nomFichier('statistiques', t.titre, this.suffixeFichier);
    if (format === 'excel') {
      exporterExcel(fichier, [{ nom: t.titre, lignes: [[t.titre], [this.filtresTexte], [], t.entete, ...t.lignes] }]);
    } else if (format === 'csv') {
      exporterCsv(fichier, [t.entete, ...t.lignes]);
    } else {
      const uri = await this.image(b);
      if (uri) telechargerImage(uri, fichier);
      else this.toastr.warning("Ce graphique n'a pas de données à exporter.");
    }
  }

  private readonly ordre: { section: string; blocs: Bloc[] }[] = [
    { section: 'Commandes', blocs: ['mois', 'agence', 'evolution', 'detail_mensuel'] },
    { section: 'Repas & catégories', blocs: ['repas', 'categorie'] },
    { section: 'Plats & avis', blocs: ['top', 'type', 'classement'] },
    { section: 'Fréquentation', blocs: ['non_retires', 'annulations', 'jours'] },
  ];

  private lignesKpis(): Cellule[][] {
    const k = this.d!.kpis, p = this.d!.precedent;
    return [
      ['Commandes', k.commandes, p.commandes],
      ['Repas retirés', k.servis, p.servis],
      ['Repas à servir', k.a_servir, p.a_servir],
      ['Taux de retrait (%)', this.n(k.taux_retrait, 1), this.n(p.taux_retrait, 1)],
      ['Repas non retirés', k.non_retires, p.non_retires],
      ['Annulations', k.annulees, p.annulees],
      ['Note moyenne (/5)', this.n(k.note_moyenne, 1), this.n(p.note_moyenne, 1)],
      ["Nombre d'avis", k.nb_avis, p.nb_avis],
    ];
  }

  exporterClasseur(): void {
    if (!this.d) return;
    this.exportRapport = 'excel';
    const prec = this.d.periode.precedente!;
    const feuilles: Feuille[] = [{
      nom: 'Chiffres clés',
      lignes: [['Statistiques cantine'], [this.filtresTexte], [],
               ['Indicateur', this.periodeTitre, `Période précédente (${dateDe(prec.debut).toLocaleDateString('fr-FR')} – ${dateDe(prec.fin).toLocaleDateString('fr-FR')})`],
               ...this.lignesKpis()],
    }];
    for (const s of this.ordre) {
      for (const b of s.blocs) {
        if (b === 'mois') continue;          // même tableau que « Détail mensuel »
        const t = this.tableBloc(b);
        feuilles.push({ nom: t.titre, lignes: [[t.titre], [this.filtresTexte], [], t.entete, ...t.lignes] });
      }
    }
    exporterExcel(nomFichier('statistiques-cantine', this.suffixeFichier), feuilles);
    this.exportRapport = null;
  }

  async exporterRapportPdf(): Promise<void> {
    if (!this.d) return;
    this.exportRapport = 'pdf';
    try {
      const pdf: DocPdf = nouveauPdf('Statistiques de la cantine',
        `${this.filtresTexte} · ${this.comparaison.replace(/^vs /, 'comparé à ')} · édité le ${new Date().toLocaleDateString('fr-FR')}`);
      titrePdf(pdf, 'Chiffres clés');
      tableauPdf(pdf, ['Indicateur', this.periodeTitre, 'Période précédente'],
                 this.lignesKpis().map(l => l.map((c, i) => (i && typeof c === 'number' ? nombreFr(c, c % 1 ? 1 : 0) : c))), false, [1, 2]);
      for (const s of this.ordre) {
        pdf.doc.addPage();
        pdf.y = 15;
        titrePdf(pdf, s.section.toUpperCase());
        for (const b of s.blocs) {
          const t = this.tableBloc(b);
          const uri = b === 'detail_mensuel' ? null : await this.image(b);
          if (b === 'mois') {           // graphique seul : le tableau suit dans « Détail mensuel »
            if (uri) { placePdf(pdf, 85); titrePdf(pdf, t.titre); await imagePdf(pdf, uri); }
            continue;
          }
          placePdf(pdf, uri ? 85 : 30);      // titre et graphique sur la même page
          titrePdf(pdf, t.titre);
          if (uri) await imagePdf(pdf, uri, b === 'type' ? 150 : undefined);
          if (t.lignes.length) {
            tableauPdf(pdf, t.entete, t.lignes.map(l => l.map(c => (typeof c === 'number' ? nombreFr(c, c % 1 ? 1 : 0) : c))),
                       !!t.total, t.droite ?? []);
          }
        }
      }
      enregistrerPdf(pdf, nomFichier('rapport-statistiques-cantine', this.suffixeFichier));
    } catch (e) {
      this.toastr.error("Le rapport PDF n'a pas pu être généré.");
    } finally {
      this.exportRapport = null;
    }
  }
}
