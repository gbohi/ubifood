// Mon compte repas (tout employé) : solde du compte prépayé, repas du mois et leur
// règlement (débité du compte, payé à la caisse, retenu sur salaire, non couvert,
// à venir), reste à payer prévu à la clôture, mouvements du compte et reçus de caisse (PDF).
// API : GET compte-repas/?annee=&mois=, compte-repas/mouvements/, compte-repas/recus/,
// compte-repas/recus/<id>/pdf/?papier=ticket|a5.
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToastrService } from 'ngx-toastr';
import {
  CaisseService, ICONES_RECU, MonCompte, Mouvement, PapierRecu, Recu, STATUTS_REPAS, fcfa, jourFr, jourHeureFr, messageCaisse,
} from 'src/app/core/services/caisse/caisse.service';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

@Component({
  selector: 'app-mon-compte-repas',
  templateUrl: './mon-compte-repas.component.html',
})
export class MonCompteRepasComponent implements OnInit {
  private caisse = inject(CaisseService);
  private toastr = inject(ToastrService);
  private destroyRef = inject(DestroyRef);

  readonly fcfa = fcfa;
  readonly jour = jourFr;
  readonly jourHeure = jourHeureFr;
  readonly statuts = STATUTS_REPAS;
  readonly icones = ICONES_RECU;

  annee = new Date().getFullYear();
  mois = new Date().getMonth() + 1;
  compte: MonCompte | null = null;
  chargement = true;
  erreur: string | null = null;

  onglet: 'mouvements' | 'recus' = 'mouvements';
  mouvements: Mouvement[] = [];
  totalMouvements = 0;
  pageMouvements = 1;
  recus: Recu[] = [];
  totalRecus = 0;
  pageRecus = 1;
  telechargement: string | null = null;

  ngOnInit(): void {
    this.charger();
    this.chargerMouvements();
    this.chargerRecus();
  }

  charger(): void {
    this.chargement = true;
    this.caisse.monCompte(this.annee, this.mois).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: c => { this.compte = c; this.chargement = false; this.erreur = null; },
      error: e => { this.chargement = false; this.erreur = messageCaisse(e, 'Votre compte repas n\'a pas pu être chargé.'); },
    });
  }

  chargerMouvements(): void {
    this.caisse.mesMouvements(this.pageMouvements).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: p => { this.mouvements = p.results; this.totalMouvements = p.count; },
      error: () => { this.mouvements = []; },
    });
  }

  chargerRecus(): void {
    this.caisse.mesRecus(this.pageRecus).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: p => { this.recus = p.results; this.totalRecus = p.count; },
      error: () => { this.recus = []; },
    });
  }

  changerMois(delta: number): void {
    const d = new Date(this.annee, this.mois - 1 + delta, 1);
    this.annee = d.getFullYear();
    this.mois = d.getMonth() + 1;
    this.charger();
  }

  get estMoisCourant(): boolean {
    const n = new Date();
    return this.annee === n.getFullYear() && this.mois === n.getMonth() + 1;
  }

  get libelleMois(): string { return `${MOIS[this.mois - 1]} ${this.annee}`; }

  jourRepas(iso: string): string {
    return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  }

  pdf(r: Recu, papier: PapierRecu): void {
    if (this.telechargement) return;
    this.telechargement = `${r.id}-${papier}`;
    this.caisse.pdfRecu(r.id, papier, true).subscribe({
      next: b => { this.telechargement = null; this.caisse.enregistrer(b, this.caisse.nomFichier(r, papier)); },
      error: e => { this.telechargement = null; this.toastr.error(messageCaisse(e, 'PDF indisponible.'), 'Reçu'); },
    });
  }
}
