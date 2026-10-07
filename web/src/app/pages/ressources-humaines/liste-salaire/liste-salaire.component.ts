import { Component, QueryList, ViewChild, ViewChildren, ElementRef } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, FormGroup, UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { BsModalService, BsModalRef } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import { Observable } from 'rxjs';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { DropzoneConfigInterface } from 'ngx-dropzone-wrapper';
import { Store } from '@ngrx/store';

import { fetchDashboardSimulation } from 'src/app/store/Dashboardsimulation/dashboardsimulation.action';
import {
  selectDashboardSimulationData,
  selectDashboardSimulationLoading,
  selectTotalGlobal,
  selectTotalParAnnee,
  selectDashboardSimulationCount
} from 'src/app/store/Dashboardsimulation/dashboardsimulation-selector';

import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';

import { selectAllSatutWithoutPagination } from 'src/app/store/Statut/statut-selector';
import { fetchstatutNoPaginateData } from 'src/app/store/Statut/statut.action';

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { PageChangedEvent } from 'ngx-bootstrap/pagination';
import { cloneDeep } from 'lodash';
import { Simulation } from 'src/app/store/Dashboardsimulation/dashboardsimulation.model';

@Component({
  selector: 'app-dashboardentretienvehicule',
  templateUrl: './liste-salaire.component.html',
  styleUrls: ['./liste-salaire.component.scss']
})
export class ListeSalaireComponent {
  breadCrumbItems!: Array<{}>;
  vehiculeList: any[] = [];
  totalItems: number = 0;
  currentPage: number = 1;
  isLoading: boolean = true;
  vehiculeForm!: UntypedFormGroup;
  submitted = false;
  masterSelected!: boolean;
  term: any;
  files: File[] = [];
  checkedValGet: any[] = [];

  agences: any[] = [];
  statuts: any[] = [];
  simulations: any[] = [];
  annee: number = new Date().getFullYear();
  anneesimulations: number[] = [];


  filtreForm: FormGroup;

  simplePieChart: any;
  distributedColumnChart: any;
  basicChart: any;

  totalGlobal$: Observable<{ salaire: number; augmentation: number; cotisation: number; } | null> | undefined;
  totalParAnnee$: Observable<{ [annee: string]: { salaire: number; augmentation: number; cotisation: number; }; }> | undefined;
  countSimulations$: Observable<number> | undefined;

  constructor(
    private formBuilder: UntypedFormBuilder,
    public toastService: ToastrService,
    public store: Store,
    private fb: FormBuilder
  ) {
    this.filtreForm = this.fb.group({
      annee_debut: [''],
      annee_fin: [''],
      salaire_min: [''],
      salaire_max: ['']
    });
  }

  ngOnInit(): void {
    this.breadCrumbItems = [
      { label: 'Simulation', active: true },
      { label: 'Simulation salaire', active: true }
    ];

    // S'abonner à l'état de chargement
        this.store.select(selectDashboardSimulationLoading,).subscribe(loading => {
          this.isLoading = loading;
          if (!loading) {
            document.getElementById('elmLoader')?.classList.add('d-none');
          } else {
            document.getElementById('elmLoader')?.classList.remove('d-none');
          }
        }); 
        
this.store.select(selectDashboardSimulationData).subscribe(data => {
  if (data && data.results && Array.isArray(data.results.results)) {
    this.simulations = data.results.results.map(item => ({
      ...item,
      state: false
    }));

    console.log(this.simulations);

    // Extraire toutes les années uniques de tous les historiques
    const allYears = this.simulations
      .flatMap(s => s.historique.map((h: { annee: any }) => h.annee));

    this.anneesimulations = Array.from(new Set(allYears)).sort((a, b) => a - b);
    console.log(this.anneesimulations);
  } else {
    this.simulations = [];
    this.anneesimulations = [];
  }
});


this.totalGlobal$ = this.store.select(selectTotalGlobal);
this.totalParAnnee$ = this.store.select(selectTotalParAnnee);
this.countSimulations$ = this.store.select(selectDashboardSimulationCount);




    this.store.select(selectAllAgenceWithoutPagination).subscribe(data => {
      if (data) {
        this.agences = data.map(item => ({ ...item, state: false }));
      }
    });

    this.store.select(selectAllSatutWithoutPagination).subscribe(data => {
      if (data) {
        this.statuts = data.map(item => ({ ...item, state: false }));
      }
    });

    this.loadData(1);
  }

  private generateColorPalette(count: number): string[] {
  const baseColors = [
    "--tb-primary", "--tb-success", "--tb-warning", "--tb-danger", "--tb-info",
    "--tb-secondary", "--tb-dark", "--tb-light", "--tb-purple", "--tb-teal"
  ];
  const result: string[] = [];

  for (let i = 0; i < count; i++) {
    result.push(baseColors[i % baseColors.length]);
  }

  return result;
}


  loadData(page: number = 1): void {
    this.store.dispatch(fetchDashboardSimulation({}));
    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.dispatch(fetchstatutNoPaginateData());
  }

  getLibellesMois(): string[] {
    return [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
  }

  exporterExcel(): void {
  const worksheetData = [
    [
      'Matricule', 'Catégorie', 'Date naissance',
      'Salaire Base', 'Sursalaire', 'Salaire Brut 2025',
      ...this.anneesimulations.flatMap(a => [
        `Âge ${a}`, `Salaire ${a}`, `Taux Aug. ${a}`, `Augment. ${a}`, `Cotisation ${a}`
      ])
    ]
  ];

  this.simulations.forEach(sim => {
    const base = [
      sim.matricule,
      sim.categorie,
      new Date(sim.date_naissance).toLocaleDateString(),
      sim.salaire_base,
      sim.sursalaire === 0 ? '-' : sim.sursalaire,
      sim.salaire_brut_2025
    ];

    const historique = this.anneesimulations.flatMap(annee => {
      const h = sim.historique.find((x: any) => x.annee === annee);
      return h
        ? [h.age, h.salaire, `${h.taux_augmentation}%`, h.augmentation, h.cotisation]
        : ['-', '-', '-', '-', '-'];
    });

    worksheetData.push([...base, ...historique]);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Simulations');

  const excelBuffer: any = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const data: Blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
  saveAs(data, 'simulation_salaire_export.xlsx');
}

  exporterPDF(): void {
    
  }

formatMontant(value: number): string {
  return value
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

exportPdf(): void {
  const doc = new jsPDF('l', 'mm', 'a3'); // mode paysage

  const title = 'Liste des simulations salariales';
  doc.setFontSize(14);
  doc.text(title, 10, 10);

  const header = [
    'Matricule', 'Catégorie', 'Date naissance',
    'Salaire Base', 'Sursalaire', 'Salaire Brut 2025',
    ...this.anneesimulations.flatMap(a => [
      `Âge ${a}`, `Salaire ${a}`, `Taux Aug. ${a}`, `Augment. ${a}`, `Cotisation ${a}`
    ])
  ];

  const rows = this.simulations.map(sim => {
    const baseData = [
      sim.matricule,
      sim.categorie,
      new Date(sim.date_naissance).toLocaleDateString(),
      sim.salaire_base,
      sim.sursalaire === 0 ? '-' : sim.sursalaire,
      sim.salaire_brut_2025
    ];

    const historiqueData = this.anneesimulations.flatMap(annee => {
      const h = sim.historique.find((x: any) => x.annee === annee);
      return h
        ? [h.age, h.salaire, `${h.taux_augmentation}%`, h.augmentation, h.cotisation]
        : ['-', '-', '-', '-', '-'];
    });

    return [...baseData, ...historiqueData];
  });

  autoTable(doc, {
    head: [header],
    body: rows,
    styles: {
      fontSize: 7,
      cellPadding: 1
    },
    headStyles: {
      fillColor: [81, 215, 142], // #51d78e
      halign: 'center',
      valign: 'middle'
    }
  });

  doc.save('simulation_salaire_export.pdf');
}

appliquerFiltres(): void {
  const filtres = this.filtreForm.value;
  this.store.dispatch(fetchDashboardSimulation({
    annee_debut: filtres.annee_debut,
    annee_fin: filtres.annee_fin,
    salaire_min: filtres.salaire_min,
    salaire_max: filtres.salaire_max
  }));
}


resetFiltres(): void {
  this.filtreForm.reset();
  this.loadData();
}


  // Chart Colors Set
  private getChartColorsArray(colors: any) {
    colors = JSON.parse(colors);
    return colors.map(function (value: any) {
      var newValue = value.replace(" ", "");
      if (newValue.indexOf(",") === -1) {
        var color = getComputedStyle(document.documentElement).getPropertyValue(newValue);
        if (color) {
          color = color.replace(" ", "");
          return color;
        }
        else return newValue;;
      } else {
        var val = value.split(',');
        if (val.length == 2) {
          var rgbaColor = getComputedStyle(document.documentElement).getPropertyValue(val[0]);
          rgbaColor = "rgba(" + rgbaColor + "," + val[1] + ")";
          return rgbaColor;
        } else {
          return newValue;
        }
      }
    });
  }

   historiqueParAnnee(sim: Simulation, annee: number) {
    return sim.historique.find((h: { annee: number; }) => h.annee === annee);
  }

}
