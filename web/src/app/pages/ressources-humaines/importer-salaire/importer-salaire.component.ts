import { Component } from '@angular/core';
import * as XLSX from 'xlsx';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-importer-salaire',
  templateUrl: './importer-salaire.component.html',
  styleUrls: ['./importer-salaire.component.scss']
})
export class ImporterSalaireComponent {
  breadCrumbItems: Array<{}> = [
    { label: 'Ressources humaines', active: true },
    { label: 'Salaire Liste', active: true }
  ];

  file: File | null = null;
  salaireData: any[] = [];
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
      const sheetName = 'salaire';

      if (workbook.Sheets[sheetName]) {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        this.salaireData = jsonData;

        // Extraire les en-têtes dans l'ordre original
        if (jsonData.length > 0) {
          this.headers = Object.keys(jsonData[0] as object);
        }
      } else {
        alert('La feuille "salaire" est manquante.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  envoyerDonnees() {
    if (!this.file) return;

    this.isLoading = true;
    const formData = new FormData();
    formData.append('file', this.file);

    this.http.post(`${this.apiUrl}/api/simulationsalaire/upload/`, formData)
      .subscribe({
        next: (res) => {
          alert("✅ Import réussi !");
          this.file = null;
          this.salaireData = [];
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
