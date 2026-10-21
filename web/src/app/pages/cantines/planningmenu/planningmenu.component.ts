// Planning des menus : calendrier de la semaine (agences × jours, lundi → vendredi).
// Les données viennent du serveur en une requête (GET /api/api/planning/) :
// menus, plats et nombre de commandes reçues, état des commandes selon les
// délais paramétrés. Un gestionnaire ne voit que ses agences (règle serveur).

import { filtrerAgencesGerees, agencesGerees } from 'src/app/core/helpers/roles';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { Component, OnInit, DestroyRef, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import { environment } from 'src/environments/environment';

import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';
import { selectAllTypeequipeWithoutPagination } from 'src/app/store/Typeequipe/typeequipe-selector';
import { fetchtypeequipeNoPaginateData } from 'src/app/store/Typeequipe/typeequipe.action';

export type EtatMenu = 'termine' | 'en_service' | 'ferme' | 'ouvert';

export interface PlanningPlat { id: number; nom: string; type_plat: string | null; commandes: number; }
export interface PlanningMenu {
  id: number;
  date_menu: string;
  agence_id: number;
  typeequipe_id: number;
  typeequipe: string | null;
  etat: EtatMenu;
  date_limite_commande: string;
  date_limite_libelle: string;
  commandes: number;
  retirees: number;
  plats: PlanningPlat[];
}
export interface PlanningJour { date: string; etat: EtatMenu; date_limite_commande: string; }
export interface PlanningAgence {
  id: number;
  nom: string;
  nb_agents: number;
  equipes: string[];
  jours: { date: string; menus: PlanningMenu[] }[];
}
export interface PlanningReponse {
  aujourdhui: string;
  debut: string;
  fin: string;
  jours: PlanningJour[];
  agences: PlanningAgence[];
}

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
              'septembre', 'octobre', 'novembre', 'décembre'];
/** Pastille de couleur des plats (même ordre dans toutes les cases) */
const TEINTES = ['ce-t1', 'ce-t2', 'ce-t3', 'ce-t4', 'ce-t5'];

@Component({
  selector: 'app-planning-menus',
  templateUrl: './planningmenu.component.html',
  styleUrl: './planningmenu.component.scss',
})
export class PlanningMenuComponent implements OnInit {
  private userConnecte = inject(TokenStorageService).getUser();
  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  private destroyRef = inject(DestroyRef);
  private apiUrl = `${environment.apiUrl}/api/api`;

  agences: any[] = [];
  typeEquipes: any[] = [];
  filtreAgence = '';
  filtreEquipe = '';

  /** Lundi de la semaine affichée (AAAA-MM-JJ) */
  lundi = '';
  planning: PlanningReponse | null = null;
  isLoading = false;
  erreur: string | null = null;

  // ── Création rapide d'un menu depuis une case vide ─────────
  @ViewChild('creerModal', { static: false }) creerModal?: ModalDirective;
  creation: { date: string; agence: PlanningAgence; typeequipe: string; plats: any[]; choisis: Set<number> } | null = null;
  platsAgence: any[] | null = null;
  creationEnvoi = false;
  creationErreur: string | null = null;

  constructor(public store: Store) {}

  ngOnInit(): void {
    this.store.select(selectAllAgenceWithoutPagination).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => { if (data) this.agences = filtrerAgencesGerees(data, this.userConnecte); });
    this.store.select(selectAllTypeequipeWithoutPagination).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => { if (data) this.typeEquipes = data; });
    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.dispatch(fetchtypeequipeNoPaginateData());

    this.lundi = this.lundiDe(new Date());
    this.charger();
  }

  // ── Chargement ───────────────────────────────────────────────

  charger(): void {
    let params = new HttpParams().set('debut', this.lundi);
    if (this.filtreAgence) params = params.set('agence', this.filtreAgence);
    if (this.filtreEquipe) params = params.set('typeequipe', this.filtreEquipe);
    this.isLoading = true;
    this.erreur = null;
    this.http.get<PlanningReponse>(`${this.apiUrl}/planning/`, { params })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => { this.planning = data; this.isLoading = false; },
        error: err => {
          this.isLoading = false;
          this.erreur = typeof err === 'string' ? err : 'Le planning n\'a pas pu être chargé.';
        },
      });
  }

  semaine(decalage: number): void {
    const d = this.versDate(this.lundi);
    d.setDate(d.getDate() + 7 * decalage);
    this.lundi = this.lundiDe(d);
    this.charger();
  }

  aujourdhui(): void {
    this.lundi = this.lundiDe(new Date());
    this.charger();
  }

  get estSemaineCourante(): boolean {
    return this.lundi === this.lundiDe(new Date());
  }

  // ── Affichage ────────────────────────────────────────────────

  get titreSemaine(): string {
    const debut = this.versDate(this.lundi);
    const fin = new Date(debut); fin.setDate(fin.getDate() + 4);
    const memeMois = debut.getMonth() === fin.getMonth();
    return `Semaine du ${debut.getDate()}${memeMois ? '' : ' ' + MOIS[debut.getMonth()]} au ` +
           `${fin.getDate()} ${MOIS[fin.getMonth()]} ${fin.getFullYear()}`;
  }

  get sousTitre(): string {
    const gerees = agencesGerees(this.userConnecte);
    if (gerees === null) return 'Toutes les agences · commandes reçues par plat et par jour';
    const noms = this.agences.map(a => a.nom_agence).join(', ');
    return noms ? `Vos agences : ${noms}` : 'Vos agences';
  }

  /** Option « toutes » du filtre agence */
  get libelleToutes(): string {
    if (agencesGerees(this.userConnecte) === null) return 'Toutes les agences';
    return this.agences.length === 1 ? this.agences[0].nom_agence : 'Toutes mes agences';
  }

  libelleJour(date: string): string {
    return JOURS[this.versDate(date).getDay()];
  }

  jourCourt(date: string): string {
    const [, m, d] = date.split('-');
    return `${d}/${m}`;
  }

  estAujourdhui(date: string): boolean {
    return !!this.planning && date === this.planning.aujourdhui;
  }

  estPasse(date: string): boolean {
    return !!this.planning && date < this.planning.aujourdhui;
  }

  teinte(index: number): string {
    return TEINTES[index % TEINTES.length];
  }

  libelleEtat(m: PlanningMenu): string {
    switch (m.etat) {
      case 'termine':    return `Terminé · ${m.commandes}`;
      case 'en_service': return `En service · ${m.retirees}/${m.commandes} retirés`;
      case 'ferme':      return `Fermé · ${m.commandes}`;
      default:           return `Ouvert jusqu'au ${this.jourCourt(this.limiteJour(m.date_limite_commande))}`;
    }
  }

  /** Jour affiché pour une date limite (00:00 = minuit du jour précédent) */
  private limiteJour(iso: string): string {
    let d = new Date(iso);
    if (d.getHours() === 0 && d.getMinutes() === 0) d = new Date(d.getTime() - 86400000);
    return this.iso(d);
  }

  classeEtat(m: PlanningMenu): string {
    return { termine: 'ce-tag-gr', en_service: 'ce-tag-ve', ferme: 'ce-tag-or', ouvert: 'ce-tag-ve' }[m.etat];
  }

  iconeEtat(m: PlanningMenu): string {
    return { termine: '', en_service: '', ferme: 'ri-lock-line', ouvert: 'ri-time-line' }[m.etat];
  }

  get totalMenus(): number {
    return this.planning?.agences.reduce((n, a) => n + a.jours.reduce((k, j) => k + j.menus.length, 0), 0) ?? 0;
  }

  // ── Création rapide d'un menu ────────────────────────────────

  ouvrirCreation(agence: PlanningAgence, date: string): void {
    this.creationErreur = null;
    this.creation = {
      date, agence,
      typeequipe: this.filtreEquipe || String(this.typeEquipes[0]?.id ?? ''),
      plats: [], choisis: new Set<number>(),
    };
    this.creerModal?.show();
    const charger = this.platsAgence
      ? Promise.resolve(this.platsAgence)
      : new Promise<any[]>(ok => this.http.get<any[]>(`${this.apiUrl}/allnopagin/plats/?gerees=1`)
          .subscribe({ next: p => ok(this.platsAgence = p ?? []), error: () => ok([]) }));
    charger.then(plats => {
      if (this.creation) this.creation.plats = plats.filter(p => Number(p.agence_id ?? p.agence) === agence.id);
    });
  }

  basculerPlat(id: number): void {
    const s = this.creation?.choisis;
    if (!s) return;
    s.has(id) ? s.delete(id) : s.add(id);
  }

  creerMenu(): void {
    const c = this.creation;
    if (!c || this.creationEnvoi) return;
    if (!c.typeequipe) { this.creationErreur = 'Choisissez l\'équipe.'; return; }
    if (c.choisis.size === 0) { this.creationErreur = 'Sélectionnez au moins un plat.'; return; }
    this.creationEnvoi = true;
    this.creationErreur = null;
    this.http.post(`${this.apiUrl}/menus/`, {
      date_menu: c.date, agence: c.agence.id, typeequipe: Number(c.typeequipe), plat_ids: [...c.choisis],
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.creationEnvoi = false;
        this.creerModal?.hide();
        this.toastr.success(`Menu du ${this.jourCourt(c.date)} créé pour ${c.agence.nom}.`, 'Succès');
        this.charger();
      },
      error: err => {
        this.creationEnvoi = false;
        this.creationErreur = typeof err === 'string' ? err : 'Le menu n\'a pas pu être créé.';
      },
    });
  }

  // ── Exports (semaine affichée) ───────────────────────────────

  private lignesExport(): string[][] {
    const lignes: string[][] = [];
    for (const ag of this.planning?.agences ?? []) {
      const cellules = ag.jours.map(j => j.menus.length === 0 ? ['Pas de menu'] :
        j.menus.flatMap(m => [
          ...(j.menus.length > 1 && m.typeequipe ? [`[${m.typeequipe}]`] : []),
          ...m.plats.map(p => `- ${p.nom} (${p.commandes})`),
        ]));
      const hauteur = Math.max(1, ...cellules.map(c => c.length));
      for (let i = 0; i < hauteur; i++) {
        lignes.push([i === 0 ? ag.nom : '', ...cellules.map(c => c[i] ?? '')]);
      }
    }
    return lignes;
  }

  private entetes(): string[] {
    return ['Agence', ...(this.planning?.jours ?? []).map(j => `${this.libelleJour(j.date)} ${this.jourCourt(j.date)}`)];
  }

  exportExcel(): void {
    import('xlsx').then(XLSX => {
      const ws = XLSX.utils.aoa_to_sheet([this.entetes(), ...this.lignesExport()]);
      ws['!cols'] = [{ wch: 20 }, ...Array(5).fill({ wch: 28 })];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Planning menus');
      XLSX.writeFile(wb, `planning-menus-${this.lundi}.xlsx`);
    });
  }

  exportPdf(): void {
    import('jspdf').then(({ jsPDF }) => import('jspdf-autotable').then(mod => {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(`Planning des menus — ${this.titreSemaine}`, 14, 15);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('Entre parenthèses : commandes reçues (non annulées)', 14, 21);
      mod.default(doc, {
        head: [this.entetes()],
        body: this.lignesExport(),
        startY: 26,
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        headStyles: { fillColor: [9, 36, 64], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 32 } },
      });
      doc.save(`planning-menus-${this.lundi}.pdf`);
    }));
  }

  // ── Dates ────────────────────────────────────────────────────

  private versDate(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  private iso(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  private lundiDe(d: Date): string {
    const l = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const jour = (l.getDay() + 6) % 7;       // lundi = 0
    // Samedi / dimanche : on affiche la semaine qui vient
    l.setDate(l.getDate() - jour + (jour >= 5 ? 7 : 0));
    return this.iso(l);
  }
}
