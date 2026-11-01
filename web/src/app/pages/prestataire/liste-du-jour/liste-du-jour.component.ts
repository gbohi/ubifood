// Liste nominative du jour : nom, matricule, plat, statut (rien d'autre).
// Responsable : toute date ; agent de comptoir : aujourd'hui seulement.
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { estAgentComptoir } from 'src/app/core/helpers/roles';
import {
  ContextePresta, EspacePrestataireService, ListeDuJour, isoJour, messageErreur, nombreFr, versDate, JOURS_FR, MOIS_FR,
} from 'src/app/core/services/espace-prestataire/espace-prestataire.service';

@Component({
  selector: 'app-liste-du-jour',
  templateUrl: './liste-du-jour.component.html',
})
export class ListeDuJourComponent implements OnInit {
  private api = inject(EspacePrestataireService);
  private destroyRef = inject(DestroyRef);
  readonly agent = estAgentComptoir(inject(TokenStorageService).getUser());

  contexte: ContextePresta | null = null;
  aujourdhui = isoJour(new Date());
  date = this.aujourdhui;
  agence: number | '' = '';
  statut = '';
  recherche = '';
  private recherche$ = new Subject<string>();

  liste: ListeDuJour | null = null;
  chargement = true;
  erreur: string | null = null;

  readonly nombreFr = nombreFr;
  readonly statuts = [
    { cle: '', libelle: 'Tous' },
    { cle: 'a_servir', libelle: 'À servir' },
    { cle: 'retire', libelle: 'Retirés' },
    { cle: 'non_retire', libelle: 'Non retirés' },
  ];

  ngOnInit(): void {
    this.api.contexte().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: c => this.contexte = c, error: () => {} });
    this.recherche$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.charger());
    this.charger();
  }

  charger(): void {
    this.chargement = true;
    this.api.listeDuJour({ date: this.date, agence: this.agence, statut: this.statut, search: this.recherche.trim() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: l => { this.liste = l; this.chargement = false; this.erreur = null; },
        error: e => { this.liste = null; this.erreur = messageErreur(e, 'La liste n\'a pas pu être chargée.'); this.chargement = false; },
      });
  }

  rechercher(): void { this.recherche$.next(this.recherche); }

  choisirStatut(s: string): void { this.statut = s; this.charger(); }

  get titreDate(): string {
    const d = versDate(this.date);
    return `${JOURS_FR[d.getDay()]} ${d.getDate()} ${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`;
  }

  statutLigne(s: string): { libelle: string; classe: string } {
    if (s === 'retire') return { libelle: 'Retiré', classe: 't-ve' };
    if (s === 'non_retire') return { libelle: 'Non retiré', classe: 't-gr' };
    return { libelle: 'À servir', classe: 't-or' };
  }

  imprimer(): void { window.print(); }
}
