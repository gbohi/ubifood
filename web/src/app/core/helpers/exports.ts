// src/app/core/helpers/exports.ts
//
// Exports communs (statistiques, détail du service, facturation) :
// Excel (xlsx), CSV (séparateur « ; », lisible par Excel en français),
// PDF (jspdf + jspdf-autotable) et images de graphiques (ApexCharts).

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type Cellule = string | number | null | undefined;
export interface Feuille { nom: string; lignes: Cellule[][]; largeurs?: number[]; }

const NAVY: [number, number, number] = [9, 36, 64];

/** Nom de feuille Excel valide (31 caractères, sans : \ / ? * [ ]) et unique */
function nomFeuille(nom: string, pris: Set<string>): string {
  let base = (nom || 'Feuille').replace(/[:\\/?*\[\]]/g, ' ').slice(0, 31).trim() || 'Feuille';
  let n = base, i = 2;
  while (pris.has(n.toLowerCase())) { n = `${base.slice(0, 28)} ${i++}`; }
  pris.add(n.toLowerCase());
  return n;
}

/** Classeur Excel : une feuille par entrée */
export function exporterExcel(fichier: string, feuilles: Feuille[]): void {
  const wb = XLSX.utils.book_new();
  const pris = new Set<string>();
  for (const f of feuilles) {
    const ws = XLSX.utils.aoa_to_sheet(f.lignes.map(l => l.map(c => c ?? '')));
    const largeurs = f.largeurs ?? (f.lignes[0] ?? []).map((_, i) =>
      Math.min(40, Math.max(8, ...f.lignes.map(l => String(l[i] ?? '').length + 2))));
    ws['!cols'] = largeurs.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, nomFeuille(f.nom, pris));
  }
  XLSX.writeFile(wb, fichier.endsWith('.xlsx') ? fichier : `${fichier}.xlsx`);
}

/** CSV « ; » avec BOM UTF-8 (accents corrects à l'ouverture dans Excel) */
export function exporterCsv(fichier: string, lignes: Cellule[][]): void {
  const echapper = (c: Cellule) => {
    const s = c === null || c === undefined ? '' : String(c);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const texte = lignes.map(l => l.map(echapper).join(';')).join('\r\n');
  saveAs(new Blob(['﻿' + texte], { type: 'text/csv;charset=utf-8' }),
         fichier.endsWith('.csv') ? fichier : `${fichier}.csv`);
}

/** Les polices standard de jsPDF ne connaissent pas les espaces fines ni certains symboles */
export function textePdf(v: Cellule): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/[  ]/g, ' ')
    .replace(/[−–—]/g, '-')
    .replace(/[★]/g, '')
    .replace(/[≈]/g, '~')
    .replace(/[→›]/g, '>')
    .replace(/[’]/g, "'");
}

export interface DocPdf { doc: jsPDF; y: number; }

/** Nouveau document : titre + sous-titre (filtres, date d'édition) */
export function nouveauPdf(titre: string, sousTitre: string, paysage = true): DocPdf {
  const doc = new jsPDF({ orientation: paysage ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...NAVY);
  doc.text(textePdf(titre), 14, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90, 112, 144);
  const lignes = doc.splitTextToSize(textePdf(sousTitre), doc.internal.pageSize.getWidth() - 28);
  doc.text(lignes, 14, 21);
  return { doc, y: 21 + lignes.length * 4 + 3 };
}

/** Saut de page si la place restante est insuffisante */
export function placePdf(p: DocPdf, hauteur: number): void {
  if (p.y + hauteur > p.doc.internal.pageSize.getHeight() - 12) {
    p.doc.addPage();
    p.y = 15;
  }
}

export function titrePdf(p: DocPdf, titre: string, sousTitre = ''): void {
  placePdf(p, 24);
  p.doc.setFont('helvetica', 'bold');
  p.doc.setFontSize(11);
  p.doc.setTextColor(...NAVY);
  p.doc.text(textePdf(titre), 14, p.y + 4);
  p.y += 6;
  if (sousTitre) {
    p.doc.setFont('helvetica', 'normal');
    p.doc.setFontSize(8);
    p.doc.setTextColor(90, 112, 144);
    p.doc.text(textePdf(sousTitre), 14, p.y + 3);
    p.y += 5;
  }
}

/** Tableau ; la dernière ligne est mise en gras si `total` */
export function tableauPdf(p: DocPdf, entete: Cellule[], corps: Cellule[][], total = false,
                           alignDroite: number[] = []): void {
  const colonnes: Record<number, any> = {};
  alignDroite.forEach(i => colonnes[i] = { halign: 'right' });
  autoTable(p.doc, {
    startY: p.y + 1,
    head: [entete.map(textePdf)],
    body: corps.map(l => l.map(textePdf)),
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: colonnes,
    margin: { left: 14, right: 14 },
    didParseCell: (d: any) => {
      if (total && d.section === 'body' && d.row.index === corps.length - 1) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = [234, 251, 241];
      }
    },
  });
  p.y = ((p.doc as any).lastAutoTable?.finalY ?? p.y) + 6;
}

/** PNG → JPEG sur fond blanc (rapport PDF bien plus léger) */
function enJpeg(dataUri: string): Promise<{ uri: string; w: number; h: number }> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 800, h = img.naturalHeight || 300;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) { resolve({ uri: dataUri, w, h }); return; }
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0);
      resolve({ uri: c.toDataURL('image/jpeg', 0.85), w, h });
    };
    img.onerror = () => resolve({ uri: dataUri, w: 800, h: 300 });
    img.src = dataUri;
  });
}

/** Image (data URI PNG) sur toute la largeur utile, proportions conservées */
export async function imagePdf(p: DocPdf, dataUri: string, largeurMax?: number): Promise<void> {
  const jpeg = await enJpeg(dataUri);
  const dims = { w: jpeg.w, h: jpeg.h };
  const largeur = Math.min(largeurMax ?? 999, p.doc.internal.pageSize.getWidth() - 28);
  let w = largeur, h = largeur * dims.h / dims.w;
  const hMax = 78;
  if (h > hMax) { h = hMax; w = hMax * dims.w / dims.h; }
  placePdf(p, h + 4);
  p.doc.addImage(jpeg.uri, jpeg.uri.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', 14, p.y, w, h);
  p.y += h + 4;
}

export function enregistrerPdf(p: DocPdf, fichier: string): void {
  const n = p.doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    p.doc.setPage(i);
    p.doc.setFontSize(7);
    p.doc.setTextColor(150);
    p.doc.text(`UbiFood · page ${i} / ${n}`, p.doc.internal.pageSize.getWidth() - 14,
               p.doc.internal.pageSize.getHeight() - 6, { align: 'right' });
  }
  p.doc.save(fichier.endsWith('.pdf') ? fichier : `${fichier}.pdf`);
}

/** Télécharge une image PNG (data URI) */
export function telechargerImage(dataUri: string, fichier: string): void {
  const a = document.createElement('a');
  a.href = dataUri;
  a.download = fichier.endsWith('.png') ? fichier : `${fichier}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Nom de fichier sans accents ni espaces */
export function nomFichier(...parties: (string | number)[]): string {
  return parties.filter(p => p !== '' && p !== null && p !== undefined).join('-')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}
