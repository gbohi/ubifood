// Badges d'accès des employés (retrait au comptoir par badge) — gestionnaires (leurs
// agences) et administrateurs : association badge par badge (choisir l'employé, poser
// le badge sur le lecteur USB) et import de la liste de la sécurité (matricule, numéro)
// avec aperçu avant import. Le numéro n'est jamais affiché en clair (4 derniers chiffres).
// API : GET /admin/badges/sans-badge/?agence=, POST /admin/badges/ {user, numero},
// POST /admin/badges/import/ {lignes, apercu}.
import { Component, DestroyRef, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { Store } from '@ngrx/store';
import { ToastrService } from 'ngx-toastr';
import { filtrerAgencesGerees } from 'src/app/core/helpers/roles';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';
import { environment } from 'src/environments/environment';
import * as XLSX from 'xlsx';
import { erreurApi } from './erreur-api';

export interface EmployeSansBadge { id: number; nom: string; matricule: string; perdu?: boolean; badge?: string | null }
export interface LigneImportBadge {
  ligne: number; matricule: string; employe: string | null; badge: string;
  resultat: string; statut: 'a_associer' | 'a_jour' | 'erreur';
}
export interface ResultatImportBadges {
  apercu: boolean; lignes: LigneImportBadge[]; a_associer: number; a_jour: number; erreurs: number; total: number;
}

@Component({
  selector: 'app-badges',
  templateUrl: './badges.component.html',
})
export class BadgesComponent implements OnInit {
  private http = inject(HttpClient);
  private store = inject(Store);
  private toastr = inject(ToastrService);
  private destroyRef = inject(DestroyRef);
  private user = inject(TokenStorageService).getUser();
  private api = `${environment.apiUrl}/api/api/admin/badges`;

  onglet: 'associer' | 'tous' | 'importer' = 'associer';
  agences: any[] = [];
  agence: number | '' = '';

  // Association badge par badge
  total = 0;
  avecBadge = 0;
  sansBadge: EmployeSansBadge[] = [];
  /** Tous les employés (onglet « Tous les employés ») et leur badge actif masqué */
  employes: EmployeSansBadge[] = [];
  rechercheTous = '';
  ficheId: number | null = null;
  chargement = true;
  recherche = '';
  choisi: EmployeSansBadge | null = null;
  numero = '';
  envoi = false;
  /** Dernières associations de la session (affichage, numéro masqué) */
  associes: { nom: string; masque: string }[] = [];
  @ViewChild('champNumero') champNumero?: ElementRef<HTMLInputElement>;

  // Import
  fichier = '';
  lignesFichier: { ligne: number; matricule: string; numero: string }[] = [];
  resultat: ResultatImportBadges | null = null;
  filtreImport: 'tout' | 'a_associer' | 'erreur' = 'tout';
  importEnCours = false;

  ngOnInit(): void {
    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.select(selectAllAgenceWithoutPagination).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(a => this.agences = filtrerAgencesGerees(a ?? [], this.user));
    this.charger();
  }

  charger(): void {
    this.chargement = true;
    const params: any = this.agence ? { agence: this.agence, tous: 1 } : { tous: 1 };
    this.http.get<{ total: number; avec_badge: number; sans_badge: EmployeSansBadge[]; employes?: EmployeSansBadge[] }>(`${this.api}/sans-badge/`, { params })
      .subscribe({
        next: r => {
          this.total = r.total;
          this.avecBadge = r.avec_badge;
          this.sansBadge = r.sans_badge;
          this.employes = r.employes ?? [];
          this.chargement = false;
          if (this.choisi && !this.sansBadge.some(u => u.id === this.choisi!.id)) this.choisi = null;
        },
        error: e => { this.chargement = false; this.toastr.error(erreurApi(e, 'Chargement impossible.')); },
      });
  }

  get pctAvecBadge(): number {
    return this.total ? Math.round(100 * this.avecBadge / this.total) : 0;
  }

  get listeFiltree(): EmployeSansBadge[] {
    const q = this.recherche.trim().toLowerCase();
    return q ? this.sansBadge.filter(u => u.nom.toLowerCase().includes(q) || u.matricule.toLowerCase().includes(q)) : this.sansBadge;
  }

  get employesFiltres(): EmployeSansBadge[] {
    const q = this.rechercheTous.trim().toLowerCase();
    const l = q ? this.employes.filter(u => u.nom.toLowerCase().includes(q) || u.matricule.toLowerCase().includes(q)) : this.employes;
    return l.slice(0, 200);
  }

  get ficheEmploye(): EmployeSansBadge | undefined {
    return this.employes.find(u => u.id === this.ficheId);
  }

  /** Badge modifié depuis la fiche : mise à jour des compteurs et des listes */
  badgeChange(): void {
    this.charger();
  }

  choisir(u: EmployeSansBadge): void {
    this.choisi = u;
    this.numero = '';
    setTimeout(() => this.champNumero?.nativeElement.focus(), 0);
  }

  /** Badge posé sur le lecteur (le lecteur « tape » le numéro puis Entrée) */
  associer(): void {
    const numero = this.numero.trim();
    const u = this.choisi;
    if (!u || !numero || this.envoi) return;
    this.envoi = true;
    this.http.post<{ masque: string }>(`${this.api}/`, { user: u.id, numero }).subscribe({
      next: b => {
        this.envoi = false;
        this.numero = '';
        this.associes.unshift({ nom: u.nom, masque: b.masque });
        this.associes = this.associes.slice(0, 6);
        this.toastr.success(`Badge ${b.masque} associé à ${u.nom}.`);
        // Employé suivant de la liste
        const liste = this.listeFiltree;
        const i = liste.findIndex(x => x.id === u.id);
        const suivant = liste[i + 1] ?? null;
        this.sansBadge = this.sansBadge.filter(x => x.id !== u.id);
        this.employes = this.employes.map(x => x.id === u.id ? { ...x, badge: b.masque, perdu: false } : x);
        this.avecBadge++;
        if (suivant) this.choisir(suivant); else this.choisi = null;
      },
      error: e => {
        this.envoi = false;
        this.numero = '';
        this.toastr.error(erreurApi(e, "Le badge n'a pas pu être associé."));
        setTimeout(() => this.champNumero?.nativeElement.focus(), 0);
      },
    });
  }

  // ── Import de la liste de la sécurité ───────────────────────
  lireFichier(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    const lecteur = new FileReader();
    lecteur.onload = () => {
      try {
        const csv = f.name.toLowerCase().endsWith('.csv');
        // raw: false → numéros longs gardés tels qu'écrits (zéros en tête, pas de notation 1E+10)
        const wb = csv ? XLSX.read(new TextDecoder('utf-8').decode(lecteur.result as ArrayBuffer), { type: 'string', raw: true })
                       : XLSX.read(lecteur.result, { type: 'array' });
        const lignes = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
        const { cMat, cNum, debut } = this.colonnes(lignes);
        this.lignesFichier = lignes.slice(debut)
          .map((l, n) => ({ ligne: n + debut + 1, matricule: String(l[cMat] ?? '').trim(), numero: String(l[cNum] ?? '').trim() }))
          .filter(l => l.matricule || l.numero);
        this.fichier = f.name;
        this.resultat = null;
        if (!this.lignesFichier.length) { this.toastr.warning('Aucune ligne trouvée dans le fichier.'); return; }
        this.envoyerImport(true);
      } catch {
        this.toastr.error('Fichier illisible.');
      }
    };
    lecteur.readAsArrayBuffer(f);
  }

  /** Colonnes « matricule » et « numéro / badge / identifiant » d'après l'en-tête (sinon A et B) */
  private colonnes(lignes: any[][]): { cMat: number; cNum: number; debut: number } {
    const entete = (lignes[0] ?? []).map(c => String(c ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
    const cMat = entete.findIndex(c => c.includes('matricule'));
    const cNum = entete.findIndex(c => /badge|numero|identifiant|carte|uid/.test(c) && !c.includes('matricule'));
    if (cMat >= 0 && cNum >= 0) return { cMat, cNum, debut: 1 };
    const aEntete = entete.some(c => /[a-z]{3,}/.test(c) && !/^[0-9a-f]+$/.test(c));
    return { cMat: 0, cNum: 1, debut: aEntete ? 1 : 0 };
  }

  envoyerImport(apercu: boolean): void {
    if (!this.lignesFichier.length || this.importEnCours) return;
    this.importEnCours = true;
    this.http.post<ResultatImportBadges>(`${this.api}/import/`, { lignes: this.lignesFichier, apercu }).subscribe({
      next: r => {
        this.importEnCours = false;
        this.resultat = r;
        this.filtreImport = 'tout';
        if (!apercu) {
          this.toastr.success(`${r.lignes.filter(l => l.resultat === 'Associé').length} badge(s) associé(s).`);
          this.lignesFichier = [];
          this.charger();
        }
      },
      error: e => { this.importEnCours = false; this.toastr.error(erreurApi(e, 'Import impossible.')); },
    });
  }

  get lignesAffichees(): LigneImportBadge[] {
    const l = this.resultat?.lignes ?? [];
    return this.filtreImport === 'tout' ? l : l.filter(x => x.statut === this.filtreImport);
  }

  annulerImport(): void {
    this.lignesFichier = [];
    this.resultat = null;
    this.fichier = '';
  }

  modele(): void {
    const ws = XLSX.utils.aoa_to_sheet([['Matricule', 'Numéro du badge'], ['01401', '0012345678']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Badges');
    XLSX.writeFile(wb, 'modele-import-badges.xlsx');
  }
}
