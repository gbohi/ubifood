// src/app/pages/cantines/accueil-employe/accueil-employe.component.ts
//
// Accueil web de l'employé : repas du jour, prochain repas à réserver,
// sa semaine, ses chiffres du mois et ses dernières commandes.
// Données : GET /api/api/accueil/ (une seule requête).

import { Component, DestroyRef, OnDestroy, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from 'src/environments/environment';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import {
  Accueil, AccueilCommande, AccueilJour, AccueilService,
  dateLongue, dateLocale, jourCourt, jourMois, montantF, nomMois, prenomUtilisateur,
} from 'src/app/core/services/accueil/accueil.service';

interface StyleJour { classe: string; icone: string; texte: string; }

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

@Component({
  selector: 'app-accueil-employe',
  templateUrl: './accueil-employe.component.html',
  styleUrls: ['./accueil-employe.component.scss'],
})
export class AccueilEmployeComponent implements OnInit, OnDestroy {
  private accueilService = inject(AccueilService);
  private destroyRef = inject(DestroyRef);
  private user = inject(TokenStorageService).getUser();

  prenom = prenomUtilisateur(this.user);
  aujourdhui = dateLongue(new Date());

  donnees: Accueil | null = null;
  chargement = true;
  erreur: string | null = null;
  imageEnErreur = false;

  /** « Commandes ouvertes encore 1 j 4 h », recalculé chaque minute */
  compteARebours = '';
  private minuteur: ReturnType<typeof setInterval> | null = null;

  readonly montantF = montantF;
  readonly jourCourt = jourCourt;
  readonly jourMois = jourMois;

  ngOnInit(): void {
    this.charger();
    this.minuteur = setInterval(() => this.majCompteARebours(), 60_000);
  }

  ngOnDestroy(): void {
    if (this.minuteur) clearInterval(this.minuteur);
  }

  charger(): void {
    this.chargement = true;
    this.erreur = null;
    this.accueilService.getAccueil()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: d => {
          this.donnees = d;
          this.chargement = false;
          this.imageEnErreur = false;
          if (d?.date) this.aujourdhui = dateLongue(d.date);
          this.majCompteARebours();
        },
        error: e => {
          this.chargement = false;
          this.erreur = e?.error?.detail || e?.message || 'Erreur inconnue';
        },
      });
  }

  // ── Repas du jour ────────────────────────────────────────────
  imageUrl(c: AccueilCommande | null): string | null {
    const url = c?.plat_image_url;
    if (!url || this.imageEnErreur) return null;
    return url.startsWith('http') ? url : `${environment.apiUrl}${url}`;
  }

  lieu(c: AccueilCommande): string {
    return [c.agence, c.equipe].filter(Boolean).join(' · ');
  }

  // ── Prochain repas à réserver ────────────────────────────────
  dateProchain(iso: string): string {
    return dateLongue(iso, false);
  }

  private majCompteARebours(): void {
    const limite = this.donnees?.prochain_a_reserver?.date_limite_commande;
    if (!limite) { this.compteARebours = ''; return; }
    const reste = new Date(limite).getTime() - Date.now();
    if (reste <= 0) { this.compteARebours = 'Commandes fermées'; return; }
    const minutes = Math.floor(reste / 60_000);
    const j = Math.floor(minutes / 1440);
    const h = Math.floor((minutes % 1440) / 60);
    const min = minutes % 60;
    const duree = j > 0 ? `${j} j ${h} h` : (h > 0 ? `${h} h ${min} min` : `${Math.max(min, 1)} min`);
    this.compteARebours = `Commandes ouvertes encore ${duree}`;
  }

  // ── Ma semaine ───────────────────────────────────────────────
  estAujourdhui(iso: string): boolean {
    return !!this.donnees && String(iso).slice(0, 10) === String(this.donnees.date).slice(0, 10);
  }

  styleJour(j: AccueilJour): StyleJour {
    const plat = j.plat ? `${j.plat} · ` : '';
    switch (j.statut) {
      case 'retire':      return { classe: 'ok',      icone: 'ri-checkbox-circle-fill', texte: `${plat}retiré` };
      case 'a_retirer':   return { classe: 'ok',      icone: 'ri-time-fill',            texte: `${plat}à retirer` };
      case 'reserve':     return { classe: 'reserve', icone: 'ri-bookmark-3-fill',      texte: `${plat}réservé` };
      case 'non_retire':  return { classe: 'manque',  icone: 'ri-error-warning-fill',   texte: `${plat}non retiré` };
      case 'a_reserver':  return { classe: 'afaire',  icone: 'ri-add-circle-line',      texte: 'À réserver' };
      case 'ferme':       return { classe: 'ferme',   icone: 'ri-lock-line',            texte: 'Commandes fermées' };
      default:            return { classe: 'vide',    icone: 'ri-subtract-line',        texte: 'Pas de menu' };
    }
  }

  // ── Mes chiffres ─────────────────────────────────────────────
  get moisLong(): string {
    return this.donnees ? nomMois(this.donnees.date) : '';
  }

  get moisCourt(): string {
    return this.donnees ? MOIS_COURTS[dateLocale(this.donnees.date).getMonth()] : '';
  }

  // ── Dernières commandes ──────────────────────────────────────
  badgeCommande(c: AccueilCommande): { classe: string; texte: string } {
    if (c.statut === 'retiree') return { classe: 'st-r', texte: 'Retiré' };
    if (c.statut === 'annulee') return { classe: 'st-x', texte: 'Annulé' };
    const jour = String(c.date_menu).slice(0, 10);
    const auj = String(this.donnees?.date ?? '').slice(0, 10);
    if (jour === auj) return { classe: 'st-a', texte: 'À retirer' };
    if (jour > auj)   return { classe: 'st-b', texte: 'Réservé' };
    return { classe: 'st-n', texte: 'Non retiré' };
  }
}
