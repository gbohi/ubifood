// À préparer (maquette « espace-presta-3-preparer-comptoir », partie gauche) :
// quantités jour × plat × agence, état provisoire / figé, semaine en cours,
// aperçu de la liste nominative du jour et fiche de production A4 imprimable
// (window.print + feuille d'impression : _espace-prestataire.scss, .ep-fiche-print).
import { Component, DestroyRef, OnDestroy, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Cellule, exporterExcel, nomFichier } from 'src/app/core/helpers/exports';
import {
  APreparer, AgencePresta, ContextePresta, EspacePrestataireService, JourAPreparer, ListeDuJour,
  ajouterJours, isoJour, messageErreur, montantFr, nombreFr, versDate, JOURS_FR, MOIS_FR,
} from 'src/app/core/services/espace-prestataire/espace-prestataire.service';

@Component({
  selector: 'app-a-preparer',
  templateUrl: './a-preparer.component.html',
})
export class APreparerComponent implements OnInit, OnDestroy {
  private api = inject(EspacePrestataireService);
  private destroyRef = inject(DestroyRef);

  contexte: ContextePresta | null = null;
  aujourdhui = isoJour(new Date());
  debut = this.aujourdhui;
  nbJours = 3;
  agence: number | '' = '';

  donnees: APreparer | null = null;
  chargement = true;
  erreur: string | null = null;

  liste: ListeDuJour | null = null;
  listeComplete = false;

  /** Jour imprimé sur la fiche de production */
  jourFiche: JourAPreparer | null = null;
  maintenant = new Date();

  readonly nombreFr = nombreFr;
  readonly montantFr = montantFr;

  ngOnInit(): void {
    this.api.contexte().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: c => this.contexte = c, error: () => {} });
    this.charger();
    this.api.listeDuJour({ date: this.aujourdhui }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: l => this.liste = l, error: () => this.liste = null });
  }

  ngOnDestroy(): void {
    document.body.classList.remove('ep-impression');
  }

  charger(): void {
    this.chargement = true;
    this.api.aPreparer({ date_debut: this.debut, date_fin: ajouterJours(this.debut, this.nbJours - 1), agence: this.agence })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: d => { this.donnees = d; this.chargement = false; this.erreur = null; },
        error: e => { this.erreur = messageErreur(e, 'Les quantités n\'ont pas pu être chargées.'); this.chargement = false; },
      });
  }

  decaler(n: number): void {
    this.debut = ajouterJours(this.debut, n * this.nbJours);
    this.charger();
  }

  get titrePeriode(): string {
    const d = versDate(this.debut);
    const f = versDate(ajouterJours(this.debut, this.nbJours - 1));
    const moisD = d.getMonth() !== f.getMonth() ? ` ${MOIS_FR[d.getMonth()]}` : '';
    return `Du ${d.getDate()}${moisD} au ${f.getDate()} ${MOIS_FR[f.getMonth()]} ${f.getFullYear()}`;
  }

  /** Agences en colonnes (filtrées si une agence est choisie) */
  get agences(): AgencePresta[] {
    const a = this.donnees?.agences ?? [];
    return this.agence ? a.filter(x => x.id === Number(this.agence)) : a;
  }

  qte(m: Record<string, number> | undefined, agenceId: number): number {
    return m?.[String(agenceId)] ?? 0;
  }

  etat(j: JourAPreparer): { libelle: string; classe: string; icone: string } {
    switch (j.etat) {
      case 'en_service': return { libelle: 'Aujourd\'hui · en service', classe: 't-ve', icone: 'ri-checkbox-blank-circle-fill' };
      case 'provisoire': return { libelle: `Provisoire · figé ${this.heureLimite(j)}`, classe: 't-or', icone: 'ri-time-line' };
      case 'fige': return { libelle: 'Figé · définitif', classe: 't-bl', icone: 'ri-lock-line' };
      case 'passe': return { libelle: 'Passé', classe: 't-gr', icone: 'ri-history-line' };
      default: return { libelle: 'Commandes ouvertes · estimation', classe: 't-gr', icone: 'ri-loader-2-line' };
    }
  }

  /** « à 16:00 » / « à minuit » */
  heureLimite(j: JourAPreparer): string {
    const m = /à (\d{2}:\d{2}|minuit)$/.exec(j.libelle_limite ?? '');
    return m ? `à ${m[1]}` : '';
  }

  /** Prochain jour figé ou provisoire (alerte « se fige à ») */
  get prochainProvisoire(): JourAPreparer | null {
    return this.donnees?.jours.find(j => j.etat === 'provisoire') ?? null;
  }

  // ── Liste nominative (aperçu) ───────────────────────────────
  get lignesListe() {
    const l = this.liste?.lignes ?? [];
    return this.listeComplete ? l : l.slice(0, 8);
  }

  statutListe(s: string): { libelle: string; classe: string } {
    if (s === 'retire') return { libelle: 'Retiré', classe: 't-ve' };
    if (s === 'non_retire') return { libelle: 'Non retiré', classe: 't-gr' };
    return { libelle: 'À servir', classe: 't-or' };
  }

  // ── Fiche de production ─────────────────────────────────────
  /** Jour proposé par défaut : le prochain jour à produire (sinon le premier) */
  get jourParDefaut(): JourAPreparer | null {
    const j = this.donnees?.jours ?? [];
    return j.find(x => x.etat === 'provisoire' || x.etat === 'fige' || x.etat === 'ouvert')
      ?? j.find(x => x.etat === 'en_service') ?? j[0] ?? null;
  }

  imprimer(j: JourAPreparer | null = this.jourParDefaut): void {
    if (!j) return;
    this.jourFiche = j;
    this.maintenant = new Date();
    document.body.classList.add('ep-impression');
    // Laisser Angular afficher la fiche avant d'ouvrir la boîte d'impression
    setTimeout(() => {
      window.print();
      document.body.classList.remove('ep-impression');
    }, 50);
  }

  /** Agences ayant des commandes ce jour-là (sections de la fiche) */
  agencesFiche(j: JourAPreparer): AgencePresta[] {
    return this.agences.filter(a => this.qte(j.totaux_par_agence, a.id) > 0);
  }

  platsAgence(j: JourAPreparer, a: AgencePresta) {
    return j.plats.filter(p => this.qte(p.par_agence, a.id) > 0);
  }

  libelleJourLong(iso: string): string {
    const d = versDate(iso);
    return `${JOURS_FR[d.getDay()]} ${d.getDate()} ${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`;
  }

  get editeLe(): string {
    const d = this.maintenant;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} à ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // ── Export Excel ────────────────────────────────────────────
  exporter(): void {
    const d = this.donnees;
    if (!d) return;
    const ag = this.agences;
    const lignes: Cellule[][] = [['Jour', 'État', 'Plat', ...ag.map(a => a.nom), 'Total']];
    for (const j of d.jours) {
      for (const p of j.plats) lignes.push([j.libelle, this.etat(j).libelle, p.plat, ...ag.map(a => this.qte(p.par_agence, a.id)), p.total]);
      lignes.push([j.libelle, '', 'Total', ...ag.map(a => this.qte(j.totaux_par_agence, a.id)), j.total]);
    }
    exporterExcel(nomFichier('a-preparer', d.date_debut, d.date_fin) + '.xlsx',
      [{ nom: 'À préparer', lignes, largeurs: [16, 30, 26, ...ag.map(() => 12), 10] }]);
  }
}
