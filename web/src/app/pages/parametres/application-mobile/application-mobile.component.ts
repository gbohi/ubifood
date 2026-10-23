// src/app/pages/parametres/application-mobile/application-mobile.component.ts
//
// Application mobile (interne, hors stores) : dépôt de l'APK Android,
// lien d'invitation iPhone (TestFlight) et versions. Ces informations
// alimentent la page publique /telecharger. Réservé aux administrateurs.

import { Component, OnInit, DestroyRef, ElementRef, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { environment } from 'src/environments/environment';
import { ApplicationMobile, tailleLisible } from 'src/app/telecharger/telecharger.component';

const TAILLE_MAX_APK = 200 * 1024 * 1024;

@Component({
  selector: 'app-application-mobile',
  templateUrl: './application-mobile.component.html',
})
export class ApplicationMobileComponent implements OnInit {

  @ViewChild('apkInput') apkInput?: ElementRef<HTMLInputElement>;

  app: ApplicationMobile | null = null;
  formAndroid!: UntypedFormGroup;
  formIos!: UntypedFormGroup;
  nouvelApk: File | null = null;
  erreurApk: string | null = null;

  isLoading = true;
  envoiAndroid = false;
  /** Avancement de l'envoi de l'APK (0-100), null hors envoi */
  progression: number | null = null;
  envoiIos = false;
  confirmerSuppression = false;
  lienCopie = false;

  readonly adressePage = `${location.origin}/telecharger`;
  readonly tailleLisible = tailleLisible;

  private destroyRef = inject(DestroyRef);
  private url = `${environment.apiUrl}/api/api/application-mobile/`;

  constructor(private http: HttpClient, private fb: UntypedFormBuilder, private toast: ToastrService) {}

  ngOnInit(): void {
    this.formAndroid = this.fb.group({
      android_version: ['', [Validators.maxLength(30)]],
    });
    this.formIos = this.fb.group({
      ios_url:     ['', [Validators.maxLength(500), Validators.pattern(/^https?:\/\/\S+$/i)]],
      ios_version: ['', [Validators.maxLength(30)]],
    });
    this.http.get<ApplicationMobile>(this.url)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => { this.appliquer(data); this.isLoading = false; },
        error: err => { this.isLoading = false; this.toast.error(this.texte(err), 'Erreur'); },
      });
  }

  private appliquer(data: ApplicationMobile): void {
    this.app = data;
    this.formAndroid.reset({ android_version: data.android.version ?? '' });
    this.formIos.reset({ ios_url: data.ios.url ?? '', ios_version: data.ios.version ?? '' });
    this.nouvelApk = null;
    this.erreurApk = null;
    if (this.apkInput?.nativeElement) this.apkInput.nativeElement.value = '';
  }

  onApkChoisi(event: Event): void {
    const fichier = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.erreurApk = null;
    this.nouvelApk = null;
    if (!fichier) return;
    if (!fichier.name.toLowerCase().endsWith('.apk')) {
      this.erreurApk = 'Choisissez un fichier APK Android (.apk).';
    } else if (fichier.size > TAILLE_MAX_APK) {
      this.erreurApk = `Fichier trop volumineux (${tailleLisible(fichier.size)}) : 200 Mo maximum.`;
    } else {
      this.nouvelApk = fichier;
      return;
    }
    if (this.apkInput?.nativeElement) this.apkInput.nativeElement.value = '';
  }

  /** Version Android (et nouvel APK s'il y en a un), avec barre de progression */
  enregistrerAndroid(): void {
    if (this.formAndroid.invalid || this.envoiAndroid) return;
    const donnees = new FormData();
    donnees.append('android_version', (this.formAndroid.value.android_version ?? '').trim());
    if (this.nouvelApk) donnees.append('apk', this.nouvelApk);

    this.envoiAndroid = true;
    this.progression = this.nouvelApk ? 0 : null;
    this.http.patch<ApplicationMobile>(this.url, donnees, { reportProgress: true, observe: 'events' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: evt => {
          if (evt.type === HttpEventType.UploadProgress && evt.total && this.progression !== null) {
            this.progression = Math.round(100 * evt.loaded / evt.total);
          } else if (evt.type === HttpEventType.Response && evt.body) {
            const avecFichier = !!this.nouvelApk;
            this.appliquer(evt.body);
            this.toast.success(avecFichier ? 'Nouvel APK en ligne sur la page de téléchargement.' : 'Version Android enregistrée.');
          }
        },
        error: err => {
          this.envoiAndroid = false;
          this.progression = null;
          this.toast.error(this.texte(err), 'Erreur');
        },
        complete: () => { this.envoiAndroid = false; this.progression = null; },
      });
  }

  enregistrerIos(): void {
    if (this.formIos.invalid || this.envoiIos) { this.formIos.markAllAsTouched(); return; }
    const v = this.formIos.value;
    this.envoiIos = true;
    this.http.patch<ApplicationMobile>(this.url, { ios_url: (v.ios_url ?? '').trim(), ios_version: (v.ios_version ?? '').trim() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => { this.envoiIos = false; this.appliquer(data); this.toast.success('Lien iPhone enregistré.'); },
        error: err => { this.envoiIos = false; this.toast.error(this.texte(err), 'Erreur'); },
      });
  }

  supprimerApk(): void {
    this.confirmerSuppression = false;
    this.envoiAndroid = true;
    this.http.delete<ApplicationMobile>(this.url)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => { this.envoiAndroid = false; this.appliquer(data); this.toast.success('APK retiré : le bouton Android affiche « Bientôt disponible ».'); },
        error: err => { this.envoiAndroid = false; this.toast.error(this.texte(err), 'Erreur'); },
      });
  }

  copierLien(): void {
    navigator.clipboard?.writeText(this.adressePage)
      .then(() => {
        this.lienCopie = true;
        setTimeout(() => this.lienCopie = false, 2500);
      })
      .catch(() => this.toast.info(this.adressePage, 'Copiez le lien'));
  }

  private texte(err: any): string {
    return typeof err === 'string' ? err : (err?.message || 'Une erreur est survenue');
  }
}
