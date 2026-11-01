// Mon équipe : comptes du prestataire (créés et désactivés par UbiPharm), lecture seule.
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  EspacePrestataireService, MembreEquipe, couleur, initiales, messageErreur, nombreFr,
} from 'src/app/core/services/espace-prestataire/espace-prestataire.service';

@Component({
  selector: 'app-equipe-prestataire',
  templateUrl: './equipe.component.html',
})
export class EquipeComponent implements OnInit {
  private api = inject(EspacePrestataireService);
  private destroyRef = inject(DestroyRef);

  membres: MembreEquipe[] = [];
  chargement = true;
  erreur: string | null = null;

  readonly initiales = initiales;
  readonly couleur = couleur;
  readonly nombreFr = nombreFr;

  ngOnInit(): void {
    this.api.equipe().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: m => { this.membres = m ?? []; this.chargement = false; },
      error: e => { this.erreur = messageErreur(e, 'L\'équipe n\'a pas pu être chargée.'); this.chargement = false; },
    });
  }

  get actifs(): number { return this.membres.filter(m => m.is_active).length; }
  get retraitsJour(): number { return this.membres.reduce((s, m) => s + (m.retraits_aujourdhui || 0), 0); }
}
