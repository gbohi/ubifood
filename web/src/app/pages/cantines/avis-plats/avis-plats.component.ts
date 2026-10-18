// src/app/pages/cantines/avis-plats/avis-plats.component.ts
//
// Avis laissés par les agents sur les plats servis : synthèse (note moyenne
// globale et par plat) et liste paginée. Un gestionnaire ne voit que son
// agence (filtrage côté serveur) ; un administrateur peut modérer (supprimer).

import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';
import { environment } from 'src/environments/environment';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { ADMINS, aUnRole, filtrerAgencesGerees } from 'src/app/core/helpers/roles';

interface AvisPlat {
  id: number;
  note: number;
  commentaire: string | null;
  plat_id: number;
  plat_nom: string;
  user_nom: string;
  agence_nom: string;
  date_menu: string | null;
  created_at: string;
  updated_at: string;
}

interface StatPlat {
  plat_id: number;
  plat_nom: string;
  note_moyenne: number;
  nb_avis: number;
}

@Component({
  selector: 'app-avis-plats',
  templateUrl: './avis-plats.component.html',
})
export class AvisPlatsComponent implements OnInit {

  breadCrumbItems = [
    { label: 'Cantine', active: false },
    { label: 'Avis des plats', active: true },
  ];

  readonly pageSize = 20;
  readonly notes = [5, 4, 3, 2, 1];

  // ── Filtres ─────────────────────────────────────────────────
  dateDebut = '';
  dateFin = '';
  agenceId: number | '' = '';
  platId: number | '' = '';
  note: number | '' = '';

  agences: any[] = [];
  plats: any[] = [];

  // ── Données ─────────────────────────────────────────────────
  avis: AvisPlat[] = [];
  totalItems = 0;
  currentPage = 1;
  isLoading = false;

  stats: StatPlat[] = [];
  isLoadingStats = false;
  moyenneGlobale: number | null = null;
  nbAvisTotal = 0;

  aSupprimer: AvisPlat | null = null;
  isDeleting = false;

  readonly estAdmin: boolean;

  private destroyRef = inject(DestroyRef);
  private api = `${environment.apiUrl}/api/api`;
  private user = inject(TokenStorageService).getUser();

  constructor(private http: HttpClient, private toast: ToastrService) {
    this.estAdmin = aUnRole(this.user, ADMINS);
  }

  ngOnInit(): void {
    const auj = new Date();
    this.dateDebut = this.iso(new Date(auj.getFullYear(), auj.getMonth(), 1));
    this.dateFin = this.iso(new Date(auj.getFullYear(), auj.getMonth() + 1, 0));

    this.http.get<any[]>(`${this.api}/allnopagin/agences/`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.agences = filtrerAgencesGerees(data ?? [], this.user);
          // Un gestionnaire d'une seule agence : pré-sélection
          if (!this.estAdmin && this.agences.length === 1) this.agenceId = this.agences[0].id;
        },
        error: err => this.toast.error(this.texte(err), 'Erreur'),
      });

    this.http.get<any[]>(`${this.api}/allnopagin/plats/?gerees=1`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => this.plats = [...(data ?? [])].sort((a, b) => (a.nom ?? '').localeCompare(b.nom ?? '')),
        error: err => this.toast.error(this.texte(err), 'Erreur'),
      });

    this.rechercher();
  }

  /** Applique les filtres : recharge la synthèse et la première page */
  rechercher(): void {
    if (this.dateDebut && this.dateFin && this.dateDebut > this.dateFin) {
      this.toast.warning('La date de début doit précéder la date de fin.', 'Période');
      return;
    }
    this.chargerStats();
    this.chargerAvis(1);
  }

  reinitialiser(): void {
    const auj = new Date();
    this.dateDebut = this.iso(new Date(auj.getFullYear(), auj.getMonth(), 1));
    this.dateFin = this.iso(new Date(auj.getFullYear(), auj.getMonth() + 1, 0));
    this.agenceId = !this.estAdmin && this.agences.length === 1 ? this.agences[0].id : '';
    this.platId = '';
    this.note = '';
    this.rechercher();
  }

  chargerAvis(page: number): void {
    this.isLoading = true;
    const params = this.filtres()
      .set('page', String(page))
      .set('page_size', String(this.pageSize));
    this.http.get<{ count: number; results: AvisPlat[] }>(`${this.api}/avis-plats/`, { params })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.avis = res?.results ?? [];
          this.totalItems = res?.count ?? 0;
          this.currentPage = page;
          this.isLoading = false;
        },
        error: err => {
          this.isLoading = false;
          this.avis = [];
          this.totalItems = 0;
          this.toast.error(this.texte(err), 'Erreur');
        },
      });
  }

  chargerStats(): void {
    this.isLoadingStats = true;
    this.http.get<StatPlat[]>(`${this.api}/avis-plats/statistiques/`, { params: this.filtres() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.stats = [...(data ?? [])].sort((a, b) =>
            (Number(b.note_moyenne) - Number(a.note_moyenne)) || (b.nb_avis - a.nb_avis)
            || (a.plat_nom ?? '').localeCompare(b.plat_nom ?? ''));
          this.nbAvisTotal = this.stats.reduce((s, x) => s + (x.nb_avis || 0), 0);
          this.moyenneGlobale = this.nbAvisTotal
            ? this.stats.reduce((s, x) => s + Number(x.note_moyenne) * (x.nb_avis || 0), 0) / this.nbAvisTotal
            : null;
          this.isLoadingStats = false;
        },
        error: err => {
          this.isLoadingStats = false;
          this.stats = [];
          this.nbAvisTotal = 0;
          this.moyenneGlobale = null;
          this.toast.error(this.texte(err), 'Erreur');
        },
      });
  }

  pageChanged(event: PageChangedEvent): void {
    if (event.page !== this.currentPage) this.chargerAvis(event.page);
  }

  // ── Modération (administrateurs) ────────────────────────────

  supprimer(): void {
    const a = this.aSupprimer;
    if (!a || this.isDeleting) return;
    this.isDeleting = true;
    this.http.delete(`${this.api}/avis-plats/${a.id}/`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isDeleting = false;
          this.aSupprimer = null;
          this.toast.success('Avis supprimé.', 'Succès');
          // Revenir à la page précédente si la page courante devient vide
          const page = this.avis.length === 1 && this.currentPage > 1 ? this.currentPage - 1 : this.currentPage;
          this.chargerStats();
          this.chargerAvis(page);
        },
        error: err => { this.isDeleting = false; this.toast.error(this.texte(err), 'Erreur'); },
      });
  }

  // ── Utilitaires ─────────────────────────────────────────────

  /** 5 étoiles : 'full' | 'half' | 'empty' */
  etoiles(note: number | null | undefined): ('full' | 'half' | 'empty')[] {
    const n = Number(note) || 0;
    return [1, 2, 3, 4, 5].map(i => n >= i - 0.25 ? 'full' : n >= i - 0.75 ? 'half' : 'empty');
  }

  /** Note sur une décimale, virgule française */
  formatNote(n: number | null | undefined): string {
    return (Number(n) || 0).toFixed(1).replace('.', ',');
  }

  formatDate(d: string | null | undefined): string {
    if (!d) return '—';
    const [y, m, j] = String(d).slice(0, 10).split('-');
    return `${j}/${m}/${y}`;
  }

  private filtres(): HttpParams {
    let p = new HttpParams();
    if (this.dateDebut) p = p.set('date_debut', this.dateDebut);
    if (this.dateFin) p = p.set('date_fin', this.dateFin);
    if (this.agenceId !== '' && this.agenceId != null) p = p.set('agence', String(this.agenceId));
    if (this.platId !== '' && this.platId != null) p = p.set('plat', String(this.platId));
    if (this.note !== '' && this.note != null) p = p.set('note', String(this.note));
    return p;
  }

  private iso(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const j = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${j}`;
  }

  private texte(err: any): string {
    return typeof err === 'string' ? err : 'Une erreur est survenue.';
  }
}
