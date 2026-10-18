// src/app/pages/parametres/bannieres/bannieres.component.ts
//
// Bannières de l'écran d'accueil de l'application mobile : image, ordre,
// activation et période d'affichage facultative. Réservé aux administrateurs.

import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { environment } from 'src/environments/environment';

interface Banniere {
  id: number;
  titre: string;
  image_url: string | null;
  ordre: number;
  actif: boolean;
  date_debut: string | null;
  date_fin: string | null;
}

@Component({
  selector: 'app-bannieres',
  templateUrl: './bannieres.component.html',
})
export class BannieresComponent implements OnInit {

  breadCrumbItems = [
    { label: 'Paramètres', active: false },
    { label: 'Bannières (accueil mobile)', active: true },
  ];

  bannieres: Banniere[] = [];
  isLoading = true;
  isSaving = false;
  enEdition: Banniere | null = null;   // null + formulaireOuvert = création
  formulaireOuvert = false;
  aSupprimer: Banniere | null = null;

  form!: UntypedFormGroup;
  nouvelleImage: File | null = null;
  apercu: string | null = null;
  erreurImage: string | null = null;

  private destroyRef = inject(DestroyRef);
  private url = `${environment.apiUrl}/api/api/bannieres/`;

  constructor(private http: HttpClient, private fb: UntypedFormBuilder, private toast: ToastrService) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      titre:      ['', [Validators.required, Validators.maxLength(150)]],
      ordre:      [0, [Validators.min(0)]],
      actif:      [true],
      date_debut: [''],
      date_fin:   [''],
    });
    this.charger();
  }

  charger(): void {
    this.isLoading = true;
    this.http.get<Banniere[]>(`${this.url}?toutes=1`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => { this.bannieres = data; this.isLoading = false; },
        error: err => { this.isLoading = false; this.toast.error(this.texte(err), 'Erreur'); },
      });
  }

  imageUrl(b: Banniere | null): string | null {
    if (!b?.image_url) return null;
    return b.image_url.startsWith('http') ? b.image_url : `${environment.apiUrl}${b.image_url}`;
  }

  /** Affichée aujourd'hui sur l'application ? */
  estVisible(b: Banniere): boolean {
    const jour = new Date().toISOString().slice(0, 10);
    return b.actif && (!b.date_debut || b.date_debut <= jour) && (!b.date_fin || b.date_fin >= jour);
  }

  ouvrir(b: Banniere | null): void {
    this.enEdition = b;
    this.formulaireOuvert = true;
    this.nouvelleImage = null;
    this.apercu = null;
    this.erreurImage = null;
    this.form.reset({
      titre: b?.titre ?? '',
      ordre: b?.ordre ?? (this.bannieres.length ? Math.max(...this.bannieres.map(x => x.ordre)) + 1 : 0),
      actif: b?.actif ?? true,
      date_debut: b?.date_debut ?? '',
      date_fin: b?.date_fin ?? '',
    });
  }

  fermer(): void {
    this.formulaireOuvert = false;
    this.enEdition = null;
  }

  onImageChoisie(event: Event): void {
    const fichier = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.erreurImage = null;
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
    lecteur.onload = () => this.apercu = lecteur.result as string;
    lecteur.readAsDataURL(fichier);
  }

  enregistrer(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (!this.enEdition && !this.nouvelleImage) { this.erreurImage = 'Choisissez une image.'; return; }
    const v = this.form.value;
    const donnees = new FormData();
    donnees.append('titre', v.titre);
    donnees.append('ordre', String(v.ordre ?? 0));
    donnees.append('actif', v.actif ? 'true' : 'false');
    donnees.append('date_debut', v.date_debut || '');
    donnees.append('date_fin', v.date_fin || '');
    if (this.nouvelleImage) donnees.append('image', this.nouvelleImage);

    const requete = this.enEdition
      ? this.http.patch<Banniere>(`${this.url}${this.enEdition.id}/`, donnees)
      : this.http.post<Banniere>(this.url, donnees);
    this.isSaving = true;
    requete.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.isSaving = false;
        this.toast.success(this.enEdition ? 'Bannière modifiée.' : 'Bannière ajoutée.', 'Succès');
        this.fermer();
        this.charger();
      },
      error: err => { this.isSaving = false; this.toast.error(this.texte(err), 'Erreur'); },
    });
  }

  basculerActif(b: Banniere): void {
    const donnees = new FormData();
    donnees.append('actif', b.actif ? 'false' : 'true');
    this.http.patch<Banniere>(`${this.url}${b.id}/`, donnees)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: maj => { b.actif = maj.actif; },
        error: err => this.toast.error(this.texte(err), 'Erreur'),
      });
  }

  supprimer(): void {
    const b = this.aSupprimer;
    if (!b) return;
    this.http.delete(`${this.url}${b.id}/`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.aSupprimer = null;
          this.toast.success('Bannière supprimée.', 'Succès');
          this.charger();
        },
        error: err => this.toast.error(this.texte(err), 'Erreur'),
      });
  }

  formatDate(d: string | null): string {
    if (!d) return '';
    const [y, m, j] = d.split('-');
    return `${j}/${m}/${y}`;
  }

  private texte(err: any): string {
    return typeof err === 'string' ? err : 'Une erreur est survenue.';
  }
}
