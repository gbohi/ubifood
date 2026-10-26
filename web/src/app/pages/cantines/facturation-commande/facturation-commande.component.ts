// src/app/pages/cantine/facturation-commande/facturation-commande.component.ts
//
// Facturation des employés : AUCUN calcul ici. Les montants viennent du
// serveur (GET /api/api/facturation/), seule source de vérité :
// repas commandés et non annulés, au tarif de la catégorie salarié en
// vigueur à la date du menu ; montants figés pour les mois clôturés.

import { filtrerAgencesGerees } from 'src/app/core/helpers/roles';
import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';

import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';
import { selectAllTypeequipeWithoutPagination } from 'src/app/store/Typeequipe/typeequipe-selector';
import { fetchtypeequipeNoPaginateData } from 'src/app/store/Typeequipe/typeequipe.action';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { ADMINS, aUnRole } from 'src/app/core/helpers/roles';

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type EtatFacture = 'cloturee' | 'provisoire' | 'partielle';

export interface LigneFacturation {
  userId:           number | null;
  username:         string;
  nomPrenom:        string;
  agenceMenu:       string;
  agenceAgent:      string;
  equipe:           string;
  service:          string;
  poste:            string;
  categoriesalarie: string;
  /** Dernier tarif appliqué (le tarif peut changer en cours de période) */
  montant:          number;
  nbCommandes:      number;
  total:            number;
  repasSansTarif:   number;
  etat:             EtatFacture;
  statuts: {
    en_attente: number;
    retiree:    number;
  };
}

/** Synthèse par catégorie de salarié (mêmes lignes que le détail : totaux identiques) */
export interface SyntheseCategorie {
  categorie: string | null;
  nb_agents: number;
  nb_repas: number;
  montant: number;
  repas_sans_tarif: number;
  tarif: number | null;
  tarif_min: number | null;
  tarif_max: number | null;
  agents_sans_categorie: { user_id: number; username: string; nom_prenom: string; agence: string; nb_repas: number }[];
}

export interface SynthesePlat { plat: string; nb_repas: number; montant: number; repas_sans_tarif: number; }

export interface ClotureMensuelle {
  id: number;
  annee: number;
  mois: number;
  cloturee_le: string;
  cloturee_par_nom: string | null;
  nb_factures: number;
  nb_repas: number;
  montant_total: string;
  nb_factures_prestataires: number;
  montant_total_prestataires: string;
}

@Component({
  selector: 'app-facturation-commande',
  templateUrl: './facturation-commande.component.html',
  styleUrl: './facturation-commande.component.scss',
})
export class FacturationCommandeComponent implements OnInit {
  // Un gestionnaire ne gère que les agences auxquelles il est rattaché
  private userConnecte = inject(TokenStorageService).getUser();

  private route = inject(ActivatedRoute);
  private router = inject(Router);

  /** Onglet affiché : agents (ce qu'ils doivent) ou prestataires (ce que nous leur devons) */
  onglet: 'agents' | 'prestataires' = 'agents';

  /** Mois affiché (navigation par flèches) ; périodeLibre = dates saisies */
  annee = new Date().getFullYear();
  mois = new Date().getMonth() + 1;
  periodeLibre = false;

  // Tableau des agents : recherche et pagination côté client
  recherche = '';
  page = 1;
  readonly parPage = 15;

  agences:     any[] = [];
  typeEquipes: any[] = [];

  isLoading   = false;
  hasSearched = false;
  error: string | null = null;

  filterForm!: UntypedFormGroup;

  regle = '';
  lignesFacturation: LigneFacturation[] = [];
  totalNbCommandes = 0;
  totalMontant     = 0;
  repasSansTarif   = 0;
  parCategorie: SyntheseCategorie[] = [];
  parPlat: SynthesePlat[] = [];

  // ── Clôtures mensuelles ─────────────────────────────────────
  clotures: ClotureMensuelle[] = [];
  estAdmin = false;
  moisACloturer = '';          // 'AAAA-MM'
  isCloturing = false;
  clotureMessage: string | null = null;
  clotureErreur: string | null = null;

  private destroyRef = inject(DestroyRef);
  private apiUrl = `${environment.apiUrl}/api/api`;

  constructor(
    private store: Store,
    private fb: UntypedFormBuilder,
    private http: HttpClient,
    private tokenStorage: TokenStorageService,
  ) {}

  ngOnInit(): void {
    const { debut, fin } = this._moisCourant();
    this.filterForm = this.fb.group({
      date_debut: [debut],
      date_fin:   [fin],
      agence:     [''],
      typeequipe: [''],
    });

    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.select(selectAllAgenceWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(a => this.agences = filtrerAgencesGerees(a ?? [], this.userConnecte));

    this.store.dispatch(fetchtypeequipeNoPaginateData());
    this.store.select(selectAllTypeequipeWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(t => this.typeEquipes = t ?? []);

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(q => {
      this.onglet = q.get('onglet') === 'prestataires' ? 'prestataires' : 'agents';
    });
    // Pas de page vide : le mois en cours est calculé dès l'arrivée
    this.rechercher();

    this.estAdmin = aUnRole(this.tokenStorage.getUser(), ADMINS);
    const precedent = new Date();
    precedent.setDate(1);
    precedent.setMonth(precedent.getMonth() - 1);
    this.moisACloturer = `${precedent.getFullYear()}-${String(precedent.getMonth() + 1).padStart(2, '0')}`;
    this.chargerClotures();
  }

  private _moisCourant(): { debut: string; fin: string } {
    const now = new Date();
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      debut: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
      fin:   iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }

  // ══════════════════════════════════════════════════════════
  // CALCUL (serveur)
  // ══════════════════════════════════════════════════════════

  rechercher(): void {
    const { date_debut, date_fin, agence, typeequipe } = this.filterForm.value;
    let params = new HttpParams();
    if (date_debut) params = params.set('date_debut', date_debut);
    if (date_fin)   params = params.set('date_fin', date_fin);
    if (agence)     params = params.set('agence', agence);
    if (typeequipe) params = params.set('typeequipe', typeequipe);

    this.hasSearched = true;
    this.page = 1;
    if (this.periode?.debut !== date_debut || this.periode?.fin !== date_fin) {
      this.periode = { debut: date_debut, fin: date_fin };
    }
    this.isLoading = true;
    this.error = null;
    this.http.get<any>(`${this.apiUrl}/facturation/`, { params })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.regle            = data.regle;
          this.totalNbCommandes = data.total_repas;
          this.totalMontant     = data.total_montant;
          this.repasSansTarif   = data.repas_sans_tarif;
          this.parCategorie     = data.par_categorie ?? [];
          this.parPlat          = data.par_plat ?? [];
          this.lignesFacturation = (data.employes ?? []).map((e: any): LigneFacturation => ({
            userId:           e.user_id,
            username:         e.username,
            nomPrenom:        e.nom_prenom,
            agenceMenu:       e.lignes?.[0]?.agence_menu || '—',
            agenceAgent:      e.agence_agent || '—',
            equipe:           e.lignes?.[0]?.equipe || '—',
            service:          e.service || '—',
            poste:            e.poste || '—',
            categoriesalarie: e.categorie || '—',
            montant:          e.tarif_unitaire ?? 0,
            nbCommandes:      e.nb_repas,
            total:            e.total,
            repasSansTarif:   e.repas_sans_tarif,
            etat:             e.etat,
            statuts:          { en_attente: e.statuts.en_attente, retiree: e.statuts.retiree },
          }));
          this.isLoading = false;
        },
        error: err => {
          this.error = typeof err === 'string' ? err : 'Erreur lors du calcul de la facturation';
          this.isLoading = false;
        },
      });
  }

  resetFilters(): void {
    const { debut, fin } = this._moisCourant();
    this.filterForm.reset({ date_debut: debut, date_fin: fin, agence: '', typeequipe: '' });
    this.annee = new Date().getFullYear();
    this.mois = new Date().getMonth() + 1;
    this.periodeLibre = false;
    this.rechercher();
  }

  // ══════════════════════════════════════════════════════════
  // ONGLETS ET NAVIGATION PAR MOIS
  // ══════════════════════════════════════════════════════════

  changerOnglet(o: 'agents' | 'prestataires'): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { onglet: o === 'agents' ? null : o },
                               queryParamsHandling: 'merge', replaceUrl: true });
  }

  changerMois(decalage: number): void {
    const d = new Date(this.annee, this.mois - 1 + decalage, 1);
    this.allerAuMois(d.getFullYear(), d.getMonth() + 1);
  }

  allerAuMois(annee: number, mois: number): void {
    this.annee = annee;
    this.mois = mois;
    this.periodeLibre = false;
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    this.filterForm.patchValue({
      date_debut: iso(new Date(annee, mois - 1, 1)),
      date_fin:   iso(new Date(annee, mois, 0)),
    });
    this.rechercher();
  }

  basculerPeriodeLibre(): void {
    this.periodeLibre = !this.periodeLibre;
    if (!this.periodeLibre) this.allerAuMois(this.annee, this.mois);
  }

  get libelleMoisCourant(): string {
    const l = this.libelleMois(this.annee, this.mois);
    return l.charAt(0).toUpperCase() + l.slice(1);
  }

  get estMoisActuel(): boolean {
    const n = new Date();
    return this.annee === n.getFullYear() && this.mois === n.getMonth() + 1;
  }

  /** Dates transmises à l'onglet prestataires (même période), mises à jour à chaque calcul */
  periode: { debut: string; fin: string } | null = null;

  /** État de la période affichée : mois clôturé (figé) ou provisoire */
  get etatPeriode(): 'cloturee' | 'provisoire' | 'partielle' {
    if (!this.periodeLibre) {
      return this.clotures.some(c => c.annee === this.annee && c.mois === this.mois) ? 'cloturee' : 'provisoire';
    }
    const etats = new Set(this.lignesFacturation.map(l => l.etat));
    if (etats.size === 1) return [...etats][0];
    return etats.size ? 'partielle' : 'provisoire';
  }

  // ══════════════════════════════════════════════════════════
  // TABLEAU DES AGENTS
  // ══════════════════════════════════════════════════════════

  get lignesFiltrees(): LigneFacturation[] {
    const q = this.recherche.trim().toLowerCase();
    if (!q) return this.lignesFacturation;
    return this.lignesFacturation.filter(l =>
      `${l.nomPrenom} ${l.username} ${l.agenceMenu} ${l.categoriesalarie}`.toLowerCase().includes(q));
  }

  get lignesPage(): LigneFacturation[] {
    const debut = (this.page - 1) * this.parPage;
    return this.lignesFiltrees.slice(debut, debut + this.parPage);
  }

  get nbPages(): number {
    return Math.max(1, Math.ceil(this.lignesFiltrees.length / this.parPage));
  }

  get pages(): number[] {
    return Array.from({ length: this.nbPages }, (_, i) => i + 1);
  }

  get moyenneParAgent(): number {
    return this.lignesFacturation.length ? this.totalMontant / this.lignesFacturation.length : 0;
  }

  initiales(nom: string): string {
    return (nom ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?';
  }

  couleur(i: number): string {
    return ['#0F3A6E', '#C77B2A', '#3EC970', '#9AA9BE', '#2F80ED', '#7B61FF'][i % 6];
  }

  // ══════════════════════════════════════════════════════════
  // FRISE DES CLÔTURES
  // ══════════════════════════════════════════════════════════

  /** Mois en cours et les 5 précédents, plus les mois clôturés plus anciens (6 au plus) */
  get frise(): { annee: number; mois: number; cloture: ClotureMensuelle | null; enCours: boolean }[] {
    const n = new Date();
    const mois: { annee: number; mois: number; cloture: ClotureMensuelle | null; enCours: boolean }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(n.getFullYear(), n.getMonth() - i, 1);
      const a = d.getFullYear(), m = d.getMonth() + 1;
      mois.push({ annee: a, mois: m, enCours: i === 0,
                  cloture: this.clotures.find(c => c.annee === a && c.mois === m) ?? null });
    }
    return mois;
  }

  get moisSuivantLibelle(): string {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth() + 1, 1).toLocaleDateString('fr-FR', { month: 'long' });
  }

  libelleEtat(etat: EtatFacture): string {
    return etat === 'cloturee' ? 'Clôturée' : etat === 'partielle' ? 'Partielle' : 'Provisoire';
  }

  // ══════════════════════════════════════════════════════════
  // CLÔTURES MENSUELLES
  // ══════════════════════════════════════════════════════════

  chargerClotures(): void {
    this.http.get<ClotureMensuelle[]>(`${this.apiUrl}/facturation/clotures/`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: c => this.clotures = c ?? [], error: () => this.clotures = [] });
  }

  libelleMois(annee: number, mois: number): string {
    return new Date(annee, mois - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  cloturer(moisAAAAMM: string = this.moisACloturer): void {
    if (!moisAAAAMM) return;
    const [annee, mois] = moisAAAAMM.split('-').map(Number);
    if (!confirm(`Clôturer définitivement la facturation de ${this.libelleMois(annee, mois)} ?\n` +
                 'Les montants de ce mois ne pourront plus être modifiés.')) {
      return;
    }
    this.isCloturing    = true;
    this.clotureMessage = null;
    this.clotureErreur  = null;
    // En cas de refus, le message inclut la liste des repas sans tarif (ErrorInterceptor)
    this.http.post<ClotureMensuelle>(`${this.apiUrl}/facturation/clotures/cloturer/`, { annee, mois })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: c => {
          this.isCloturing = false;
          this.clotureMessage =
            `${this.libelleMois(c.annee, c.mois)} clôturé : ${c.nb_factures} facture(s), ` +
            `${c.nb_repas} repas, ${this.formatMontant(Number(c.montant_total))} FCFA facturés aux agents, ` +
            `${this.formatMontant(Number(c.montant_total_prestataires))} FCFA dus aux prestataires.`;
          this.chargerClotures();
          if (this.hasSearched) this.rechercher();
        },
        error: err => {
          this.isCloturing = false;
          this.clotureErreur = typeof err === 'string' ? err : 'Clôture impossible';
        },
      });
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

  dismissAlert(): void { this.error = null; }

  get isLoadingAll(): boolean { return this.isLoading; }

  get hasAgentsSansMontant(): boolean {
    return this.repasSansTarif > 0;
  }

  // ══════════════════════════════════════════════════════════
  // SYNTHÈSES PAR CATÉGORIE DE SALARIÉ ET PAR PLAT
  // ══════════════════════════════════════════════════════════

  get sansCategorie(): SyntheseCategorie | null {
    return this.parCategorie.find(c => !c.categorie) ?? null;
  }

  /** Catégories renseignées mais sans tarif à la date du menu */
  get categoriesSansTarif(): SyntheseCategorie[] {
    return this.parCategorie.filter(c => c.categorie && c.repas_sans_tarif > 0);
  }

  get alerteSansCategorie(): string {
    const s = this.sansCategorie;
    if (!s) return '';
    const agents = s.agents_sans_categorie;
    const noms = agents.slice(0, 3).map(a => `${a.nom_prenom} (${a.agence || '—'})`).join(', ');
    const reste = agents.length > 3 ? ` et ${agents.length - 3} autre${agents.length - 3 > 1 ? 's' : ''}` : '';
    return `${noms}${reste} ${agents.length > 1 ? "n'ont" : "n'a"} pas de catégorie salarié.`;
  }

  libelleTarif(c: SyntheseCategorie): string {
    if (c.tarif !== null) return `${this.formatMontant(c.tarif)} F`;
    if (c.tarif_min !== null && c.tarif_max !== null) return `${this.formatMontant(c.tarif_min)} – ${this.formatMontant(c.tarif_max)} F`;
    return '—';
  }

  part(montant: number): number {
    return this.totalMontant ? Math.round(montant / this.totalMontant * 100) : 0;
  }

  /** Plats : les 7 premiers, puis « Autres plats (n) » */
  get platsAffiches(): { lignes: SynthesePlat[]; autres: SynthesePlat | null } {
    if (this.parPlat.length <= 8) return { lignes: this.parPlat, autres: null };
    const reste = this.parPlat.slice(7);
    return {
      lignes: this.parPlat.slice(0, 7),
      autres: { plat: `Autres plats (${reste.length})`, nb_repas: reste.reduce((s, p) => s + p.nb_repas, 0),
                montant: reste.reduce((s, p) => s + p.montant, 0), repas_sans_tarif: reste.reduce((s, p) => s + p.repas_sans_tarif, 0) },
    };
  }

  get maxMontantPlat(): number {
    return Math.max(1, ...this.parPlat.map(p => p.montant));
  }

  get repasSansTarifPlats(): number {
    return this.parPlat.reduce((s, p) => s + p.repas_sans_tarif, 0);
  }

  get periodeTexte(): string {
    const { date_debut, date_fin } = this.filterForm.value;
    return this.periodeLibre ? `du ${this.formatDate(date_debut)} au ${this.formatDate(date_fin)}` : this.libelleMoisCourant;
  }

  private lignesSynthese(type: 'categorie' | 'plat'): { titre: string; entete: string[]; lignes: (string | number)[][] } {
    if (type === 'categorie') {
      return {
        titre: 'Facturation par catégorie de salarié',
        entete: ['Catégorie', 'Agents', 'Repas', 'Tarif (FCFA)', 'Montant (FCFA)', 'Part (%)'],
        lignes: [
          ...this.parCategorie.map(c => [c.categorie ?? 'Sans catégorie', c.nb_agents, c.nb_repas,
            c.tarif ?? (c.tarif_min !== null ? `${c.tarif_min} – ${c.tarif_max}` : ''),
            c.categorie && !c.repas_sans_tarif ? c.montant : (c.montant || 'à compléter'), this.part(c.montant)]),
          ['Total', this.parCategorie.reduce((s, c) => s + c.nb_agents, 0), this.totalNbCommandes, '', this.totalMontant, 100],
        ],
      };
    }
    return {
      titre: 'Facturation par plat',
      entete: ['Plat', 'Repas', 'Montant (FCFA)', 'Repas sans tarif'],
      lignes: [
        ...this.parPlat.map(p => [p.plat, p.nb_repas, p.montant, p.repas_sans_tarif]),
        ['Total', this.totalNbCommandes, this.totalMontant, this.repasSansTarifPlats],
      ],
    };
  }

  exporterSynthese(type: 'categorie' | 'plat', format: 'excel' | 'pdf'): void {
    const t = this.lignesSynthese(type);
    const { date_debut, date_fin } = this.filterForm.value;
    const fichier = `facturation-${type === 'categorie' ? 'par-categorie' : 'par-plat'}-${date_debut ?? ''}-${date_fin ?? ''}`;
    const sous = `${this.periodeTexte} · ${this.libelleEtat(this.etatPeriode)} · ${this.regle || ''}`;
    if (format === 'excel') {
      const ws = XLSX.utils.aoa_to_sheet([[t.titre], [sous], [], t.entete, ...t.lignes]);
      ws['!cols'] = t.entete.map((_, i) => ({ wch: i === 0 ? 28 : 16 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, type === 'categorie' ? 'Par catégorie' : 'Par plat');
      XLSX.writeFile(wb, `${fichier}.xlsx`);
      return;
    }
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const net = (v: any) => String(v ?? '').replace(/[\u202f\u00a0]/g, ' ').replace(/[–—]/g, '-');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(9, 36, 64);
    doc.text(t.titre, 14, 15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 112, 144);
    doc.text(doc.splitTextToSize(net(sous), 180), 14, 21);
    autoTable(doc, {
      startY: 30,
      head: [t.entete],
      body: t.lignes.map(l => l.map((c, i) => net(i > 0 && typeof c === 'number' ? this.formatMontant(c) : c))),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [9, 36, 64], textColor: 255, fontStyle: 'bold' },
      columnStyles: Object.fromEntries(t.entete.map((_, i) => [i, { halign: i ? 'right' : 'left' }])),
      didParseCell: d => {
        if (d.section === 'body' && d.row.index === t.lignes.length - 1) {
          d.cell.styles.fontStyle = 'bold';
          d.cell.styles.fillColor = [234, 251, 241];
        }
      },
    });
    doc.save(`${fichier}.pdf`);
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
      'État':              this.libelleEtat(l.etat),
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
      'État':              '',
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
      'Att.', 'Ret.', 'État', 'Total',
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
      this.libelleEtat(l.etat),
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
      headStyles: { fillColor: [9, 36, 64], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (data) => {
        if (data.row.index === body.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [234, 251, 241];
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
