// Mon profil prestataire : ce que les employés voient dans le parcours de
// commande (logo, photo de couverture, nom affiché, description, cuisine, mots-clés).
import { Component, DestroyRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ParcoursCommandeService, ProfilPrestataire } from 'src/app/core/services/commande/parcours-commande.service';
import { ProfilPrestataireEditeurComponent } from 'src/app/shared/profil-prestataire/profil-prestataire-editeur.component';

@Component({
  selector: 'app-profil-prestataire',
  templateUrl: './profil-prestataire.component.html',
})
export class ProfilPrestataireComponent implements OnInit {
  private parcours = inject(ParcoursCommandeService);
  private destroyRef = inject(DestroyRef);

  @ViewChild(ProfilPrestataireEditeurComponent) editeur?: ProfilPrestataireEditeurComponent;

  profil: ProfilPrestataire | null = null;
  chargement = true;
  enregistrement = false;
  erreur: string | null = null;
  message: string | null = null;

  ngOnInit(): void {
    this.parcours.monProfil().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: p => { this.profil = p; this.chargement = false; },
      error: e => { this.erreur = typeof e === 'string' ? e : 'Le profil n\'a pas pu être chargé.'; this.chargement = false; },
    });
  }

  enregistrer(): void {
    const ed = this.editeur;
    if (!ed || !ed.valide || this.enregistrement) return;
    this.enregistrement = true;
    this.erreur = null;
    this.message = null;
    this.parcours.enregistrerMonProfil(ed.formData()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: p => {
        this.profil = p;
        this.enregistrement = false;
        this.message = 'Profil enregistré : les employés voient maintenant ces informations.';
      },
      error: e => {
        this.enregistrement = false;
        this.erreur = typeof e === 'string' ? e : 'Enregistrement impossible.';
      },
    });
  }

  get noteFr(): string {
    const n = this.profil?.note;
    return n == null ? '' : n.toFixed(1).replace('.', ',');
  }

  annuler(): void {
    this.editeur?.reinitialiser();
    this.message = null;
    this.erreur = null;
  }
}
