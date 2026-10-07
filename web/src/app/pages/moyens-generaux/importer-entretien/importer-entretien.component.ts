import { Component } from '@angular/core';
import * as XLSX from 'xlsx';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-importer-entretien',
  templateUrl: './importer-entretien.component.html',
  styleUrls: ['./importer-entretien.component.scss']
})
export class ImporterEntretienComponent {
  breadCrumbItems: Array<{}> = [
    { label: 'Moyens généraux', active: true },
    { label: 'Entretien véhicule Liste', active: true }
  ];

  file: File | null = null;
  entretientvehiculesData: any[] = [];
  headers: string[] = [];
  isLoading = false;
  private apiUrl = `${environment.apiUrl}/api`;
  constructor(private http: HttpClient) {}

  onFileChange(event: any) {
    const file = event.target.files[0];
    this.file = file;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = 'Entretiens';

      if (workbook.Sheets[sheetName]) {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        this.entretientvehiculesData = jsonData;

        // Extraire les en-têtes dans l'ordre original
        if (jsonData.length > 0) {
          this.headers = Object.keys(jsonData[0] as object);
        }
      } else {
        alert('La feuille "Entretiens" est manquante.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  envoyerDonnees() {
    if (!this.file) return;

    this.isLoading = true;
    const formData = new FormData();
    formData.append('file', this.file);

    this.http.post(`${this.apiUrl}/api/import-entretien/`, formData)
      .subscribe({
        next: (res) => {
          alert("✅ Import réussi !");
          this.file = null;
          this.entretientvehiculesData = [];
          this.headers = [];
          this.isLoading = false;
        },
        error: (err) => {
          alert("❌ Erreur : " + (err.error?.error || "échec de l'import"));
          this.isLoading = false;
        }
      });
  }
}
