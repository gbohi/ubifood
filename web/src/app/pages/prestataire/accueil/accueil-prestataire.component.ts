// Accueil du responsable du prestataire (maquette « espace-presta-1-accueil ») :
// service du jour par agence, à préparer (prochain jour), équipe au comptoir,
// à faire (alertes), relevés des derniers mois.
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import {
  AccueilPresta, EspacePrestataireService, JOURS_FR, MOIS_FR, ReleveMois,
  couleur, initiales, messageErreur, montantFr, nombreFr, noteFr, urlMedia, versDate,
} from 'src/app/core/services/espace-prestataire/espace-prestataire.service';

@Component({
  selector: 'app-accueil-prestataire',
  templateUrl: './accueil-prestataire.component.html',
})
export class AccueilPrestataireComponent implements OnInit {
  private api = inject(EspacePrestataireService);
  private destroyRef = inject(DestroyRef);
  private user = inject(TokenStorageService).getUser();

  donnees: AccueilPresta | null = null;
  chargement = true;
  erreur: string | null = null;

  readonly nombreFr = nombreFr;
  readonly montantFr = montantFr;
  readonly initiales = initiales;
  readonly couleur = couleur;
  readonly urlMedia = urlMedia;
  readonly noteFr = noteFr;

  get prenom(): string {
    return this.user?.prenom || this.user?.nom || '';
  }

  ngOnInit(): void {
    this.api.accueil().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: d => { this.donnees = d; this.chargement = false; },
      error: e => { this.erreur = messageErreur(e, "L'accueil n'a pas pu être chargé."); this.chargement = false; },
    });
  }

  /** « Mardi 17 novembre 2026 · 12:40 » */
  get dateLongue(): string {
    if (!this.donnees) return '';
    const d = versDate(this.donnees.date);
    const j = JOURS_FR[d.getDay()];
    return `${j[0].toUpperCase()}${j.slice(1)} ${d.getDate()} ${MOIS_FR[d.getMonth()]} ${d.getFullYear()} · ${this.donnees.heure}`;
  }

  pct(n: number, total: number): number {
    return total ? Math.min(100, Math.round(100 * n / total)) : 0;
  }

  /** Quantité d'un plat pour une agence (clés : id d'agence en chaîne) */
  qte(m: Record<string, number> | undefined, agenceId: number): number {
    return m?.[String(agenceId)] ?? 0;
  }

  get agencesAPreparer() {
    return this.donnees?.a_preparer?.agences ?? this.donnees?.agences ?? [];
  }

  get nbAlertes(): number {
    return this.donnees?.alertes?.length ?? 0;
  }

  get retraitsEquipe(): number {
    return (this.donnees?.equipe?.agents ?? []).reduce((s, a) => s + (a.nb_retraits || 0), 0);
  }

  libelleEtat(r: ReleveMois): string {
    switch (r.etat) {
      case 'cloture': return 'Clôturé';
      case 'a_cloturer': return 'À clôturer par UbiPharm';
      default: return 'En cours (provisoire)';
    }
  }

  classeEtat(r: ReleveMois): string {
    return r.etat === 'cloture' ? 't-ve' : r.etat === 'a_cloturer' ? 't-or' : 't-bl';
  }

  /** Résumé des jours à composer d'une alerte « menus_a_composer » */
  resumeComposer(a: any): string {
    return (a.agences ?? []).map((ag: any) => {
      const n = ag.jours_a_composer ?? 0;
      const b = ag.brouillons?.length ?? 0;
      const morceaux = [`${n} jour${n > 1 ? 's' : ''} à composer`];
      if (b) morceaux.push(`${b} brouillon${b > 1 ? 's' : ''}`);
      return `${ag.agence_nom} : ${morceaux.join(', ')}`;
    }).join(' · ');
  }

  jourCourt(iso?: string | null): string {
    if (!iso) return '';
    const d = versDate(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
