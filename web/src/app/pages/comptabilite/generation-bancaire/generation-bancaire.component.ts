import { DecimalPipe } from '@angular/common';
import { Component } from '@angular/core';
import * as XLSX from 'xlsx';
import { HttpClient } from '@angular/common/http';
import { saveAs } from 'file-saver';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-generation-bancaire',
  templateUrl: './generation-bancaire.component.html',
  styleUrl: './generation-bancaire.component.scss',
    providers: [DecimalPipe]
})
export class GenerationBancaireComponent {
  // bread crumb items
  breadCrumbItems!: Array<{}>;

  file: File | null = null;
  prelevementsData: any[] = [];
  private apiUrl = `${environment.apiUrl}/api`;
  constructor(private http: HttpClient) {
    this.breadCrumbItems = [
      { label: 'Comptabilité', active: true },
      { label: 'Prélèvement Liste', active: true }
    ];
  }
  onFileChange(event: any) {
    const file = event.target.files[0];
    this.file = file;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = 'Prelevements';

      if (workbook.Sheets[sheetName]) {
        const sheet = workbook.Sheets[sheetName];
        this.prelevementsData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      } else {
        alert('La feuille "Prelevements" est manquante.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  envoyerEtGenererFichier() {
    if (!this.file) return;

    const formData = new FormData();
    formData.append('file', this.file);

    this.http.post(`${this.apiUrl}/api/api/apb128/generer/`, formData, {
      responseType: 'blob'
    }).subscribe(blob => {
      saveAs(blob, 'FICHIER_APB128.txt');
    }, error => {
      alert('Erreur lors de la génération du fichier APB128');
      console.error(error);
    });
  }

  

}
