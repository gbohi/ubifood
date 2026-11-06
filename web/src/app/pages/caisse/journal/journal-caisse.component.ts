// Journal de caisse d'une journée : reçus (n°, heure, employé, type, montant, mode,
// statut), totaux par type et par caissier, clôtures du jour, PDF A4.
// Caissier : son propre journal ; comptabilité / administrateurs : tous les caissiers
// (ou un seul). API : GET caisse/journal/?date=&caissier=, caisse/journal/pdf/.
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { estComptable } from 'src/app/core/helpers/roles';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import {
  CaisseService, ICONES_RECU, JournalCaisse, PapierRecu, Recu, STATUTS_CLOTURE, aujourdhuiIso, fcfa, heureIso, jourHeureFr, messageCaisse,
} from 'src/app/core/services/caisse/caisse.service';

@Component({
  selector: 'app-journal-caisse',
  templateUrl: './journal-caisse.component.html',
})
export class JournalCaisseComponent implements OnInit {
  private caisse = inject(CaisseService);
  private toastr = inject(ToastrService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly fcfa = fcfa;
  readonly heure = heureIso;
  readonly jourHeure = jourHeureFr;
  readonly icones = ICONES_RECU;
  readonly statutsCloture = STATUTS_CLOTURE;
  /** Comptabilité : tous les caissiers, filtre par caissier */
  readonly tousLesCaissiers = estComptable(inject(TokenStorageService).getUser());

  date = aujourdhuiIso();
  caissier: number | '' = '';
  /** Caissiers connus (journal « tous » de la journée) pour le filtre */
  caissiers: { caissier_id: number; caissier_nom: string }[] = [];
  journal: JournalCaisse | null = null;
  chargement = true;
  erreur: string | null = null;
  telechargement: string | null = null;

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    if (q.get('date')) this.date = q.get('date')!;
    if (q.get('caissier')) this.caissier = Number(q.get('caissier'));
    this.charger();
  }

  charger(): void {
    this.chargement = true;
    this.router.navigate([], { queryParams: { date: this.date, caissier: this.caissier || null }, replaceUrl: true });
    this.caisse.journal(this.date, this.caissier || null).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: j => {
        this.journal = j;
        this.chargement = false;
        this.erreur = null;
        if (!this.caissier) this.caissiers = j.par_caissier.map(c => ({ caissier_id: c.caissier_id, caissier_nom: c.caissier_nom }));
        else if (!this.caissiers.some(c => c.caissier_id === this.caissier)) {
          const c = j.par_caissier[0];
          if (c) this.caissiers = [...this.caissiers, c];
        }
      },
      error: e => { this.chargement = false; this.erreur = messageCaisse(e, 'Le journal n\'a pas pu être chargé.'); },
    });
  }

  decaler(jours: number): void {
    const [y, m, d] = this.date.split('-').map(Number);
    const dt = new Date(y, m - 1, d + jours);
    this.date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    this.charger();
  }

  get estAujourdhui(): boolean { return this.date === aujourdhuiIso(); }

  get titreJour(): string {
    return new Date(this.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  get totalEncaisse(): number {
    return (this.journal?.recus ?? []).filter(r => r.statut === 'valide').reduce((s, r) => s + r.encaissement, 0);
  }

  pdfJournal(): void {
    if (this.telechargement) return;
    this.telechargement = 'journal';
    this.caisse.journalPdf(this.date, this.caissier || null).subscribe({
      next: b => { this.telechargement = null; this.caisse.enregistrer(b, `journal-caisse-${this.date}.pdf`); },
      error: e => { this.telechargement = null; this.toastr.error(messageCaisse(e, 'PDF indisponible.'), 'Journal'); },
    });
  }

  pdfRecu(r: Recu, papier: PapierRecu): void {
    if (this.telechargement) return;
    this.telechargement = `${r.id}-${papier}`;
    this.caisse.pdfRecu(r.id, papier).subscribe({
      next: b => { this.telechargement = null; this.caisse.enregistrer(b, this.caisse.nomFichier(r, papier)); },
      error: e => { this.telechargement = null; this.toastr.error(messageCaisse(e, 'PDF indisponible.'), 'Reçu'); },
    });
  }
}
