// src/app/pages/parametres/popup-connexion/popup-connexion.component.ts
//
// Image affichée dans une fenêtre juste après la connexion (web et mobile).
// Une seule image active à la fois : en activer une désactive les autres ;
// aucune active → pas de fenêtre. Réservé aux administrateurs.

import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { environment } from 'src/environments/environment';

interface PopupConnexion {
  id: number;
  titre: string;
  image_url: string | null;
  actif: boolean;
  updated_at: string;
}

@Component({
  selector: 'app-popup-connexion',
  templateUrl: './popup-connexion.component.html',
})
export class PopupConnexionComponent implements OnInit {

  breadCrumbItems = [
    { label: 'Paramètres', active: false },
    { label: 'Fenêtre de connexion', active: true },
  ];

  popups: PopupConnexion[] = [];
  isLoading = true;
  isSaving = false;
  enCours: number | null = null;          // id en cours d'activation / désactivation
  enEdition: PopupConnexion | null = null; // null + formulaireOuvert = création
  formulaireOuvert = false;
  aSupprimer: PopupConnexion | null = null;

  form!: UntypedFormGroup;
  nouvelleImage: File | null = null;
  apercu: string | null = null;
  erreurImage: string | null = null;

  private destroyRef = inject(DestroyRef);
  private url = `${environment.apiUrl}/api/api/popups-connexion/`;

  constructor(private http: HttpClient, private fb: UntypedFormBuilder, private toast: ToastrService) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      titre: ['', [Validators.required, Validators.maxLength(150)]],
      actif: [false],
    });
    this.charger();
  }

  get active(): PopupConnexion | undefined {
    return this.popups.find(p => p.actif);
  }

  charger(): void {
    this.isLoading = true;
    this.http.get<PopupConnexion[]>(this.url)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => { this.popups = data; this.isLoading = false; },
        error: err => { this.isLoading = false; this.toast.error(this.texte(err), 'Erreur'); },
      });
  }

  imageUrl(p: PopupConnexion | null): string | null {
    if (!p?.image_url) return null;
    return p.image_url.startsWith('http') ? p.image_url : `${environment.apiUrl}${p.image_url}`;
  }

  ouvrir(p: PopupConnexion | null): void {
    this.enEdition = p;
    this.formulaireOuvert = true;
    this.nouvelleImage = null;
    this.apercu = null;
    this.erreurImage = null;
    // Nouvelle image : active d'office s'il n'y en a aucune autre
    this.form.reset({ titre: p?.titre ?? '', actif: p?.actif ?? !this.active });
  }

  fermer(): void {
    this.formulaireOuvert = false;
    this.enEdition = null;
  }

  onImageChoisie(event: Event): void {
    const fichier = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.erreurImage = null;
    this.nouvelleImage = null;
    this.apercu = null;
    if (!fichier) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(fichier.type)) {
      this.erreurImage = "L'image doit être au format PNG, JPEG ou WebP.";
      return;
    }
    if (fichier.size > 5 * 1024 * 1024) {
      this.erreurImage = "L'image ne doit pas dépasser 5 Mo.";
      return;
    }
    this.nouvelleImage = fichier;
    const lecteur = new FileReader();
    lecteur.onload = () => { if (this.nouvelleImage === fichier) this.apercu = lecteur.result as string; };
    lecteur.readAsDataURL(fichier);
  }

  enregistrer(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (!this.enEdition && !this.nouvelleImage) { this.erreurImage = 'Choisissez une image.'; return; }
    if (this.isSaving) return;
    const v = this.form.value;
    const donnees = new FormData();
    donnees.append('titre', v.titre);
    donnees.append('actif', v.actif ? 'true' : 'false');
    if (this.nouvelleImage) donnees.append('image', this.nouvelleImage);

    const requete = this.enEdition
      ? this.http.patch<PopupConnexion>(`${this.url}${this.enEdition.id}/`, donnees)
      : this.http.post<PopupConnexion>(this.url, donnees);
    this.isSaving = true;
    requete.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.isSaving = false;
        this.toast.success(this.enEdition ? 'Image modifiée.' : 'Image ajoutée.', 'Succès');
        this.fermer();
        this.charger();
      },
      error: err => { this.isSaving = false; this.toast.error(this.texte(err), 'Erreur'); },
    });
  }

  /** Activer celle-ci (les autres sont désactivées par le serveur) ou la désactiver. */
  basculerActif(p: PopupConnexion): void {
    if (this.enCours) return;
    const donnees = new FormData();
    donnees.append('actif', p.actif ? 'false' : 'true');
    this.enCours = p.id;
    this.http.patch<PopupConnexion>(`${this.url}${p.id}/`, donnees)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: maj => {
          this.enCours = null;
          this.toast.success(maj.actif
            ? 'Cette image s\'affichera après la connexion.'
            : 'Image désactivée : aucune fenêtre ne s\'affichera.', 'Succès');
          this.charger();
        },
        error: err => { this.enCours = null; this.toast.error(this.texte(err), 'Erreur'); },
      });
  }

  supprimer(): void {
    const p = this.aSupprimer;
    if (!p) return;
    this.http.delete(`${this.url}${p.id}/`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.aSupprimer = null;
          this.toast.success('Image supprimée.', 'Succès');
          this.charger();
        },
        error: err => this.toast.error(this.texte(err), 'Erreur'),
      });
  }

  private texte(err: any): string {
    return typeof err === 'string' ? err : 'Une erreur est survenue.';
  }
}
