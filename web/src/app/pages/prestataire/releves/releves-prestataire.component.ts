// Relevés du prestataire (étape 1 : lecture seule) : un relevé par mois,
// provisoire tant que le mois n'est pas clôturé par UbiPharm, PDF téléchargeable.
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToastrService } from 'ngx-toastr';
import { nomFichier } from 'src/app/core/helpers/exports';
import {
  ContextePresta, EspacePrestataireService, ReleveMois, messageErreur, montantFr, nombreFr,
} from 'src/app/core/services/espace-prestataire/espace-prestataire.service';

@Component({
  selector: 'app-releves-prestataire',
  templateUrl: './releves-prestataire.component.html',
})
export class RelevesPrestataireComponent implements OnInit {
  private api = inject(EspacePrestataireService);
  private toastr = inject(ToastrService);
  private destroyRef = inject(DestroyRef);

  contexte: ContextePresta | null = null;
  releves: ReleveMois[] = [];
  nbMois = 12;
  chargement = true;
  erreur: string | null = null;
  telechargement: string | null = null;

  readonly nombreFr = nombreFr;
  readonly montantFr = montantFr;

  ngOnInit(): void {
    this.api.contexte().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: c => this.contexte = c, error: () => {} });
    this.charger();
  }

  charger(): void {
    this.chargement = true;
    this.api.releves(this.nbMois).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => { this.releves = r ?? []; this.chargement = false; this.erreur = null; },
      error: e => { this.erreur = messageErreur(e, 'Les relevés n\'ont pas pu être chargés.'); this.chargement = false; },
    });
  }

  get totalRepas(): number { return this.releves.reduce((s, r) => s + (r.nb_repas || 0), 0); }
  get totalClotures(): number { return this.releves.filter(r => r.etat === 'cloture').reduce((s, r) => s + (r.montant || 0), 0); }
  get totalProvisoire(): number { return this.releves.filter(r => r.etat !== 'cloture').reduce((s, r) => s + (r.montant || 0), 0); }

  etat(r: ReleveMois): { libelle: string; classe: string; icone: string } {
    switch (r.etat) {
      case 'cloture': return { libelle: 'Clôturé · officiel', classe: 't-ve', icone: 'ri-lock-line' };
      case 'a_cloturer': return { libelle: 'À clôturer par UbiPharm', classe: 't-or', icone: 'ri-time-line' };
      default: return { libelle: 'En cours · provisoire', classe: 't-bl', icone: 'ri-loader-2-line' };
    }
  }

  cle(r: ReleveMois): string { return `${r.annee}-${r.mois}`; }

  telecharger(r: ReleveMois): void {
    const id = this.contexte?.prestataire?.id;
    if (!id || this.telechargement) return;
    this.telechargement = this.cle(r);
    this.api.relevePdf(id, r.annee, r.mois).subscribe({
      next: blob => {
        this.telechargement = null;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomFichier('releve', r.numero || `${r.annee}-${String(r.mois).padStart(2, '0')}`,
          r.etat === 'cloture' ? '' : 'provisoire') + '.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: e => { this.telechargement = null; this.toastr.error(messageErreur(e, 'Le PDF n\'a pas pu être téléchargé.'), 'Relevé'); },
    });
  }
}
