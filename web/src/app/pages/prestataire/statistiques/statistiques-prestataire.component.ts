// Statistiques du prestataire (légères) : chiffres clés et détail par plat.
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { exporterExcel, nomFichier } from 'src/app/core/helpers/exports';
import {
  ContextePresta, EspacePrestataireService, StatsPresta, isoJour, messageErreur, noteFr, nombreFr, pourcentFr,
} from 'src/app/core/services/espace-prestataire/espace-prestataire.service';

type Periode = 'mois' | 'precedent' | 'trimestre' | 'annee' | 'perso';

@Component({
  selector: 'app-statistiques-prestataire',
  templateUrl: './statistiques-prestataire.component.html',
})
export class StatistiquesPrestataireComponent implements OnInit {
  private api = inject(EspacePrestataireService);
  private destroyRef = inject(DestroyRef);

  contexte: ContextePresta | null = null;
  periode: Periode = 'mois';
  debut = '';
  fin = '';
  agence: number | '' = '';
  stats: StatsPresta | null = null;
  chargement = true;
  erreur: string | null = null;
  tri: 'commandes' | 'servis' | 'taux_retrait' | 'note' = 'commandes';

  readonly nombreFr = nombreFr;
  readonly noteFr = noteFr;
  readonly pourcentFr = pourcentFr;
  readonly periodes: { cle: Periode; libelle: string }[] = [
    { cle: 'mois', libelle: 'Ce mois-ci' },
    { cle: 'precedent', libelle: 'Mois précédent' },
    { cle: 'trimestre', libelle: '3 derniers mois' },
    { cle: 'annee', libelle: 'Cette année' },
    { cle: 'perso', libelle: 'Personnalisée' },
  ];

  ngOnInit(): void {
    this.api.contexte().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: c => this.contexte = c, error: () => {} });
    this.choisirPeriode('mois');
  }

  choisirPeriode(p: Periode): void {
    this.periode = p;
    const a = new Date();
    const y = a.getFullYear(), m = a.getMonth();
    if (p === 'mois') { this.debut = isoJour(new Date(y, m, 1)); this.fin = isoJour(new Date(y, m + 1, 0)); }
    if (p === 'precedent') { this.debut = isoJour(new Date(y, m - 1, 1)); this.fin = isoJour(new Date(y, m, 0)); }
    if (p === 'trimestre') { this.debut = isoJour(new Date(y, m - 2, 1)); this.fin = isoJour(new Date(y, m + 1, 0)); }
    if (p === 'annee') { this.debut = isoJour(new Date(y, 0, 1)); this.fin = isoJour(new Date(y, 11, 31)); }
    if (p !== 'perso') this.charger();
  }

  charger(): void {
    if (!this.debut || !this.fin) return;
    this.chargement = true;
    this.api.statistiques({ debut: this.debut, fin: this.fin, agence: this.agence }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: s => { this.stats = s; this.chargement = false; this.erreur = null; },
      error: e => { this.erreur = messageErreur(e, 'Les statistiques n\'ont pas pu être chargées.'); this.chargement = false; },
    });
  }

  get plats() {
    const l = [...(this.stats?.par_plat ?? [])];
    return l.sort((a, b) => (Number(b[this.tri]) || 0) - (Number(a[this.tri]) || 0));
  }

  get maxCommandes(): number {
    return Math.max(1, ...(this.stats?.par_plat ?? []).map(p => p.commandes));
  }

  pct(n: number, max: number): number { return max ? Math.round(100 * n / max) : 0; }

  exporter(): void {
    const s = this.stats;
    if (!s) return;
    const lignes = [['Plat', 'Agences', 'Commandés', 'Servis', 'À servir', 'Non retirés', 'Annulés', 'Taux de retrait (%)', 'Note', 'Avis'],
      ...s.par_plat.map(p => [p.plat, p.agences.join(', '), p.commandes, p.servis, p.a_servir, p.non_retires, p.annulees, p.taux_retrait, p.note, p.nb_avis])];
    exporterExcel(nomFichier('statistiques-plats', s.debut, s.fin) + '.xlsx', [{ nom: 'Par plat', lignes }]);
  }
}
