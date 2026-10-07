// src/app/pages/cantine/planning-menus/planning-menus.component.ts
import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';
import { selectAllTypeequipeWithoutPagination } from 'src/app/store/Typeequipe/typeequipe-selector';
import { fetchtypeequipeNoPaginateData } from 'src/app/store/Typeequipe/typeequipe.action';

/**
 * Une ligne du planning = une date
 * Les plats sont groupés par typeequipe_id
 */
export interface PlanningRow {
  date: string;
  equipes: { [typeequipeId: number]: string[] };
}

/**
 * Groupe par agence — contient plusieurs lignes (dates)
 */
export interface PlanningGroup {
  agenceId: number;
  agenceNom: string;
  rows: PlanningRow[];
}

@Component({
  selector: 'app-planning-menus',
  templateUrl: './planningmenu.component.html',
  styleUrl: './planningmenu.component.scss',
})
export class PlanningMenuComponent implements OnInit {

  breadCrumbItems = [
    { label: 'Cantine', active: false },
    { label: 'Planning des menus', active: true }
  ];

  // ── Données ──────────────────────────────────────────────────
  agences: any[] = [];
  typeEquipes: any[] = [];
  planningRows: PlanningRow[] = [];   // utilisé quand une agence est filtrée
  planningGroups: PlanningGroup[] = []; // utilisé quand toutes les agences
  isLoading = false;

  /** true = toutes agences → affichage groupé par agence */
  get showAgenceColumn(): boolean {
    return !this.filterForm?.value?.agence;
  }

  // ── Filtres ──────────────────────────────────────────────────
  filterForm!: UntypedFormGroup;

  private apiUrl = `${environment.apiUrl}/api/api`;
  private destroyRef = inject(DestroyRef);

  constructor(
    private fb: UntypedFormBuilder,
    private http: HttpClient,
    public store: Store,
  ) {}

  ngOnInit(): void {
    this.filterForm = this.fb.group({
      date_debut: [''],
      date_fin: [''],
      agence: [''],
      typeequipe: [''],
    });

    this.store.select(selectAllAgenceWithoutPagination).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(data => { if (data) this.agences = data; });

    this.store.select(selectAllTypeequipeWithoutPagination).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(data => {
      if (data) {
        this.typeEquipes = data;
      }
    });

    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.dispatch(fetchtypeequipeNoPaginateData());

    // Charger le planning du mois courant par défaut
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay  = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    this.filterForm.patchValue({
      date_debut: this.toDateStr(firstDay),
      date_fin:   this.toDateStr(lastDay),
    });

    this.loadPlanning();
  }

  // ── Chargement ───────────────────────────────────────────────

  loadPlanning(): void {
    this.isLoading = true;
    const { date_debut, date_fin, agence, typeequipe } = this.filterForm.value;

    let url = `${this.apiUrl}/menus/?page_size=1000`;
    if (date_debut)  url += `&date_menu__gte=${date_debut}`;   // double underscore requis par django-filter
    if (date_fin)    url += `&date_menu__lte=${date_fin}`;     // double underscore requis par django-filter
    if (agence)      url += `&agence=${agence}`;
    if (typeequipe)  url += `&typeequipe=${typeequipe}`;

    this.http.get<any>(url).subscribe({
      next: (response) => {
        const menus = response.results ?? response;
        this.buildPlanning(menus);
        this.isLoading = false;
      },
      error: () => { this.isLoading = false; }
    });
  }

  /**
   * Transforme la liste de menus en planning.
   * - Si une agence est filtrée : planningRows (liste plate par date)
   * - Si toutes agences        : planningGroups (groupé par agence, puis par date)
   */
  private buildPlanning(menus: any[]): void {
    // Mettre à jour typeEquipes depuis les menus si pas encore chargés
    if (this.typeEquipes.length === 0) {
      const teMap: { [id: number]: string } = {};
      menus.forEach(m => {
        if (m.typeequipe && m.typeequipe_libelle) teMap[m.typeequipe] = m.typeequipe_libelle;
      });
      this.typeEquipes = Object.entries(teMap).map(([id, libelle]) => ({ id: +id, libelle }));
    }

    if (this.showAgenceColumn) {
      // ── Mode toutes agences : grouper par agence puis par date ──
      const agenceMap: { [agId: number]: { nom: string; dates: { [date: string]: { [teId: number]: string[] } } } } = {};

      menus.forEach(menu => {
        const agId = menu.agence;
        const agNom = menu.agence_nom ?? `Agence ${agId}`;
        const date = menu.date_menu;
        const teId = menu.typeequipe;

        if (!agenceMap[agId]) agenceMap[agId] = { nom: agNom, dates: {} };
        if (!agenceMap[agId].dates[date]) agenceMap[agId].dates[date] = {};
        if (!agenceMap[agId].dates[date][teId]) agenceMap[agId].dates[date][teId] = [];

        const plats = menu.menu_plats?.map((mp: any) => mp.plat?.nom).filter(Boolean) ?? [];
        agenceMap[agId].dates[date][teId].push(...plats);
      });

      this.planningGroups = Object.entries(agenceMap).map(([agId, val]) => ({
        agenceId: +agId,
        agenceNom: val.nom,
        rows: Object.keys(val.dates).sort().map(date => ({
          date,
          equipes: val.dates[date]
        }))
      }));
      this.planningRows = [];

    } else {
      // ── Mode agence unique : liste plate par date ──
      const map: { [date: string]: { [teId: number]: string[] } } = {};

      menus.forEach(menu => {
        const date = menu.date_menu;
        const teId = menu.typeequipe;
        if (!map[date]) map[date] = {};
        if (!map[date][teId]) map[date][teId] = [];
        const plats = menu.menu_plats?.map((mp: any) => mp.plat?.nom).filter(Boolean) ?? [];
        map[date][teId].push(...plats);
      });

      this.planningRows = Object.keys(map).sort().map(date => ({ date, equipes: map[date] }));
      this.planningGroups = [];
    }
  }

  // ── Colonnes visibles ────────────────────────────────────────

  get colonnesVisibles(): any[] {
    const filterTE = this.filterForm.value.typeequipe;
    if (filterTE) {
      return this.typeEquipes.filter(te => te.id === +filterTE);
    }
    return this.typeEquipes;
  }

  getPlats(row: PlanningRow, teId: number): string[] {
    return row.equipes[teId] ?? [];
  }

  // ── Nombre total de jours affichés ──────────────────────────

  get totalJours(): number {
    if (this.showAgenceColumn) {
      return this.planningGroups.reduce((acc, g) => acc + g.rows.length, 0);
    }
    return this.planningRows.length;
  }

  // ── Export Excel ─────────────────────────────────────────────

  exportExcel(): void {
    import('xlsx').then(XLSX => {
      const wsData: any[][] = [];
      const cols = this.colonnesVisibles;

      if (this.showAgenceColumn) {
        // En-tête avec colonne Agence
        wsData.push(['Agence', 'Date / Menu', ...cols.map(te => te.libelle)]);

        this.planningGroups.forEach(group => {
          group.rows.forEach(row => {
            const maxPlats = Math.max(1, ...cols.map(te => this.getPlats(row, te.id).length));
            for (let i = 0; i < maxPlats; i++) {
              const line: any[] = [];
              line.push(i === 0 ? group.agenceNom : '');
              line.push(i === 0 ? this.formatDate(row.date) : '');
              cols.forEach(te => {
                const plats = this.getPlats(row, te.id);
                line.push(plats[i] ? `- ${plats[i]}` : '');
              });
              wsData.push(line);
            }
          });
          // Ligne vide entre agences
          wsData.push([]);
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [{ wch: 20 }, { wch: 16 }, ...cols.map(() => ({ wch: 30 }))];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Planning menus');
        XLSX.writeFile(wb, `planning-menus-toutes-agences.xlsx`);

      } else {
        wsData.push(['Date / Menu', ...cols.map(te => te.libelle)]);

        this.planningRows.forEach(row => {
          const maxPlats = Math.max(1, ...cols.map(te => this.getPlats(row, te.id).length));
          for (let i = 0; i < maxPlats; i++) {
            const line: any[] = [];
            line.push(i === 0 ? this.formatDate(row.date) : '');
            cols.forEach(te => {
              const plats = this.getPlats(row, te.id);
              line.push(plats[i] ? `- ${plats[i]}` : '');
            });
            wsData.push(line);
          }
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [{ wch: 16 }, ...cols.map(() => ({ wch: 30 }))];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Planning menus');
        const agenceLabel = this.agences.find(a => a.id === +this.filterForm.value.agence)?.nom_agence ?? 'agence';
        XLSX.writeFile(wb, `planning-menus-${agenceLabel}.xlsx`);
      }
    });
  }

  // ── Export PDF ───────────────────────────────────────────────

  exportPdf(): void {
    import('jspdf').then(({ jsPDF }) => {
      import('jspdf-autotable').then((autoTableModule) => {
        const autoTable = autoTableModule.default;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const cols = this.colonnesVisibles;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('Planning des menus', 14, 15);

        const { date_debut, date_fin } = this.filterForm.value;
        if (date_debut || date_fin) {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.text(`Période : ${date_debut ?? '...'} au ${date_fin ?? '...'}`, 14, 22);
        }

        const body: any[][] = [];

        if (this.showAgenceColumn) {
          const head = [['Agence', 'Date / Menu', ...cols.map(te => te.libelle)]];

          this.planningGroups.forEach(group => {
            group.rows.forEach(row => {
              const maxPlats = Math.max(1, ...cols.map(te => this.getPlats(row, te.id).length));
              for (let i = 0; i < maxPlats; i++) {
                const line: any[] = [];
                line.push(i === 0 ? group.agenceNom : '');
                line.push(i === 0 ? this.formatDate(row.date) : '');
                cols.forEach(te => {
                  const plats = this.getPlats(row, te.id);
                  line.push(plats[i] ? `- ${plats[i]}` : '');
                });
                body.push(line);
              }
            });
            // Ligne séparatrice entre agences
            body.push(new Array(2 + cols.length).fill(''));
          });

          autoTable(doc, {
            head,
            body,
            startY: 27,
            styles: { fontSize: 9, cellPadding: 3 },
            headStyles: { fillColor: [41, 98, 255], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 247, 255] },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 }, 1: { fontStyle: 'bold', cellWidth: 25 } },
          });

          doc.save(`planning-menus-toutes-agences.pdf`);

        } else {
          const head = [['Date / Menu', ...cols.map(te => te.libelle)]];

          this.planningRows.forEach(row => {
            const maxPlats = Math.max(1, ...cols.map(te => this.getPlats(row, te.id).length));
            for (let i = 0; i < maxPlats; i++) {
              const line: any[] = [];
              line.push(i === 0 ? this.formatDate(row.date) : '');
              cols.forEach(te => {
                const plats = this.getPlats(row, te.id);
                line.push(plats[i] ? `- ${plats[i]}` : '');
              });
              body.push(line);
            }
          });

          autoTable(doc, {
            head,
            body,
            startY: 27,
            styles: { fontSize: 9, cellPadding: 3 },
            headStyles: { fillColor: [41, 98, 255], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 247, 255] },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 25 } },
          });

          const agenceLabel = this.agences.find(a => a.id === +this.filterForm.value.agence)?.nom_agence ?? 'agence';
          doc.save(`planning-menus-${agenceLabel}.pdf`);
        }
      });
    });
  }

  // ── Utilitaires ──────────────────────────────────────────────

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }

  private toDateStr(d: Date): string {
    return d.toISOString().split('T')[0];
  }
}
