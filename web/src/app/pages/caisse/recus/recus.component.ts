// Reçus de caisse (comptabilité, administrateurs) : recherche par numéro, période,
// type et statut ; détail (repas régularisés, mouvements du compte) ; PDF ticket / A5 ;
// annulation motivée. Les refus du serveur (crédit déjà utilisé, reçu d'une clôture
// soumise, mois clôturé, son propre reçu…) sont affichés dans la fenêtre d'annulation.
// API : GET caisse/recus/, GET caisse/recus/<id>/, POST caisse/recus/<id>/annuler/.
import { Component, DestroyRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import {
  CaisseService, ICONES_RECU, PapierRecu, Recu, TypeRecu, fcfa, heureIso, jourFr, jourHeureFr, messageCaisse,
} from 'src/app/core/services/caisse/caisse.service';

@Component({
  selector: 'app-recus',
  templateUrl: './recus.component.html',
})
export class RecusComponent implements OnInit {
  private caisse = inject(CaisseService);
  private toastr = inject(ToastrService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  readonly fcfa = fcfa;
  readonly heure = heureIso;
  readonly jour = jourFr;
  readonly jourHeure = jourHeureFr;
  readonly icones = ICONES_RECU;
  readonly types: { cle: TypeRecu | ''; libelle: string }[] = [
    { cle: '', libelle: 'Tous' }, { cle: 'recharge', libelle: 'Recharges' },
    { cle: 'remboursement', libelle: 'Remboursements' },
    // Historique : la régularisation n'est plus proposée à la caisse (anciens reçus)
    { cle: 'regularisation', libelle: 'Régularisations (historique)' },
  ];

  q = '';
  type: TypeRecu | '' = '';
  statut: '' | 'valide' | 'annule' = '';
  dateDebut = '';
  dateFin = '';
  /** Filtre « reçus d'un employé » (depuis Comptes repas) */
  userId: number | null = null;
  userNom = '';

  recus: Recu[] = [];
  total = 0;
  page = 1;
  chargement = true;
  erreur: string | null = null;
  private recherche$ = new Subject<void>();
  telechargement: string | null = null;

  detail: Recu | null = null;
  chargementDetail = false;
  @ViewChild('detailModal') detailModal?: ModalDirective;

  aAnnuler: Recu | null = null;
  motif = '';
  envoi = false;
  erreurAnnulation: string | null = null;
  @ViewChild('annulerModal') annulerModal?: ModalDirective;

  ngOnInit(): void {
    const p = this.route.snapshot.queryParamMap;
    if (p.get('user')) { this.userId = Number(p.get('user')); this.userNom = p.get('nom') || ''; }
    if (p.get('q')) this.q = p.get('q')!;
    this.recherche$.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe(() => { this.page = 1; this.charger(); });
    this.charger();
  }

  charger(): void {
    this.chargement = true;
    this.caisse.recus({
      q: this.q.trim(), type: this.type, statut: this.statut, date_debut: this.dateDebut, date_fin: this.dateFin,
      user: this.userId, page: this.page,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: p => { this.recus = p.results; this.total = p.count; this.chargement = false; this.erreur = null; },
      error: e => { this.chargement = false; this.erreur = messageCaisse(e, 'Les reçus n\'ont pas pu être chargés.'); },
    });
  }

  rechercher(): void { this.recherche$.next(); }
  filtrer(): void { this.page = 1; this.charger(); }
  changerPage(p: number): void { this.page = p; this.charger(); }

  retirerEmploye(): void {
    this.userId = null;
    this.userNom = '';
    this.filtrer();
  }

  /** Raison pour laquelle « Annuler » n'est pas proposé (null = annulable a priori) */
  nonAnnulable(r: Recu): string | null {
    if (r.statut === 'annule') return 'Reçu déjà annulé.';
    if (r.verrouille) return 'Reçu inclus dans une clôture de caisse soumise ou validée : rejetez d\'abord la clôture.';
    return null;
  }

  ouvrirDetail(r: Recu): void {
    this.detail = r;
    this.chargementDetail = true;
    this.detailModal?.show();
    this.caisse.recu(r.id).subscribe({
      next: d => { this.detail = d; this.chargementDetail = false; },
      error: e => { this.chargementDetail = false; this.toastr.error(messageCaisse(e), 'Reçu'); },
    });
  }

  demanderAnnulation(r: Recu): void {
    this.detailModal?.hide();
    this.aAnnuler = r;
    this.motif = '';
    this.erreurAnnulation = null;
    this.annulerModal?.show();
  }

  annuler(): void {
    const r = this.aAnnuler;
    if (!r || this.envoi) return;
    if (!this.motif.trim()) { this.erreurAnnulation = 'Le motif de l\'annulation est obligatoire.'; return; }
    this.envoi = true;
    this.erreurAnnulation = null;
    this.caisse.annulerRecu(r.id, this.motif.trim()).subscribe({
      next: a => {
        this.envoi = false;
        this.annulerModal?.hide();
        this.toastr.success(`Reçu ${a.numero} annulé : ses effets sur le compte de ${a.employe.nom_prenom} sont défaits.`, 'Reçu annulé');
        this.charger();
      },
      error: e => { this.envoi = false; this.erreurAnnulation = messageCaisse(e, 'Annulation impossible.'); },
    });
  }

  effetAnnulation(r: Recu): string {
    switch (r.type) {
      case 'recharge': return `Le solde de ${r.employe.nom_prenom} diminuera de ${fcfa(r.montant)}.`;
      case 'regularisation': return `Les ${r.lignes?.length ?? ''} repas réglés passeront en retenue sur salaire à la clôture`
        + (r.monnaie_creditee && r.monnaie > 0 ? ` et la monnaie créditée (${fcfa(r.monnaie)}) sera reprise du compte.` : '.');
      default: return `Le solde remboursé (${fcfa(r.montant)}) sera rétabli sur le compte.`;
    }
  }

  pdf(r: Recu, papier: PapierRecu): void {
    if (this.telechargement) return;
    this.telechargement = `${r.id}-${papier}`;
    this.caisse.pdfRecu(r.id, papier).subscribe({
      next: b => { this.telechargement = null; this.caisse.enregistrer(b, this.caisse.nomFichier(r, papier)); },
      error: e => { this.telechargement = null; this.toastr.error(messageCaisse(e, 'PDF indisponible.'), 'Reçu'); },
    });
  }
}
