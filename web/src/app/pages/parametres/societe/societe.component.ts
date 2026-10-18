// src/app/pages/parametres/societe/societe.component.ts
//
// Paramètres de la société : en-tête des factures PDF (nom, adresse,
// identifiants légaux, logo, mentions de bas de page). Modifiables à tout
// moment par un administrateur ; les factures téléchargées ensuite
// utilisent les nouvelles valeurs (les montants, eux, restent figés).

import { Component, OnInit, DestroyRef, ElementRef, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-societe',
  templateUrl: './societe.component.html',
})
export class SocieteComponent implements OnInit {

  breadCrumbItems = [
    { label: 'Paramètres', active: false },
    { label: 'Société (en-tête des factures)', active: true },
  ];

  @ViewChild('logoInput') logoInput?: ElementRef<HTMLInputElement>;

  form!: UntypedFormGroup;
  logoUrl: string | null = null;
  nouveauLogo: File | null = null;
  apercuNouveauLogo: string | null = null;
  supprimerLogo = false;

  isLoading = true;
  isSaving = false;
  message: string | null = null;
  erreur: string | null = null;
  derniereModification: string | null = null;

  private destroyRef = inject(DestroyRef);
  private url = `${environment.apiUrl}/api/api/parametres-societe/`;

  constructor(private http: HttpClient, private fb: UntypedFormBuilder) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      nom:                ['', [Validators.maxLength(255)]],
      adresse:            [''],
      ville:              ['', [Validators.maxLength(100)]],
      telephone:          ['', [Validators.maxLength(100)]],
      email:              ['', [Validators.email]],
      site_web:           ['', [Validators.maxLength(255)]],
      identifiant_fiscal: ['', [Validators.maxLength(100)]],
      registre_commerce:  ['', [Validators.maxLength(100)]],
      pied_de_page:       [''],
      // Cantine : heures avant le début du jour du menu (minuit)
      delai_commande_heures:   [48, [Validators.required, Validators.min(0), Validators.max(720), Validators.pattern(/^\d+$/)]],
      delai_annulation_heures: [48, [Validators.required, Validators.min(0), Validators.max(720), Validators.pattern(/^\d+$/)]],
    });
    this.http.get<any>(this.url)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => { this._appliquer(data); this.isLoading = false; },
        error: err => { this.erreur = typeof err === 'string' ? err : 'Chargement impossible'; this.isLoading = false; },
      });
  }

  /** Exemple lisible : « Exemple — menu du mercredi : jusqu'au dimanche à minuit. » */
  exempleDelai(champ: 'delai_commande_heures' | 'delai_annulation_heures'): string {
    const heures = Number(this.form?.get(champ)?.value);
    if (!Number.isInteger(heures) || heures < 0 || heures > 720) return '';
    const debutMenu = new Date(2026, 0, 7);  // un mercredi, à minuit
    const limite = new Date(debutMenu.getTime() - heures * 3600 * 1000);
    const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const hh = `${String(limite.getHours()).padStart(2, '0')}:${String(limite.getMinutes()).padStart(2, '0')}`;
    if (heures > 6 * 24) {
      return `Exemple — menu du mercredi : fermeture ${Math.floor(heures / 24)} jours${heures % 24 ? ` et ${heures % 24} h` : ''} avant.`;
    }
    // 00:00 se lit « minuit » du jour précédent (fin de journée)
    const quand = hh === '00:00'
      ? `${jours[(limite.getDay() + 6) % 7]} à minuit`
      : `${jours[limite.getDay()]} à ${hh}`;
    return `Exemple — menu du mercredi : jusqu'au ${quand}.`;
  }

  private _appliquer(data: any): void {
    this.form.patchValue(data);
    this.logoUrl = data.logo_url ? `${environment.apiUrl}${data.logo_url}` : null;
    this.derniereModification = data.updated_at;
    this.nouveauLogo = null;
    this.apercuNouveauLogo = null;
    this.supprimerLogo = false;
    this.reinitialiserChampFichier();
  }

  /** Vide le <input type="file"> pour pouvoir re-choisir le même fichier. */
  private reinitialiserChampFichier(): void {
    if (this.logoInput?.nativeElement) this.logoInput.nativeElement.value = '';
  }

  /** Choix invalide : on oublie le fichier et l'aperçu, et on vide le champ. */
  private rejeterLogo(message: string): void {
    this.erreur = message;
    this.nouveauLogo = null;
    this.apercuNouveauLogo = null;
    this.reinitialiserChampFichier();
  }

  onLogoChoisi(event: Event): void {
    const fichier = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.erreur = null;
    if (!fichier) return;
    if (!['image/png', 'image/jpeg'].includes(fichier.type)) {
      this.rejeterLogo('Le logo doit être une image PNG ou JPEG.');
      return;
    }
    if (fichier.size > 2 * 1024 * 1024) {
      this.rejeterLogo('Le logo ne doit pas dépasser 2 Mo.');
      return;
    }
    this.nouveauLogo = fichier;
    this.supprimerLogo = false;
    const lecteur = new FileReader();
    lecteur.onload = () => {
      // Ignore une lecture terminée après un autre choix / un retrait
      if (this.nouveauLogo === fichier) this.apercuNouveauLogo = lecteur.result as string;
    };
    lecteur.readAsDataURL(fichier);
  }

  retirerLogo(): void {
    this.nouveauLogo = null;
    this.apercuNouveauLogo = null;
    this.supprimerLogo = true;
    this.reinitialiserChampFichier();
  }

  enregistrer(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const donnees = new FormData();
    Object.entries(this.form.value).forEach(([cle, valeur]) => donnees.append(cle, (valeur as string) ?? ''));
    if (this.nouveauLogo) donnees.append('logo', this.nouveauLogo);
    if (this.supprimerLogo) donnees.append('supprimer_logo', 'true');

    this.isSaving = true;
    this.message = null;
    this.erreur = null;
    this.http.patch<any>(this.url, donnees)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this._appliquer(data);
          this.isSaving = false;
          this.message = 'Paramètres enregistrés. Les délais s\'appliquent immédiatement ; les prochaines factures utiliseront ces informations.';
        },
        error: err => {
          this.isSaving = false;
          this.erreur = typeof err === 'string' ? err : 'Enregistrement impossible';
        },
      });
  }
}
