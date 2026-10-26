// src/app/shared/detail-service/detail-service.component.ts
//
// Fenêtre « Voir le détail » (maquette stats-4-detail) : qui a commandé, qui a
// été servi, qui reste à servir (ou n'a pas retiré, pour les jours passés).
// Ouverte depuis l'accueil gestionnaire (service du jour) et depuis la page
// Statistiques (période choisie) :
//
//   this.modalService.show(DetailServiceComponent, { class: 'modal-xl modal-dialog-centered',
//     initialState: { debut, fin, mode: 'repas', plat: 12, plats, categories, agences } });
//
// Données : GET /api/api/statistiques/detail/ (paginé ; export=1 pour la liste complète).
// Styles : assets/scss/pages/_statistiques.scss (app-detail-service).

import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';

import {
  DetailService, FiltresDetail, LigneDetail, ListeDetail, StatistiquesService,
  heureFr, jourLibelle, jourMoisCourt, libellePeriode, nombreFr,
} from 'src/app/core/services/statistiques/statistiques.service';
import {
  Cellule, enregistrerPdf, exporterExcel, nomFichier, nouveauPdf, tableauPdf,
} from 'src/app/core/helpers/exports';

export interface OptionPlat { id: number; nom: string; }
export interface OptionCategorie { id: number | null; libelle: string | null; }
export interface OptionAgence { id: number; nom_agence: string; }

const LIBELLES: Record<ListeDetail, string> = {
  commandes: 'Commandés', servis: 'Servis', a_servir: 'À servir', non_retires: 'Non retirés',
};

@Component({
  selector: 'app-detail-service',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './detail-service.component.html',
})
export class DetailServiceComponent implements OnInit {
  // ── Paramètres d'ouverture (initialState) ─────────────────────
  debut = '';
  fin = '';
  agence: number | null = null;
  typeequipe: number | null = null;
  mode: 'repas' | 'categorie' = 'repas';
  plat: number | null = null;
  /** id de catégorie, « aucune » (sans catégorie) ou null (toutes) */
  categorie: number | 'aucune' | null = null;
  liste: ListeDetail = 'commandes';
  plats: OptionPlat[] = [];
  categories: OptionCategorie[] = [];
  agences: OptionAgence[] = [];
  /** Complément du sous-titre (ex. « Journée ») */
  contexte = '';

  // ── État ──────────────────────────────────────────────────────
  donnees: DetailService | null = null;
  chargement = false;
  export: 'excel' | 'pdf' | null = null;
  erreur: string | null = null;
  recherche = '';
  page = 1;
  readonly parPage = 10;
  majA = '';

  readonly heureFr = heureFr;
  readonly nombreFr = nombreFr;
  readonly jourMoisCourt = jourMoisCourt;

  bsModalRef = inject(BsModalRef);
  private service = inject(StatistiquesService);
  private toastr = inject(ToastrService);
  private destroyRef = inject(DestroyRef);
  private recherche$ = new Subject<string>();
  private requete?: Subscription;

  ngOnInit(): void {
    if (!this.onglets.includes(this.liste)) this.liste = 'commandes';
    this.recherche$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => { this.page = 1; this.charger(); });
    this.charger();
  }

  // ── Libellés ──────────────────────────────────────────────────
  get unJour(): boolean { return this.debut === this.fin; }

  /** Onglets : « À servir » pour aujourd'hui et après, « Non retirés » pour les jours passés */
  get onglets(): ListeDetail[] {
    const auj = this.donnees?.periode.aujourdhui ?? this.aujourdhuiLocal();
    const o: ListeDetail[] = ['commandes', 'servis'];
    if (this.fin >= auj) o.push('a_servir');
    if (this.debut < auj) o.push('non_retires');
    return o;
  }

  libelleOnglet(l: ListeDetail): string { return LIBELLES[l]; }

  get choix(): string {
    if (this.mode === 'repas') {
      return this.plat ? (this.plats.find(p => p.id === this.plat)?.nom ?? 'Repas') : 'Tous les repas';
    }
    if (this.categorie === 'aucune') return 'Sans catégorie';
    return this.categorie ? (this.categories.find(c => c.id === this.categorie)?.libelle ?? 'Catégorie')
                          : 'Toutes les catégories';
  }

  get titre(): string {
    const quand = this.unJour ? `Service du ${jourLibelle(this.debut)}` : `Service · ${libellePeriode(this.debut, this.fin)}`;
    return `${quand} · ${this.choix}`;
  }

  get sousTitre(): string {
    const ag = this.agence ? (this.agences.find(a => a.id === this.agence)?.nom_agence ?? '')
                           : this.agences.map(a => a.nom_agence).join(', ') || 'Toutes les agences';
    return [this.contexte, ag, this.majA ? `mis à jour à ${this.majA}` : ''].filter(Boolean).join(' · ');
  }

  get colonneDate(): boolean { return !this.unJour; }
  get colonneRepas(): boolean { return this.mode === 'categorie' || !this.plat; }

  get lignes(): LigneDetail[] { return this.donnees?.results ?? []; }
  get total(): number { return this.donnees?.count ?? 0; }
  get nbPages(): number { return Math.max(1, Math.ceil(this.total / this.parPage)); }

  get pages(): number[] {
    const n = this.nbPages, p = this.page;
    const debut = Math.max(1, Math.min(p - 2, n - 4));
    return Array.from({ length: Math.min(5, n) }, (_, i) => debut + i);
  }

  get plage(): string {
    if (!this.total) return '0 agent';
    const d = (this.page - 1) * this.parPage + 1;
    const f = Math.min(this.total, this.page * this.parPage);
    return `${d} – ${f} sur ${nombreFr(this.total)} ${this.unJour ? 'agent' : 'repas'}${this.total > 1 && this.unJour ? 's' : ''}`;
  }

  compte(l: ListeDetail): number { return this.donnees?.compteurs?.[l] ?? 0; }

  classeCategorie(c: string | null): string {
    const s = (c ?? '').toLowerCase();
    if (!s) return 'st-cat-aucune';
    if (s.includes('cadre')) return 'st-cat-cadre';
    if (s.includes('maîtrise') || s.includes('maitrise')) return 'st-cat-maitrise';
    if (s.includes('stagiaire')) return 'st-cat-stagiaire';
    return 'st-cat-autre';
  }

  // ── Actions ───────────────────────────────────────────────────
  changerMode(m: 'repas' | 'categorie'): void {
    if (this.mode === m) return;
    this.mode = m;
    this.plat = null;
    this.categorie = null;
    this.page = 1;
    this.charger();
  }

  changerFiltre(): void { this.page = 1; this.charger(); }

  changerOnglet(l: ListeDetail): void {
    if (this.liste === l) return;
    this.liste = l;
    this.page = 1;
    this.charger();
  }

  allerPage(p: number): void {
    if (p < 1 || p > this.nbPages || p === this.page) return;
    this.page = p;
    this.charger();
  }

  saisieRecherche(v: string): void { this.recherche$.next(v.trim()); }

  fermer(): void { this.bsModalRef.hide(); }

  private filtres(liste: ListeDetail = this.liste): FiltresDetail {
    return {
      debut: this.debut, fin: this.fin, agence: this.agence, typeequipe: this.typeequipe,
      plat: this.mode === 'repas' ? this.plat : null,
      categorie: this.mode === 'categorie' ? this.categorie : null,
      liste, search: this.recherche.trim(),
    };
  }

  charger(): void {
    this.requete?.unsubscribe();
    this.chargement = true;
    this.erreur = null;
    this.requete = this.service.detail({ ...this.filtres(), page: this.page, page_size: this.parPage })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: d => {
          this.donnees = d;
          this.chargement = false;
          const n = new Date();
          this.majA = `${n.getHours()} h ${String(n.getMinutes()).padStart(2, '0')}`;
          if (!this.onglets.includes(this.liste)) this.changerOnglet('commandes');
        },
        error: e => {
          this.chargement = false;
          this.erreur = typeof e === 'string' ? e : (e?.error?.detail || 'Chargement impossible');
        },
      });
  }

  statutLigne(l: LigneDetail): { texte: string; classe: string; icone: string } {
    if (l.statut === 'servi') {
      return { texte: l.heure_retrait ? `Servi · ${heureFr(l.heure_retrait)}` : 'Servi', classe: 'st-s-servi', icone: 'ri-check-line' };
    }
    if (l.statut === 'a_servir') return { texte: 'À servir', classe: 'st-s-attente', icone: 'ri-time-line' };
    return { texte: 'Non retiré', classe: 'st-s-non', icone: 'ri-close-circle-line' };
  }

  // ── Exports de l'onglet actif (liste complète, pas seulement la page) ──
  private colonnes(): string[] {
    const c = ['Nom', 'Prénoms', 'Matricule', 'Catégorie', 'Poste', 'Agence'];
    if (this.colonneDate) c.push('Date du menu');
    if (this.colonneRepas) c.push('Repas');
    if (this.liste === 'commandes') c.push('Statut');
    if (this.liste === 'servis') c.push('Heure de retrait');
    return c;
  }

  private ligneExport(l: LigneDetail): Cellule[] {
    const r: Cellule[] = [l.nom, l.prenom, l.matricule, l.categorie ?? 'Sans catégorie', l.poste ?? '', l.agence ?? ''];
    if (this.colonneDate) r.push(jourMoisCourt(l.date_menu) + '/' + l.date_menu.slice(0, 4));
    if (this.colonneRepas) r.push(l.plat);
    if (this.liste === 'commandes') r.push(this.statutLigne(l).texte);
    if (this.liste === 'servis') r.push(heureFr(l.heure_retrait));
    return r;
  }

  exporter(format: 'excel' | 'pdf'): void {
    this.export = format;
    this.service.detail({ ...this.filtres(), export: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: d => {
          this.export = null;
          const titre = `${this.titre} · ${LIBELLES[this.liste]} (${d.count})`;
          const fichier = nomFichier('service', this.debut, this.unJour ? '' : this.fin, this.choix, LIBELLES[this.liste]);
          const corps = d.results.map(l => this.ligneExport(l));
          if (format === 'excel') {
            exporterExcel(fichier, [{
              nom: LIBELLES[this.liste],
              lignes: [[titre], [this.sousTitre], [], this.colonnes(), ...corps],
            }]);
          } else {
            const pdf = nouveauPdf(titre, `${this.sousTitre} · édité le ${new Date().toLocaleDateString('fr-FR')}`);
            tableauPdf(pdf, this.colonnes(), corps);
            enregistrerPdf(pdf, fichier);
          }
          if (d.tronque) this.toastr.warning(`Export limité aux ${nombreFr(d.results.length)} premières lignes.`);
        },
        error: () => { this.export = null; this.toastr.error("L'export a échoué."); },
      });
  }

  private aujourdhuiLocal(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
