// Clôtures de caisse à valider (comptabilité, administrateurs) : liste par statut,
// détail des reçus d'une clôture, validation (commentaire facultatif) ou rejet
// (commentaire obligatoire : les reçus sont libérés, le caissier recompte).
// Personne ne traite sa propre clôture (refus 403 du serveur affiché tel quel).
// API : GET caisse/clotures/?statut=, GET caisse/clotures/<id>/, POST …/valider|rejeter/.
import { Component, DestroyRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import {
  CaisseService, ClotureCaisse, ICONES_RECU, STATUTS_CLOTURE, StatutCloture, fcfa, heureIso, jourFr, jourHeureFr, messageCaisse,
} from 'src/app/core/services/caisse/caisse.service';

@Component({
  selector: 'app-validation-clotures',
  templateUrl: './validation-clotures.component.html',
})
export class ValidationCloturesComponent implements OnInit {
  private caisse = inject(CaisseService);
  private toastr = inject(ToastrService);
  private destroyRef = inject(DestroyRef);

  readonly fcfa = fcfa;
  readonly heure = heureIso;
  readonly jour = jourFr;
  readonly jourHeure = jourHeureFr;
  readonly statuts = STATUTS_CLOTURE;
  readonly icones = ICONES_RECU;
  readonly filtres: { cle: StatutCloture | ''; libelle: string }[] = [
    { cle: 'soumise', libelle: 'À valider' }, { cle: 'validee', libelle: 'Validées' },
    { cle: 'rejetee', libelle: 'Rejetées' }, { cle: '', libelle: 'Toutes' },
  ];

  statut: StatutCloture | '' = 'soumise';
  clotures: ClotureCaisse[] = [];
  total = 0;
  nbAValider: number | null = null;
  page = 1;
  chargement = true;
  erreur: string | null = null;

  ouverte: ClotureCaisse | null = null;
  chargementDetail = false;

  aTraiter: ClotureCaisse | null = null;
  valider = true;
  commentaire = '';
  envoi = false;
  erreurTraitement: string | null = null;
  @ViewChild('traiterModal') traiterModal?: ModalDirective;

  ngOnInit(): void {
    this.charger();
  }

  charger(): void {
    this.chargement = true;
    this.caisse.clotures({ statut: this.statut, page: this.page }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: p => {
        this.clotures = p.results;
        this.total = p.count;
        this.chargement = false;
        this.erreur = null;
        if (this.statut === 'soumise') this.nbAValider = p.count;
      },
      error: e => { this.chargement = false; this.erreur = messageCaisse(e, 'Les clôtures n\'ont pas pu être chargées.'); },
    });
    if (this.statut !== 'soumise') {
      this.caisse.clotures({ statut: 'soumise', page_size: 1 }).subscribe({ next: p => this.nbAValider = p.count, error: () => {} });
    }
  }

  choisirStatut(s: StatutCloture | ''): void {
    this.statut = s;
    this.page = 1;
    this.ouverte = null;
    this.charger();
  }

  changerPage(p: number): void { this.page = p; this.charger(); }

  basculer(c: ClotureCaisse): void {
    if (this.ouverte?.id === c.id) { this.ouverte = null; return; }
    this.ouverte = c;
    this.chargementDetail = true;
    this.caisse.cloture(c.id).subscribe({
      next: d => { if (this.ouverte?.id === c.id) this.ouverte = d; this.chargementDetail = false; },
      error: e => { this.chargementDetail = false; this.toastr.error(messageCaisse(e), 'Détail'); },
    });
  }

  demander(c: ClotureCaisse, valider: boolean): void {
    this.aTraiter = c;
    this.valider = valider;
    this.commentaire = '';
    this.erreurTraitement = null;
    this.traiterModal?.show();
  }

  confirmer(): void {
    const c = this.aTraiter;
    if (!c || this.envoi) return;
    if (!this.valider && !this.commentaire.trim()) {
      this.erreurTraitement = 'Le commentaire est obligatoire pour rejeter une clôture.';
      return;
    }
    this.envoi = true;
    this.erreurTraitement = null;
    this.caisse.traiterCloture(c.id, this.valider, this.commentaire.trim()).subscribe({
      next: r => {
        this.envoi = false;
        this.traiterModal?.hide();
        this.toastr.success(this.valider
          ? `Clôture de ${r.caissier_nom} du ${jourFr(r.jour)} validée.`
          : `Clôture de ${r.caissier_nom} rejetée : ses reçus sont libérés, il doit recompter et soumettre une nouvelle clôture.`,
          this.valider ? 'Clôture validée' : 'Clôture rejetée');
        this.ouverte = null;
        this.charger();
      },
      // Refus affichés dans la fenêtre (ex. « Vous ne pouvez pas valider ou rejeter votre propre clôture »)
      error: e => { this.envoi = false; this.erreurTraitement = messageCaisse(e); },
    });
  }
}
