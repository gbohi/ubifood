// src/app/telecharger/telecharger.component.ts
//
// Page publique « Télécharger UbiFood » (/telecharger, sans connexion).
// L'application mobile est interne à UbiPharm et n'est pas publiée sur les
// stores : les collaborateurs téléchargent ici l'APK Android ou suivent le
// lien d'invitation iPhone (TestFlight). Les liens et versions sont gérés
// par les administrateurs (Paramètres → Application mobile).
// Styles : assets/scss/pages/_telecharger.scss (budget des styles de composant).

import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { environment } from 'src/environments/environment';

export interface ApplicationMobile {
  android: {
    url: string | null;
    version: string | null;
    taille_octets: number | null;
    mis_a_jour: string | null;
    nom_fichier?: string | null;
  };
  ios: { url: string | null; version: string | null };
}

/** Appareil du visiteur, d'après le navigateur */
export type Appareil = 'android' | 'ios' | 'ordinateur';

export function detecterAppareil(): Appareil {
  if (typeof navigator === 'undefined') return 'ordinateur';
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  // iPadOS se présente comme un Mac : on le reconnaît à l'écran tactile
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return 'ordinateur';
}

/** « 42,3 Mo » */
export function tailleLisible(octets: number | null | undefined): string {
  if (!octets) return '';
  const mo = octets / (1024 * 1024);
  if (mo < 1) return `${Math.max(1, Math.round(octets / 1024))} Ko`;
  return `${mo.toLocaleString('fr-FR', { maximumFractionDigits: mo < 10 ? 1 : 0 })} Mo`;
}

@Component({
  selector: 'app-telecharger',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './telecharger.component.html',
})
export class TelechargerComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly appareil: Appareil = detecterAppareil();
  /** Onglet du guide d'installation (iPhone pour un iPhone, Android sinon) */
  onglet: 'android' | 'ios' = this.appareil === 'ios' ? 'ios' : 'android';

  app: ApplicationMobile | null = null;
  chargement = true;
  erreur = false;
  lienCopie = false;
  readonly annee = new Date().getFullYear();
  readonly adressePage = typeof location !== 'undefined' ? `${location.origin}/telecharger` : '/telecharger';

  readonly etapes = [
    { icone: 'ri-restaurant-2-line', titre: 'Choisissez', texte: 'le menu de la semaine, photos et avis des collègues à l\'appui.' },
    { icone: 'ri-calendar-check-line', titre: 'Réservez', texte: 'votre plat avant la date limite, en un seul geste.' },
    { icone: 'ri-qr-code-line', titre: 'Présentez votre badge', texte: 'au comptoir : il est scanné, vous êtes servi.' },
  ];

  readonly atouts = [
    { icone: 'ri-notification-3-line', titre: 'Rappels avant clôture', texte: 'Une notification avant la fermeture des commandes : plus d\'oubli.' },
    { icone: 'ri-star-smile-line', titre: 'Notez vos plats', texte: 'Donnez votre avis après le repas et consultez celui des collègues.' },
    { icone: 'ri-wallet-3-line', titre: 'Relevé du mois', texte: 'Vos repas et le montant retenu, mois par mois, en toute clarté.' },
    { icone: 'ri-arrow-go-back-line', titre: 'Annulation dans les délais', texte: 'Un empêchement ? Annulez vous-même tant que le délai le permet.' },
    { icone: 'ri-calendar-2-line', titre: 'Toute la semaine', texte: 'Menus par agence et par équipe, réservés à l\'avance.' },
    { icone: 'ri-shield-check-line', titre: 'Interne et sécurisé', texte: 'Connexion avec votre matricule ; vos données restent chez UbiPharm.' },
  ];

  readonly questions = [
    { q: 'Qui peut utiliser UbiFood ?',
      r: 'Tous les collaborateurs d\'UbiPharm Côte d\'Ivoire inscrits à la cantine. Vous vous connectez avec votre matricule et le mot de passe qui vous a été remis.' },
    { q: 'J\'ai oublié mon mot de passe.',
      r: 'Sur l\'écran de connexion, touchez « Mot de passe oublié » : un code vous est envoyé par SMS au numéro enregistré, puis vous choisissez un nouveau mot de passe.' },
    { q: 'L\'application est-elle gratuite ?',
      r: 'Oui. UbiFood est une application interne d\'UbiPharm, gratuite et sans publicité. Seuls vos repas sont retenus, selon les règles habituelles de la cantine.' },
    { q: 'Pourquoi n\'est-elle pas sur le Play Store ou l\'App Store ?',
      r: 'Elle est réservée aux collaborateurs : elle est donc distribuée directement par UbiPharm, depuis cette page (Android) ou par une invitation TestFlight d\'Apple (iPhone).' },
    { q: 'Comment mettre à jour l\'application ?',
      r: 'Android : téléchargez la nouvelle version depuis cette page et installez-la par-dessus l\'ancienne, vos données sont conservées. iPhone : TestFlight propose la mise à jour automatiquement.' },
    { q: 'Un problème avec l\'application ?',
      r: 'Contactez votre gestionnaire de cantine : il pourra vous aider ou transmettre votre demande.' },
  ];

  ngOnInit(): void {
    // Appel public (aucune connexion requise) : le serveur ignore un éventuel jeton
    this.http.get<ApplicationMobile>(`${environment.apiUrl}/api/api/application-mobile/`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => { this.app = data; this.chargement = false; },
        error: () => { this.erreur = true; this.chargement = false; },
      });
  }

  get urlAndroid(): string | null { return this.app?.android?.url ?? null; }
  get urlIos(): string | null { return this.app?.ios?.url ?? null; }

  /** Boutons dans l'ordre utile : celui de l'appareil du visiteur d'abord */
  get ordre(): ('android' | 'ios')[] {
    return this.appareil === 'ios' ? ['ios', 'android'] : ['android', 'ios'];
  }

  /** « Version 1.4.0 · 42,3 Mo · du 23 oct. 2026 » */
  get detailsAndroid(): string {
    const a = this.app?.android;
    if (!a?.url) return '';
    const morceaux = [
      a.version ? `Version ${a.version}` : '',
      tailleLisible(a.taille_octets),
      a.mis_a_jour ? `du ${this.dateCourte(a.mis_a_jour)}` : '',
    ];
    return morceaux.filter(Boolean).join(' · ');
  }

  get detailsIos(): string {
    if (!this.urlIos) return '';
    const v = this.app?.ios?.version;
    return v ? `Version ${v} · via TestFlight` : 'Via TestFlight (Apple)';
  }

  copierLien(): void {
    navigator.clipboard?.writeText(this.adressePage).then(() => {
      this.lienCopie = true;
      setTimeout(() => this.lienCopie = false, 2500);
    }).catch(() => {});
  }

  private dateCourte(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
