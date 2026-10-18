// src/app/pages/cantine/facturation-commande/facturation-commande.component.ts
//
// Facturation des employés : AUCUN calcul ici. Les montants viennent du
// serveur (GET /api/api/facturation/), seule source de vérité :
// repas commandés et non annulés, au tarif de la catégorie salarié en
// vigueur à la date du menu ; montants figés pour les mois clôturés.

import { filtrerAgencesGerees } from 'src/app/core/helpers/roles';
import { Component, OnInit, DestroyRef, inject } from '@angular/core';
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

  breadCrumbItems = [
    { label: 'Cantine', active: false },
    { label: 'Facturation commandes', active: true },
  ];

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
    this.hasSearched       = false;
    this.lignesFacturation = [];
    this.totalNbCommandes  = 0;
    this.totalMontant      = 0;
    this.repasSansTarif    = 0;
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

  cloturer(): void {
    if (!this.moisACloturer) return;
    const [annee, mois] = this.moisACloturer.split('-').map(Number);
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
