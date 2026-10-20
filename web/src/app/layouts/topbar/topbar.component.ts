import { Component, Output, EventEmitter, Inject, ViewChild, ElementRef, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { environment } from 'src/environments/environment';
import { DOCUMENT } from '@angular/common';
import { LanguageService } from 'src/app/core/services/language.service';
import { GESTIONNAIRES, aUnRole, rolesUtilisateur } from 'src/app/core/helpers/roles';

import { ModalDirective } from 'ngx-bootstrap/modal';
import { RootReducerState } from 'src/app/store';
import { Store } from '@ngrx/store';
import { logout } from 'src/app/store/Authentication/authentication.actions';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';

const LIBELLES_ROLES: Record<string, string> = {
  super_admin:  'Super administrateur',
  admin:        'Administrateur',
  gestionnaire: 'Gestionnaire',
  employe:      'Employé',
};

/** Raccourcis du menu « Liens utiles » (mêmes droits que le menu latéral) */
const LIENS_UTILES: { libelle: string; icone: string; lien: string; roles?: string[] }[] = [
  { libelle: 'Plats',            icone: 'ri-restaurant-line',     lien: '/cantines/liste-plats',             roles: GESTIONNAIRES },
  { libelle: 'Menus',            icone: 'ri-file-list-3-line',    lien: '/cantines/liste-menus',             roles: GESTIONNAIRES },
  { libelle: 'Commandes',        icone: 'ri-shopping-cart-line',  lien: '/cantines/liste-commandes',         roles: GESTIONNAIRES },
  { libelle: 'Retrait',          icone: 'ri-calendar-check-fill', lien: '/cantines/retrait-commande',        roles: GESTIONNAIRES },
  { libelle: 'Fac. employés',    icone: 'ri-wallet-3-line',       lien: '/cantines/facturation-commande',    roles: GESTIONNAIRES },
  { libelle: 'Fac. prestataires', icone: 'ri-bank-card-2-line',   lien: '/cantines/facturation-prestataire', roles: GESTIONNAIRES },
];

@Component({
  selector: 'app-topbar',
  templateUrl: './topbar.component.html',
  styleUrls: ['./topbar.component.scss']
})
export class TopbarComponent {

  element: any;
  userData: any;
  liensUtiles: typeof LIENS_UTILES = [];

  /** Prénom et nom de l'utilisateur connecté (à défaut : son matricule) */
  get nomAffiche(): string {
    const u = this.userData || {};
    return [u.prenom, u.nom].filter(Boolean).join(' ') || u.username || '';
  }

  get initiales(): string {
    const u = this.userData || {};
    const mots = [u.prenom, u.nom].filter(Boolean) as string[];
    const base = mots.length ? mots.map(m => m.trim()[0]) : [(u.username || '?')[0]];
    return base.join('').slice(0, 2).toUpperCase();
  }

  /** Rôle le plus élevé de l'utilisateur */
  get roleAffiche(): string {
    const roles = rolesUtilisateur(this.userData);
    const role = ['super_admin', 'admin', 'gestionnaire', 'employe'].find(r => roles.includes(r));
    return role ? LIBELLES_ROLES[role] : 'Utilisateur';
  }

  @Output() mobileMenuButtonClicked = new EventEmitter();

  constructor(@Inject(DOCUMENT) private document: any,
    public languageService: LanguageService,
    public store: Store<RootReducerState>,
    private TokenStorageService: TokenStorageService) { }

  // ── Photo de profil ─────────────────────────────────────────
  @ViewChild('photoModal', { static: false }) photoModal?: ModalDirective;
  @ViewChild('photoInput', { static: false }) photoInput?: ElementRef<HTMLInputElement>;
  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  nouvellePhoto: File | null = null;
  apercuPhoto: string | null = null;
  erreurPhoto: string | null = null;
  photoEnCours = false;

  /** URL complète de la photo de l'utilisateur connecté (ou null). */
  get photoUrl(): string | null {
    const url = this.userData?.photo_url;
    return url ? `${environment.apiUrl}${url}` : null;
  }

  ouvrirPhoto(): void {
    this.nouvellePhoto = null;
    this.apercuPhoto = null;
    this.erreurPhoto = null;
    if (this.photoInput?.nativeElement) this.photoInput.nativeElement.value = '';
    this.photoModal?.show();
  }

  onPhotoChoisie(event: Event): void {
    const fichier = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.erreurPhoto = null;
    this.nouvellePhoto = null;
    this.apercuPhoto = null;
    if (!fichier) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(fichier.type)) {
      this.erreurPhoto = 'Choisissez une image JPEG, PNG ou WebP.';
      return;
    }
    if (fichier.size > 5 * 1024 * 1024) {
      this.erreurPhoto = 'La photo ne doit pas dépasser 5 Mo.';
      return;
    }
    this.nouvellePhoto = fichier;
    const lecteur = new FileReader();
    lecteur.onload = () => {
      // Ignore une lecture terminée après un autre choix
      if (this.nouvellePhoto === fichier) this.apercuPhoto = lecteur.result as string;
    };
    lecteur.readAsDataURL(fichier);
  }

  enregistrerPhoto(): void {
    if (!this.nouvellePhoto || this.photoEnCours) return;
    const donnees = new FormData();
    donnees.append('photo', this.nouvellePhoto);
    this.envoyerPhoto(this.http.post<any>(this.urlPhoto, donnees), 'Photo de profil mise à jour.');
  }

  retirerPhoto(): void {
    if (this.photoEnCours) return;
    this.envoyerPhoto(this.http.delete<any>(this.urlPhoto), 'Photo de profil retirée.');
  }

  private get urlPhoto(): string {
    return `${environment.apiUrl}/api/api/users/me/photo/`;
  }

  private envoyerPhoto(requete: any, succes: string): void {
    this.photoEnCours = true;
    this.erreurPhoto = null;
    requete.subscribe({
      next: (profil: any) => {
        // Profil enregistré localement : la photo suit sur toutes les pages
        this.userData = { ...this.userData, photo_url: profil?.photo_url ?? null };
        this.TokenStorageService.saveUser(this.userData);
        this.photoEnCours = false;
        this.photoModal?.hide();
        this.toastr.success(succes);
      },
      error: (err: any) => {
        this.photoEnCours = false;
        this.erreurPhoto = typeof err === 'string' ? err : "L'envoi de la photo a échoué.";
      },
    });
  }

  ngOnInit(): void {
    this.element = document.documentElement;
    this.userData = this.TokenStorageService.getUser();
    this.liensUtiles = LIENS_UTILES.filter(l => aUnRole(this.userData, l.roles));
  }

  windowScroll() {
    if (document.body.scrollTop > 100 || document.documentElement.scrollTop > 100) {
      (document.getElementById('back-to-top') as HTMLElement).style.display = "block";
      document.getElementById('page-topbar')?.classList.add('topbar-shadow')
    } else {
      (document.getElementById('back-to-top') as HTMLElement).style.display = "none";
      document.getElementById('page-topbar')?.classList.remove('topbar-shadow')
    }
  }

  /**
   * Toggle the menu bar when having mobile screen
   */
  toggleMobileMenu(event: any) {
    document.querySelector('.hamburger-icon')?.classList.toggle('open')
    event.preventDefault();
    this.mobileMenuButtonClicked.emit();
  }

  /**
  * Fullscreen method
  */
  fullscreen() {
    document.body.classList.toggle('fullscreen-enable');
    if (
      !document.fullscreenElement && !this.element.mozFullScreenElement &&
      !this.element.webkitFullscreenElement) {
      if (this.element.requestFullscreen) {
        this.element.requestFullscreen();
      } else if (this.element.mozRequestFullScreen) {
        /* Firefox */
        this.element.mozRequestFullScreen();
      } else if (this.element.webkitRequestFullscreen) {
        /* Chrome, Safari and Opera */
        this.element.webkitRequestFullscreen();
      } else if (this.element.msRequestFullscreen) {
        /* IE/Edge */
        this.element.msRequestFullscreen();
      }
    } else {
      if (this.document.exitFullscreen) {
        this.document.exitFullscreen();
      } else if (this.document.mozCancelFullScreen) {
        /* Firefox */
        this.document.mozCancelFullScreen();
      } else if (this.document.webkitExitFullscreen) {
        /* Chrome, Safari and Opera */
        this.document.webkitExitFullscreen();
      } else if (this.document.msExitFullscreen) {
        /* IE/Edge */
        this.document.msExitFullscreen();
      }
    }
  }

  /**
   * Logout the user
   */
  logout() {
    // L'effet logout$ révoque la session côté serveur, vide le stockage
    // local et renvoie vers la page de connexion
    this.store.dispatch(logout());
  }
}
