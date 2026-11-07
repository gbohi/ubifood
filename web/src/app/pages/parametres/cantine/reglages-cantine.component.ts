// src/app/pages/parametres/cantine/reglages-cantine.component.ts
//
// Réglages de la cantine accessibles aux gestionnaires : nombre d'avis minimum
// avant d'afficher la note d'un prestataire ou d'un plat (sinon « Nouveau »).
// Les délais de commande / d'annulation sont rappelés en lecture : seuls les
// administrateurs les modifient (Paramètres → Société).

import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { ADMINS, aUnRole } from 'src/app/core/helpers/roles';
import { ParametresCantine, ParcoursCommandeService } from 'src/app/core/services/commande/parcours-commande.service';

@Component({
  selector: 'app-reglages-cantine',
  templateUrl: './reglages-cantine.component.html',
})
export class ReglagesCantineComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly parcours = inject(ParcoursCommandeService);
  private readonly tokenStorage = inject(TokenStorageService);

  estAdmin = false;
  parametres: ParametresCantine | null = null;
  seuil: number | null = null;
  isLoading = true;
  isSaving = false;
  message: string | null = null;
  erreur: string | null = null;

  ngOnInit(): void {
    this.estAdmin = aUnRole(this.tokenStorage.getUser(), ADMINS);
    this.parcours.parametresCantine().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: p => { this.appliquer(p); this.isLoading = false; },
      error: err => { this.isLoading = false; this.erreur = typeof err === 'string' ? err : 'Chargement impossible'; },
    });
  }

  get seuilValide(): boolean {
    const v = Number(this.seuil);
    return this.seuil !== null && (this.seuil as any) !== '' && Number.isInteger(v) && v >= 0 && v <= 1000;
  }

  get modifie(): boolean {
    return this.parametres != null && Number(this.seuil) !== this.parametres.seuil_avis_note;
  }

  /** « 48 h avant le jour du menu (menu du mercredi : jusqu'au dimanche à minuit) » */
  delai(heures?: number): string {
    if (heures == null) return '—';
    if (heures === 0) return 'jusqu\'à la veille à minuit';
    return heures % 24 === 0
      ? `${heures} h avant le jour du menu (jusqu'à ${heures / 24 + 1} jours avant, à minuit)`
      : `${heures} h avant le jour du menu`;
  }

  enregistrer(): void {
    if (!this.seuilValide || this.isSaving) return;
    this.isSaving = true;
    this.message = null;
    this.erreur = null;
    this.parcours.changerSeuilAvis(Number(this.seuil)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: p => {
        this.isSaving = false;
        this.appliquer(p);
        this.message = p.seuil_avis_note === 0
          ? 'Enregistré : la note est affichée dès le premier avis.'
          : `Enregistré : la note s'affiche à partir de ${p.seuil_avis_note} avis.`;
      },
      error: err => { this.isSaving = false; this.erreur = typeof err === 'string' ? err : 'Enregistrement impossible'; },
    });
  }

  private appliquer(p: ParametresCantine): void {
    this.parametres = p;
    this.seuil = p.seuil_avis_note;
  }
}
