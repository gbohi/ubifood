import { Component, DestroyRef, ElementRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { WebNotificationService } from './core/services/web-notification.service';
import { TokenStorageService } from './core/services/token-storage.service';
import { environment } from 'src/environments/environment';
import { POPUP_APRES_CONNEXION } from './core/helpers/popup-connexion';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {

  // ── Fenêtre affichée après la connexion (Paramètres → Fenêtre de connexion) ──
  popupImage: string | null = null;
  @ViewChild('fermerPopup') fermerPopup?: ElementRef<HTMLButtonElement>;

  private http = inject(HttpClient);
  private router = inject(Router);
  private tokenStorage = inject(TokenStorageService);
  private destroyRef = inject(DestroyRef);

  constructor(private webNotif: WebNotificationService) {}

  ngOnInit(): void {
    // Initialiser FCM Web au démarrage
    this.webNotif.init();

    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(e => {
      if (!e.urlAfterRedirects.startsWith('/auth/')) this.afficherPopupSiDemande();
    });
  }

  private afficherPopupSiDemande(): void {
    let demande = false;
    try {
      demande = sessionStorage.getItem(POPUP_APRES_CONNEXION) === '1';
      sessionStorage.removeItem(POPUP_APRES_CONNEXION);
    } catch { /* stockage indisponible : pas de fenêtre */ }
    if (!demande || !this.tokenStorage.getAccessToken()) return;

    this.http.get<{ image_url?: string }>(`${environment.apiUrl}/api/api/popups-connexion/active/`)
      .subscribe({
        next: p => {
          // Aucune image active : pas de fenêtre
          if (!p?.image_url) return;
          this.popupImage = p.image_url.startsWith('http') ? p.image_url : `${environment.apiUrl}${p.image_url}`;
          setTimeout(() => this.fermerPopup?.nativeElement.focus());
        },
        error: () => { /* fenêtre facultative : on n'affiche rien */ },
      });
  }

  @HostListener('document:keydown.escape')
  fermer(): void {
    this.popupImage = null;
  }
}
