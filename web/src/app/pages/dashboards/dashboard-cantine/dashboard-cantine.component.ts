// src/app/pages/dashboard-cantine/dashboard-cantine.component.ts
//
// Accueil gestionnaire / administrateur (maquette stats-1-accueil) :
//   - haut de page : salutation, raccourcis, service d'aujourd'hui, à faire (GET /accueil/ → « gestion ») ;
//   - service du jour par repas et par catégorie de salarié, avec export et liste nominative
//     (GET /statistiques/repas-categories/?debut=fin=aujourd'hui) ;
//   - cette semaine ;
//   - « Ce mois-ci » : 4 chiffres comparés au mois précédent (GET /statistiques/?resume=1).
// Les graphiques, classements et exports détaillés sont sur la page Cantine › Statistiques.

import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BsModalService } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';

import { filtrerAgencesGerees } from 'src/app/core/helpers/roles';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import {
  AccueilAFaire, AccueilGestion, AccueilJourGestion, AccueilService, AccueilServiceAgence,
  dateLongue, jourCourt, jourMois, prenomUtilisateur,
} from 'src/app/core/services/accueil/accueil.service';
import {
  Compteurs, LigneCategorie, LigneRepas, RepasCategories, Statistiques, StatistiquesService, Variation,
  heureFr, isoLocal, jourLibelle, jourMoisCourt, libelleComparaison, libellePeriode, nombreFr, noteFr,
  pourcentFr, variation,
} from 'src/app/core/services/statistiques/statistiques.service';
import {
  Cellule, enregistrerPdf, exporterExcel, nomFichier, nouveauPdf, tableauPdf, titrePdf,
} from 'src/app/core/helpers/exports';
import { DetailServiceComponent } from 'src/app/shared/detail-service/detail-service.component';
import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';

interface KpiMois {
  libelle: string; icone: string; pastille: string; valeur: string; unite?: string;
  variation: Variation | null; neutre?: string; note: string; ancre: string;
}

@Component({
  selector: 'app-dashboard-cantine',
  templateUrl: './dashboard-cantine.component.html',
  styleUrls: ['./dashboard-cantine.component.scss'],
})
export class DashboardCantineComponent implements OnInit, OnDestroy {
  // Un gestionnaire ne gère que les agences auxquelles il est rattaché
  private userConnecte = inject(TokenStorageService).getUser();
  private accueilService = inject(AccueilService);
  private stats = inject(StatistiquesService);
  private store = inject(Store);
  private modal = inject(BsModalService);
  private toastr = inject(ToastrService);

  // ── Haut de page : GET /api/api/accueil/ → clé « gestion » ──
  prenom     = prenomUtilisateur(this.userConnecte);
  aujourdhui = dateLongue(new Date());
  gestion:        AccueilGestion | null = null;
  accueilErreur:  string | null = null;
  accueilCharge   = false;
  majIlYa         = '';
  private dateJour = isoLocal(new Date());
  private majA:   number | null = null;
  private minuteur: ReturnType<typeof setInterval> | null = null;
  readonly jourCourt = jourCourt;
  readonly jourMois  = jourMois;
  readonly nombreFr  = nombreFr;

  // ── Service du jour par repas / par catégorie ────────────────
  service: RepasCategories | null = null;
  exportEnCours: string | null = null;

  // ── Ce mois-ci ───────────────────────────────────────────────
  mois: Statistiques | null = null;
  kpisMois: KpiMois[] = [];

  private agences: any[] = [];
  private _destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.select(selectAllAgenceWithoutPagination)
      .pipe(takeUntil(this._destroy$))
      .subscribe(data => { if (data) this.agences = filtrerAgencesGerees(data, this.userConnecte); });

    this.chargerAccueil();
    this.chargerService();
    this.chargerMois();
    // Service du jour : rafraîchi toutes les 2 minutes, libellé « il y a … » chaque 30 s
    let tours = 0;
    this.minuteur = setInterval(() => {
      tours++;
      if (tours % 4 === 0) { this.chargerAccueil(); this.chargerService(); }
      this._majIlYa();
    }, 30_000);
  }

  ngOnDestroy(): void {
    if (this.minuteur) clearInterval(this.minuteur);
    this._destroy$.next();
    this._destroy$.complete();
  }

  // ══════════════════════════════════════════════════════════════
  // HAUT DE PAGE
  // ══════════════════════════════════════════════════════════════

  chargerAccueil(): void {
    this.accueilService.getAccueil()
      .pipe(takeUntil(this._destroy$))
      .subscribe({
        next: d => {
          this.gestion = d?.gestion ?? null;
          if (d?.date) {
            this.aujourdhui = dateLongue(d.date);
            const jour = String(d.date).slice(0, 10);
            if (jour !== this.dateJour) { this.dateJour = jour; this.chargerService(); }
          }
          this.accueilErreur = null;
          this.accueilCharge = true;
          this.majA = Date.now();
          this._majIlYa();
        },
        error: e => {
          this.accueilCharge = true;
          this.accueilErreur = e?.error?.detail || e?.message || 'Erreur inconnue';
        },
      });
  }

  private _majIlYa(): void {
    if (!this.majA) { this.majIlYa = ''; return; }
    const min = Math.floor((Date.now() - this.majA) / 60_000);
    this.majIlYa = min < 1 ? "mis à jour à l'instant" : `mis à jour il y a ${min} min`;
  }

  get agencesLibelle(): string {
    return this.gestion?.agences?.length ? this.gestion.agences.join(', ') : '';
  }

  pctServies(a: AccueilServiceAgence): number {
    return a.commandees ? Math.min(100, Math.round(a.servies / a.commandees * 100)) : 0;
  }

  detailAgence(a: AccueilServiceAgence): string {
    const equipes = a.equipes?.length ? a.equipes.join(', ') : 'Menu du jour';
    return `${equipes} · ${a.nb_plats} plat${a.nb_plats > 1 ? 's' : ''}`;
  }

  styleAFaire(t: AccueilAFaire): { pastille: string; icone: string; action: string; lien: string } {
    switch (t.type) {
      case 'menu_manquant':
        return { pastille: 'p-ro', icone: 'ri-calendar-event-line', action: 'Créer', lien: '/cantines/liste-menus' };
      case 'fermeture':
        return { pastille: 'p-or', icone: 'ri-time-line', action: 'Voir', lien: '/cantines/gestion-commandes' };
      default:
        return { pastille: 'p-ve', icone: 'ri-file-list-3-line', action: 'Clôturer', lien: '/cantines/facturation-commande' };
    }
  }

  tagJour(j: AccueilJourGestion): { classe: string; texte: string } {
    switch (j.etat) {
      case 'termine':   return { classe: 't-fer', texte: 'Terminé' };
      case 'en_cours':  return { classe: 't-ouv', texte: 'En cours de service' };
      case 'ouvert':    return { classe: 't-ouv', texte: 'Ouvert' };
      case 'ferme':     return { classe: 't-fer', texte: 'Fermé' };
      default:          return { classe: 't-man', texte: 'Menu manquant' };
    }
  }

  estAujourdhui(j: AccueilJourGestion): boolean {
    return String(j.date).slice(0, 10) === this.dateJour;
  }

  formatNombre(val: any): string { return nombreFr(Number(val) || 0); }

  // ══════════════════════════════════════════════════════════════
  // SERVICE DU JOUR PAR REPAS / PAR CATÉGORIE
  // ══════════════════════════════════════════════════════════════

  chargerService(): void {
    this.stats.repasCategories({ debut: this.dateJour, fin: this.dateJour })
      .pipe(takeUntil(this._destroy$))
      .subscribe({ next: d => this.service = d, error: () => this.service = null });
  }

  get serviceAgences(): string {
    return this.service?.agences?.length ? this.service.agences.join(', ') : 'toutes les agences';
  }

  pct(l: Compteurs): number {
    return l.commandes ? Math.min(100, Math.round(l.servis / l.commandes * 100)) : 0;
  }

  ouvrirDetail(mode: 'repas' | 'categorie', ligne?: LigneRepas | LigneCategorie | null): void {
    const s = this.service;
    this.modal.show(DetailServiceComponent, {
      class: 'modal-xl modal-dialog-centered st-modal',
      initialState: {
        debut: this.dateJour, fin: this.dateJour, mode,
        plat: mode === 'repas' && ligne ? (ligne as LigneRepas).plat_id : null,
        categorie: mode === 'categorie' && ligne ? ((ligne as LigneCategorie).categorie_id ?? 'aucune') : null,
        plats: (s?.par_repas ?? []).map(p => ({ id: p.plat_id, nom: p.plat })),
        categories: (s?.par_categorie ?? []).map(c => ({ id: c.categorie_id, libelle: c.categorie })),
        agences: this.agences.filter(a => !s?.agences?.length || s.agences.includes(a.nom_agence)),
        contexte: 'Service du jour',
      } as Partial<DetailServiceComponent>,
    });
  }

  /** Excel « tableau + listes nominatives » ou PDF « fiche du service » d'un bloc */
  exporterService(mode: 'repas' | 'categorie', format: 'excel' | 'pdf'): void {
    const s = this.service;
    if (!s) return;
    this.exportEnCours = mode + format;
    const titreBloc = mode === 'repas' ? 'Par repas' : 'Par catégorie de salarié';
    const titre = `Service du ${jourLibelle(this.dateJour)} · ${titreBloc}`;
    const sousTitre = `${this.serviceAgences} · édité le ${new Date().toLocaleDateString('fr-FR')} à ${heureFr(new Date().toISOString())}`;
    const entete = [mode === 'repas' ? 'Repas' : 'Catégorie', 'Commandés', 'Servis', 'À servir', 'Avancement (%)'];
    const lignes: Cellule[][] = (mode === 'repas'
      ? s.par_repas.map(r => [r.plat, r.commandes, r.servis, r.a_servir, this.pct(r)])
      : s.par_categorie.map(c => [c.categorie ?? 'Sans catégorie', c.commandes, c.servis, c.a_servir, this.pct(c)]));
    lignes.push(['Total', s.total.commandes, s.total.servis, s.total.a_servir, this.pct(s.total)]);

    this.stats.detail({ debut: this.dateJour, fin: this.dateJour, liste: 'commandes', export: true })
      .pipe(takeUntil(this._destroy$))
      .subscribe({
        next: d => {
          this.exportEnCours = null;
          const colonnes = ['Nom', 'Prénoms', 'Matricule', 'Catégorie', 'Poste', 'Agence', 'Repas', 'Statut', 'Heure de retrait'];
          const ligne = (l: any): Cellule[] => [l.nom, l.prenom, l.matricule, l.categorie ?? 'Sans catégorie', l.poste ?? '',
            l.agence ?? '', l.plat, l.statut === 'servi' ? 'Servi' : 'À servir', l.heure_retrait ? heureFr(l.heure_retrait) : ''];
          const tous = d.results;
          const fichier = nomFichier('service', this.dateJour, mode === 'repas' ? 'par-repas' : 'par-categorie');
          if (format === 'excel') {
            const liste = (nom: string, rows: any[]) => ({ nom, lignes: [[`${nom} (${rows.length})`], [], colonnes, ...rows.map(ligne)] });
            exporterExcel(fichier, [
              { nom: titreBloc, lignes: [[titre], [sousTitre], [], entete, ...lignes] },
              liste('Commandés', tous),
              liste('Servis', tous.filter(l => l.statut === 'servi')),
              liste('À servir', tous.filter(l => l.statut !== 'servi')),
            ]);
          } else {
            const pdf = nouveauPdf(titre, sousTitre, false);
            tableauPdf(pdf, entete, lignes.map(l => l.map(c => (typeof c === 'number' ? nombreFr(c) : c))), true, [1, 2, 3, 4]);
            titrePdf(pdf, `Liste nominative · ${tous.length} commande${tous.length > 1 ? 's' : ''}`,
                     `${tous.filter(l => l.statut === 'servi').length} servis · ${tous.filter(l => l.statut !== 'servi').length} à servir`);
            tableauPdf(pdf, colonnes.filter(c => c !== 'Matricule'),
                       tous.map(l => ligne(l).filter((_, i) => i !== 2)));
            enregistrerPdf(pdf, fichier);
          }
        },
        error: () => { this.exportEnCours = null; this.toastr.error("L'export a échoué."); },
      });
  }

  // ══════════════════════════════════════════════════════════════
  // CE MOIS-CI
  // ══════════════════════════════════════════════════════════════

  chargerMois(): void {
    const n = new Date();
    const debut = isoLocal(new Date(n.getFullYear(), n.getMonth(), 1));
    const fin = isoLocal(new Date(n.getFullYear(), n.getMonth() + 1, 0));
    this.stats.statistiques({ debut, fin }, true)
      .pipe(takeUntil(this._destroy$))
      .subscribe({
        next: d => {
          this.mois = d;
          const k = d.kpis, p = d.precedent;
          const cmp = libelleComparaison(d.periode.precedente);
          this.kpisMois = [
            { libelle: 'Commandes', icone: 'ri-shopping-basket-2-line', pastille: 'st-p-bl', ancre: 'commandes',
              valeur: nombreFr(k.commandes), variation: variation(k.commandes, p.commandes, 1), note: cmp },
            { libelle: 'Taux de retrait', icone: 'ri-checkbox-circle-line', pastille: 'st-p-ve', ancre: 'commandes',
              valeur: pourcentFr(k.taux_retrait),
              variation: d.periode.en_cours ? null : variation(k.taux_retrait, p.taux_retrait, 1, 'diff'),
              neutre: d.periode.en_cours ? 'en cours' : undefined,
              note: d.periode.en_cours ? `${nombreFr(k.a_servir)} repas encore à servir` : cmp },
            { libelle: 'Repas non retirés', icone: 'ri-forbid-line', pastille: 'st-p-or', ancre: 'frequentation',
              valeur: nombreFr(k.non_retires), variation: variation(k.non_retires, p.non_retires, -1), note: cmp },
            { libelle: 'Note moyenne', icone: 'ri-star-line', pastille: 'st-p-ja', ancre: 'plats',
              valeur: noteFr(k.note_moyenne), unite: k.note_moyenne !== null ? '★ / 5' : '',
              variation: variation(k.note_moyenne, p.note_moyenne, 1, 'diff'),
              note: k.nb_avis ? `${nombreFr(k.nb_avis)} avis · ${cmp}` : 'aucun avis' },
          ];
        },
        error: () => { this.mois = null; this.kpisMois = []; },
      });
  }

  get moisLibelle(): string {
    if (!this.mois) return '';
    const p = this.mois.periode;
    const ag = this.mois.agences?.length ? ` · ${this.mois.agences.join(', ')}` : '';
    return `${libellePeriode(p.debut, p.fin)}, au ${jourMoisCourt(p.aujourdhui)}${ag}`;
  }
}
