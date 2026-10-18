// src/app/pages/cantine/facturation-prestataire/facturation-prestataire.component.ts
//
// Facturation prestataire : ce que nous devons payer au prestataire.
// AUCUN calcul de tarif ici : les montants viennent du serveur
// (GET /api/api/facturation/prestataires/), seule source de vérité :
//   - repas commandés et non annulés ;
//   - facturés par le prestataire rattaché à l'agence du menu
//     (AgencePrestataire), à son tarif (PlatPrestataire), tous deux en
//     vigueur à la date du menu ;
//   - montants figés pour les mois clôturés.

import { filtrerAgencesGerees } from 'src/app/core/helpers/roles';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';

import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';
import { selectAllTypeequipeWithoutPagination } from 'src/app/store/Typeequipe/typeequipe-selector';
import { fetchtypeequipeNoPaginateData } from 'src/app/store/Typeequipe/typeequipe.action';

import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type EtatFacture = 'cloturee' | 'provisoire' | 'partielle';

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
  totalMontant: number;   // somme des montants calculés par le serveur
  detail: {               // détail par date_menu
    dateMenu:   string;
    platNom:    string;
    montant:    number;   // tarif prestataire du jour (0 = pas de tarif)
    nbFois:     number;
    sousTotal:  number;
  }[];
  statuts: {
    en_attente: number;
    retiree:    number;
  };
}

@Component({
  selector: 'app-facturation-prestataire',
  templateUrl: './facturation-prestataire.component.html',
  styleUrl: './facturation-prestataire.component.scss',
})
export class FacturationPrestataireComponent implements OnInit {
  // Un gestionnaire ne gère que les agences auxquelles il est rattaché
  private userConnecte = inject(TokenStorageService).getUser();

  breadCrumbItems = [
    { label: 'Cantine', active: false },
    { label: 'Facturation prestataire', active: true },
  ];

  agences:      any[] = [];
  typeEquipes:  any[] = [];
  prestataires: any[] = [];

  isLoading   = false;
  hasSearched = false;
  error: string | null = null;

  filterForm!: UntypedFormGroup;

  regle = '';
  etat: EtatFacture | null = null;
  anomalies: string[] = [];
  repasSansTarif = 0;

  lignesFacturation: LigneFacturationPrestataire[] = [];
  totalNbCommandes = 0;
  totalMontant     = 0;

  // Prestataire sélectionné (objet complet pour affichage)
  prestataireSelectionne: any | null = null;

  // Factures officielles (mois clôturés) du prestataire sélectionné
  facturesOfficielles: any[] = [];
  telechargementEnCours: number | null = null;

  // Lignes détail dépliées
  detailOuvert: Set<string> = new Set();

  private destroyRef = inject(DestroyRef);
  private apiUrl = `${environment.apiUrl}/api/api`;

  constructor(
    private store: Store,
    private fb: UntypedFormBuilder,
    private http: HttpClient,
  ) {}

  ngOnInit(): void {
    const { debut, fin } = this._moisCourant();
    this.filterForm = this.fb.group({
      date_debut:   [debut],
      date_fin:     [fin],
      prestataire:  ['', [Validators.required]],  // obligatoire
      agence:       [''],
      typeequipe:   [''],
    });

    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.select(selectAllAgenceWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(a => this.agences = filtrerAgencesGerees(a ?? [], this.userConnecte));

    this.store.dispatch(fetchtypeequipeNoPaginateData());
    this.store.select(selectAllTypeequipeWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(t => this.typeEquipes = t ?? []);

    this.http.get<any[]>(`${this.apiUrl}/allnopagin/prestataires/`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(p => this.prestataires = p ?? []);
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

  onPrestataireChange(): void {
    const id = this.filterForm.get('prestataire')?.value;
    this.prestataireSelectionne = id ? (this.prestataires.find(p => p.id === +id) ?? null) : null;
    this.facturesOfficielles = [];
    if (id) {
      this.http.get<any>(`${this.apiUrl}/factures-prestataires/`,
                         { params: new HttpParams().set('prestataire', id).set('page_size', 100) })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(r => this.facturesOfficielles = Array.isArray(r) ? r : (r.results ?? []));
    }
  }

  /** Facture PDF officielle générée par le serveur à partir de la facture figée */
  telechargerFacture(f: any): void {
    this.telechargementEnCours = f.id;
    this.http.get(`${this.apiUrl}/factures-prestataires/${f.id}/pdf/`, { responseType: 'blob' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: blob => {
          saveAs(blob, `facture-${f.numero || f.id}.pdf`);
          this.telechargementEnCours = null;
        },
        error: () => {
          this.error = 'Téléchargement de la facture impossible.';
          this.telechargementEnCours = null;
        },
      });
  }

  libelleMois(annee: number, mois: number): string {
    return new Date(annee, mois - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  rechercher(): void {
    if (this.filterForm.get('prestataire')?.invalid) return;
    const { date_debut, date_fin, prestataire, agence, typeequipe } = this.filterForm.value;
    let params = new HttpParams().set('prestataire', prestataire);
    if (date_debut) params = params.set('date_debut', date_debut);
    if (date_fin)   params = params.set('date_fin', date_fin);
    if (agence)     params = params.set('agence', agence);
    if (typeequipe) params = params.set('typeequipe', typeequipe);

    this.hasSearched = true;
    this.isLoading = true;
    this.error = null;
    this.detailOuvert = new Set();
    this.http.get<any>(`${this.apiUrl}/facturation/prestataires/`, { params })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          const p = (data.prestataires ?? [])[0];
          this.regle            = data.regle;
          this.anomalies        = data.anomalies ?? [];
          this.etat             = p?.etat ?? null;
          this.repasSansTarif   = p?.repas_sans_tarif ?? 0;
          this.totalNbCommandes = p?.nb_repas ?? 0;
          this.totalMontant     = p?.total ?? 0;
          this.lignesFacturation = (p?.agents ?? []).map((a: any) => this._ligne(a));
          this.isLoading = false;
        },
        error: err => {
          this.error = typeof err === 'string' ? err : 'Erreur lors du calcul de la facturation';
          this.isLoading = false;
        },
      });
  }

  /** Mise en forme d'un agent (regroupement par date pour l'affichage uniquement) */
  private _ligne(a: any): LigneFacturationPrestataire {
    const parDate = new Map<string, { dateMenu: string; platNom: string; montant: number; nbFois: number; sousTotal: number }>();
    for (const l of a.lignes ?? []) {
      const d = parDate.get(l.date_menu)
        ?? { dateMenu: l.date_menu, platNom: l.plat, montant: l.montant ?? 0, nbFois: 0, sousTotal: 0 };
      if (d.platNom !== l.plat) d.platNom = 'Plusieurs plats';
      d.nbFois++;
      d.sousTotal += l.montant ?? 0;
      parDate.set(l.date_menu, d);
    }
    return {
      userId:       a.user_id,
      username:     a.username,
      nomPrenom:    a.nom_prenom,
      agenceMenu:   a.agence_menu || '—',
      agenceAgent:  a.agence_agent || '—',
      equipe:       a.equipe || '—',
      service:      a.service || '—',
      poste:        a.poste || '—',
      nbCommandes:  a.nb_repas,
      totalMontant: a.total,
      detail:       Array.from(parDate.values()).sort((x, y) => x.dateMenu.localeCompare(y.dateMenu)),
      statuts:      { en_attente: a.statuts.en_attente, retiree: a.statuts.retiree },
    };
  }

  resetFilters(): void {
    const { debut, fin } = this._moisCourant();
    this.filterForm.reset({ date_debut: debut, date_fin: fin, prestataire: '', agence: '', typeequipe: '' });
    this.hasSearched            = false;
    this.lignesFacturation      = [];
    this.totalNbCommandes       = 0;
    this.totalMontant           = 0;
    this.anomalies              = [];
    this.etat                   = null;
    this.repasSansTarif         = 0;
    this.prestataireSelectionne = null;
    this.facturesOfficielles    = [];
    this.detailOuvert           = new Set();
  }

  libelleEtat(etat: EtatFacture | null): string {
    return etat === 'cloturee' ? 'Clôturée' : etat === 'partielle' ? 'Partielle' : 'Provisoire';
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

  dismissAlert(): void { this.error = null; }

  get isLoadingAll(): boolean { return this.isLoading; }

  get hasPlatsSansMontant(): boolean {
    return this.repasSansTarif > 0;
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
      'État':          this.libelleEtat(this.etat),
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
      `État : ${this.libelleEtat(this.etat)} — ` +
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
      'Nb cmd', 'Att.', 'Ret.', 'État', 'Total dû (FCFA)',
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
        this.libelleEtat(this.etat),
        this.formatMontant(l.totalMontant),
      ]);
      // Sous-lignes détail plats
      l.detail.forEach(d => {
        body.push([
          '',
          { content: `→ ${this.formatDate(d.dateMenu)} — ${d.platNom} (${this.formatMontant(d.montant)} FCFA × ${d.nbFois})`,
            colSpan: 7, styles: { fontStyle: 'italic', textColor: [100, 100, 100] } },
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
      `État : ${this.libelleEtat(this.etat)} | ` +
      `Généré le : ${new Date().toLocaleDateString('fr-FR')} | ` +
      `Total agents : ${this.lignesFacturation.length}`,
      14, 22
    );

    // Définition des colonnes
    const head = [[
      'N°', 'Username', 'Nom & Prénom', 'Agence', 'Service', 'Poste',
      'Nb cmd', 'Att.', 'Ret.', 'État', 'Total dû (FCFA)',
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
        this.libelleEtat(this.etat),
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
