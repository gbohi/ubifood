import { Component, QueryList, ViewChild, ViewChildren, ElementRef } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { BsModalService, BsModalRef } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import { Observable } from 'rxjs';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { DropzoneConfigInterface } from 'ngx-dropzone-wrapper';
import { Store } from '@ngrx/store';

import { fetchDashboardEntretien } from 'src/app/store/Dashboardentretienvehicule/dashboardentretienvehicule.action';
import {
  selectDashboardEntretienData,
  selectDashboardEntretienLoading,
  selectDashboardTotalGlobal,
  selectDashboardTotalGlobalMois
} from 'src/app/store/Dashboardentretienvehicule/dashboardentretienvehicule-selector';

import { selectAllVehiculeWithoutPagination } from 'src/app/store/Vehicule/vehicule-selector';
import { fetchvehiculeNoPaginateData } from 'src/app/store/Vehicule/vehicule.action';

import { selectAllTypevehiculeWithoutPagination } from 'src/app/store/Typevehicule/typevehicule-selector';
import { fetchtypevehiculeNoPaginateData } from 'src/app/store/Typevehicule/typevehicule.action';

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

@Component({
  selector: 'app-dashboardentretienvehicule',
  templateUrl: './dashboardentretienvehicule.component.html',
  styleUrls: ['./dashboardentretienvehicule.component.scss']
})
export class DashboardentretienvehiculeComponent {
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
  typevehicules: any[] = [];
  statuts: any[] = [];
  vehicules: any[] = [];
  entretienvehicules: any[] = [];
  annee: number = new Date().getFullYear();

  selectedVehiculeId: string = '';
  selectedAgenceId: string = '';
  selectedMois: string = '';

  simplePieChart: any;
  distributedColumnChart: any;
  basicChart: any;

  totalGlobal$!: Observable<number>;
  totalGlobalMois$!: Observable<{ [key: number]: number }>;

  constructor(
    private formBuilder: UntypedFormBuilder,
    public toastService: ToastrService,
    public store: Store
  ) {}

  ngOnInit(): void {
    this.breadCrumbItems = [
      { label: 'Statistiques', active: true },
      { label: 'Entretien véhicule', active: true }
    ];

    // S'abonner à l'état de chargement
        this.store.select(selectDashboardEntretienLoading).subscribe(loading => {
          this.isLoading = loading;
          if (!loading) {
            document.getElementById('elmLoader')?.classList.add('d-none');
          } else {
            document.getElementById('elmLoader')?.classList.remove('d-none');
          }
        }); 
        
this.store.select(selectDashboardEntretienData).subscribe(data => {
  if (data?.donnees) {
    this.entretienvehicules = data.donnees.map(item => ({
      ...item,
      state: false
    }));
    console.log(this.entretienvehicules);
    //Chart
    this._simplePieChart(JSON.stringify(this.generateColorPalette(this.entretienvehicules.length)));
    this._distributedColumnChart(JSON.stringify(this.generateColorPalette(this.entretienvehicules.length)));
    this._basicChart(JSON.stringify(this.generateColorPalette(this.entretienvehicules.length)));

  }
  
});


    this.totalGlobal$ = this.store.select(selectDashboardTotalGlobal);
    this.totalGlobalMois$ = this.store.select(selectDashboardTotalGlobalMois);

    this.store.select(selectAllVehiculeWithoutPagination).subscribe(data => {
      if (data) {
        this.vehicules = data.map(item => ({ ...item, state: false }));
      }
    });

    this.store.select(selectAllAgenceWithoutPagination).subscribe(data => {
      if (data) {
        this.agences = data.map(item => ({ ...item, state: false }));
      }
    });

    this.store.select(selectAllTypevehiculeWithoutPagination).subscribe(data => {
      if (data) {
        this.typevehicules = data.map(item => ({ ...item, state: false }));
      }
    });

    this.store.select(selectAllSatutWithoutPagination).subscribe(data => {
      if (data) {
        this.statuts = data.map(item => ({ ...item, state: false }));
      }
    });

    this.loadData(1);
    // Chart Color Data Get Function
    this._simplePieChart('["--tb-primary", "--tb-success", "--tb-warning", "--tb-danger", "--tb-info"]');
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
    this.store.dispatch(fetchDashboardEntretien({ annee: this.annee }));
    this.store.dispatch(fetchvehiculeNoPaginateData());
    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.dispatch(fetchtypevehiculeNoPaginateData());
    this.store.dispatch(fetchstatutNoPaginateData());
  }

  getLibellesMois(): string[] {
    return [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
  }

  exporterExcel(): void {
    const wb = XLSX.utils.book_new();

    for (const agence of this.entretienvehicules) {
      const data = agence.vehicules.map((vehicule: any) => {
        const row: any = { Immatriculation: vehicule.immatriculation };
        for (let i = 1; i <= 12; i++) {
          row[this.getLibellesMois()[i - 1]] = vehicule.mois[i] || 0;
        }
        row["Total"] = vehicule.total;
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, agence.agence);
    }

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([excelBuffer]), `etat_entretien_${this.annee}.xlsx`);
  }

  exporterPDF(): void {
    const doc = new jsPDF();
    let y = 10;

    for (const agence of this.entretienvehicules) {
      doc.setFontSize(12);
      doc.text(`Agence : ${agence.agence}`, 14, y);
      y += 6;

      const body = agence.vehicules.map((vehicule: any) => {
        const row = [vehicule.immatriculation];
        for (let i = 1; i <= 12; i++) {
          row.push(vehicule.mois[i] || 0);
        }
        row.push(vehicule.total);
        return row;
      });

      autoTable(doc, {
        startY: y,
        head: [[
          'Immatriculation',
          ...this.getLibellesMois(),
          'Total'
        ]],
        body: body,
        styles: { fontSize: 8 }
      });

      y = (doc as any).lastAutoTable.finalY + 10;
      if (y > 260) {
        doc.addPage();
        y = 10;
      }
    }

    doc.save(`etat_entretien_${this.annee}.pdf`);
  }

formatMontant(value: number): string {
  return value
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

  exportPdf(): void {
    const doc = new jsPDF({ orientation: 'landscape' });
    const libellesMois = this.getLibellesMois();
    const today = new Date();
    const dateEdition = today.toLocaleDateString('fr-FR');

    doc.setFontSize(12);
    doc.text('État des entretiens Véhicules', 10, 10);
    doc.text(`Année : ${this.annee}`, 140, 10, { align: 'center' });
    doc.text(`Édité le ${dateEdition}`, 270, 10, { align: 'right' });

    let currentY = 20;
    this.entretienvehicules.forEach(agence => {
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 150);
      doc.text(`Agence : ${agence.agence}`, 10, currentY);

      const rows = agence.vehicules.map((v: any) => {
        const moisData = libellesMois.map((_, i) => this.formatMontant(v.mois[i + 1] || 0));
        return [v.immatriculation, ...moisData, this.formatMontant(v.total)];
      });

      const totalRow = [
        'Total mensuel agence',
        ...libellesMois.map((_, i) => this.formatMontant(agence.total_agence_mois[i + 1] || 0)),
        this.formatMontant(agence.total_agence_global)
      ];
      rows.push(totalRow);

      autoTable(doc, {
        startY: currentY + 5,
        head: [[
          'Immatriculation',
          ...libellesMois,
          'Total'
        ]],
        body: rows,
        styles: {
          font: 'helvetica',
          fontSize: 8,
           halign: 'right'
        },
        headStyles: {
          fillColor: [81, 215, 142],
          halign: 'center'
        },
        columnStyles: {
          0: { halign: 'left' } // 🟢 Immatriculation alignée à gauche
        },
        bodyStyles: {
          textColor: 20
        },
        didParseCell(data) {
          if (data.row.index === rows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
          }
        },
        margin: { left: 10, right: 10 },
        theme: 'grid'
      });

      currentY = (doc as any).lastAutoTable.finalY + 10;
    });

    doc.addPage();
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('Résumé Global', 10, 20);

    const totalGlobalMois: any = {};
    this.totalGlobalMois$.subscribe(data => {
      Object.assign(totalGlobalMois, data);
    }).unsubscribe();

    let totalGlobal = 0;
    this.totalGlobal$.subscribe(value => {
      totalGlobal = value;
    }).unsubscribe();

    const globalRow = [
      'Montant',
      ...libellesMois.map((_, i) => this.formatMontant(totalGlobalMois[i + 1] || 0)),
      this.formatMontant(totalGlobal)
    ];

    autoTable(doc, {
      startY: 30,
      head: [[
        'Mois',
        ...libellesMois,
        'Total Global Annuel'
      ]],
      body: [globalRow],
      styles: { 
        fontSize: 8,
        font: 'helvetica',
        halign: 'right'  
      },
      headStyles: {
        fillColor: [81, 215, 142],
        halign: 'center'
      },
      columnStyles: {
        0: { halign: 'left' } // 🟢 Colonne \"Mois\" alignée à gauche
      },
      bodyStyles: {
        fontStyle: 'bold'
      },
      margin: { left: 10, right: 10 },
      theme: 'grid'
    });

    doc.save(`etat_entretien_${this.annee}.pdf`);
  }

filtrer(): void {
  this.store.dispatch(fetchDashboardEntretien({
    annee: this.annee,
    agence_id: this.selectedAgenceId ? parseInt(this.selectedAgenceId, 10) : undefined,
    immatriculation: this.selectedVehiculeId || undefined
  }));
}


resetFiltres(): void {
  this.selectedVehiculeId = '';
  this.selectedAgenceId = '';
  this.selectedMois = '';
  this.annee = new Date().getFullYear();
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

  /**
  * Simple Pie Chart
  */
private _simplePieChart(colors: any) {
  colors = this.getChartColorsArray(colors);

  const agences = this.entretienvehicules.map(a => a.agence);
  const series = this.entretienvehicules.map(a => a.total_agence_global || 0);

  this.simplePieChart = {
    series: series,
    chart: {
      height: 300,
      type: "pie",
    },
    labels: agences,
    legend: {
      position: "bottom",
    },
    dataLabels: {
      dropShadow: {
        enabled: false,
      },
    },
    tooltip: {
      y: {
        formatter: (val: number) => this.formatMontant(val) + ' FCFA'
      }
    },
    colors: colors,
  };

  // Re-appliquer les couleurs au changement de thème
  const attributeToMonitor = 'data-theme';
  const observer = new MutationObserver(() => {
    this._simplePieChart('["--tb-primary", "--tb-success", "--tb-warning", "--tb-danger", "--tb-info"]');
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [attributeToMonitor]
  });
}

/**
  * Distributed Columns Charts
   */
  private _distributedColumnChart(colors: any) {
  colors = this.getChartColorsArray(colors);

  const agences = this.entretienvehicules.map(a => a.agence);
  const totals = this.entretienvehicules.map(a => a.total_agence_global || 0);

  this.distributedColumnChart = {
    series: [{
      name: "Total annuel",
      data: totals
    }],
    chart: {
      height: 350,
      type: 'bar',
      events: {
        click: function (chart: any, w: any, e: any) {}
      }
    },
    colors: colors,
    plotOptions: {
      bar: {
        columnWidth: '45%',
        distributed: true,
      }
    },
    dataLabels: {
      enabled: false
    },
    legend: {
      show: false
    },
    xaxis: {
      categories: agences,
      labels: {
        style: {
          colors: colors,
          fontSize: '12px'
        }
      }
    }
  };

  const attributeToMonitor = 'data-theme';
  const observer = new MutationObserver(() => {
    this._distributedColumnChart('["--tb-primary", "--tb-success", "--tb-warning", "--tb-danger", "--tb-dark", "--tb-info"]');
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [attributeToMonitor]
  });
}


private _basicChart1(colors: any) {
  colors = this.getChartColorsArray(colors);

  const libellesMois = this.getLibellesMois();
  const valeursMois: number[] = [];

  this.totalGlobalMois$.subscribe(data => {
    for (let i = 1; i <= 12; i++) {
      valeursMois.push(data[i] || 0);
    }
  }).unsubscribe();

  this.basicChart = {
    series: [{
      name: "Montant mensuel",
      data: valeursMois,
    }],
    chart: {
      height: 350,
      type: "bar",
      toolbar: {
        show: true,
        tools: {
          download: true, // permet l'export image/pdf natif
        }
      },
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "45%",
        dataLabels: {
          position: 'top', // Affiche les montants au-dessus des barres
        },
      },
    },
    dataLabels: {
      enabled: true,
      formatter: (val: number) => this.formatMontant(val) + ' FCFA',
      offsetY: -20,
      style: {
        fontSize: '10px',
        colors: ["#304758"]
      }
    },
    stroke: {
      show: true,
      width: 2,
      colors: ["transparent"],
    },
    colors: colors,
    xaxis: {
      categories: libellesMois,
      position: 'bottom',
      labels: {
        style: {
          fontSize: '12px'
        }
      }
    },
    yaxis: {
      title: {
        text: "Montant (FCFA)",
      },
      labels: {
        formatter: (val: number) => this.formatMontant(val),
      }
    },
    grid: {
      borderColor: "#f1f1f1",
    },
    fill: {
      opacity: 1,
    },
    tooltip: {
      y: {
        formatter: (val: number) => this.formatMontant(val) + ' FCFA',
      },
    },
  };

  const observer = new MutationObserver(() => {
    this._basicChart('["--tb-danger", "--tb-primary", "--tb-success"]');
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });
}


private _basicChart(colors: any) {
  colors = this.getChartColorsArray(colors);

  const libellesMois = this.getLibellesMois();

  const series: any[] = this.entretienvehicules.map((agence: any, index: number) => {
    const data = [];
    for (let i = 1; i <= 12; i++) {
      data.push(agence.total_agence_mois[i] || 0);
    }

    return {
      name: agence.agence,
      data: data
    };
  });

  this.basicChart = {
    series: series,
    chart: {
      height: 350,
      type: "bar",
      toolbar: {
        show: true,
        tools: {
          download: true
        }
      }
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "45%",
      }
    },
    dataLabels: {
      enabled: false,
      formatter: (val: number) => this.formatMontant(val),
      offsetY: -10,
      style: {
        fontSize: '10px',
        colors: ["#000"]
      }
    },
    stroke: {
      show: true,
      width: 2,
      colors: ["transparent"]
    },
    colors: colors,
    xaxis: {
      categories: libellesMois,
      labels: {
        style: {
          fontSize: '12px'
        }
      }
    },
    yaxis: {
      title: {
        text: "Montant (FCFA)"
      },
      labels: {
        formatter: (val: number) => this.formatMontant(val)
      }
    },
    fill: {
      opacity: 1
    },
    tooltip: {
      y: {
        formatter: (val: number) => this.formatMontant(val) + ' FCFA'
      }
    }
  };

  const observer = new MutationObserver(() => {
    this._basicChart('["--tb-danger", "--tb-primary", "--tb-success", "--tb-warning", "--tb-info"]');
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });
}


}
