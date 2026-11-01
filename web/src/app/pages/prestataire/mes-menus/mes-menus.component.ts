// Mes menus (maquette « espace-presta-2-plats-menus », partie droite) :
// planning de la semaine par agence (onglets), composition / publication
// (publication immédiate, brouillon possible), copie d'un jour ou d'une semaine,
// menus verrouillés après la date limite, menus masqués par UbiPharm, historique.
import { Component, DestroyRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import { forkJoin } from 'rxjs';
import {
  AgencePresta, ContextePresta, EspacePrestataireService, HistoriqueMenu, MenuPresta, PlatPresta,
  JOURS_FR, MOIS_FR, ajouterJours, isoJour, lundi, messageErreur, noteFr, urlMedia, versDate,
} from 'src/app/core/services/espace-prestataire/espace-prestataire.service';

interface Composition {
  menu: MenuPresta | null;
  date: string;
  agence: number;
  typeequipe: number | null;
  choisis: number[];
}

/** Nombre de plats proposés par jour (au-delà : avertissement, pas de blocage) */
const PLATS_CONSEILLES = 3;

@Component({
  selector: 'app-mes-menus',
  templateUrl: './mes-menus.component.html',
})
export class MesMenusComponent implements OnInit {
  private api = inject(EspacePrestataireService);
  private toastr = inject(ToastrService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  contexte: ContextePresta | null = null;
  agenceId: number | null = null;
  /** Semaine affichée : la semaine en cours, la suivante à partir du samedi */
  semaine = lundi(ajouterJours(isoJour(new Date()), [6, 0].includes(new Date().getDay()) ? 2 : 0));
  aujourdhui = isoJour(new Date());

  /** Menus de la semaine affichée et de la précédente (copies), toutes agences */
  menus: MenuPresta[] = [];
  plats: PlatPresta[] = [];
  typesEquipes: { id: number; libelle: string }[] = [];
  historique: HistoriqueMenu[] = [];
  chargement = true;
  erreur: string | null = null;
  envoi = false;

  compo: Composition | null = null;
  erreurCompo: string | null = null;
  rechercheCompo = '';
  @ViewChild('compoModal') compoModal?: ModalDirective;

  copie = { source: '', publie: true };
  @ViewChild('copieModal') copieModal?: ModalDirective;

  aSupprimer: MenuPresta | null = null;
  @ViewChild('supprModal') supprModal?: ModalDirective;

  readonly urlMedia = urlMedia;
  readonly noteFr = noteFr;
  readonly platsConseilles = PLATS_CONSEILLES;

  ngOnInit(): void {
    const demandee = this.route.snapshot.queryParamMap.get('semaine');
    if (demandee && /^\d{4}-\d{2}-\d{2}$/.test(demandee)) this.semaine = lundi(demandee);
    const agenceDemandee = Number(this.route.snapshot.queryParamMap.get('agence')) || null;

    forkJoin({ ctx: this.api.contexte(), types: this.api.typesEquipes(), plats: this.api.plats() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ ctx, types, plats }) => {
          this.contexte = ctx;
          this.typesEquipes = types ?? [];
          this.plats = plats.plats ?? [];
          this.agenceId = ctx.agences.find(a => a.id === agenceDemandee)?.id ?? ctx.agences[0]?.id ?? null;
          this.charger();
        },
        error: e => { this.erreur = messageErreur(e, 'Vos menus n\'ont pas pu être chargés.'); this.chargement = false; },
      });
  }

  charger(): void {
    this.chargement = true;
    const debut = ajouterJours(this.semaine, -7);
    const fin = ajouterJours(this.semaine, 6);
    this.api.menus({ date_debut: debut, date_fin: fin }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: m => { this.menus = m ?? []; this.chargement = false; this.erreur = null; },
      error: e => { this.erreur = messageErreur(e); this.chargement = false; },
    });
    this.chargerHistorique();
  }

  private chargerHistorique(): void {
    if (!this.agenceId) return;
    this.api.historique({ agence: this.agenceId }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: h => this.historique = (h ?? []).slice(0, 8), error: () => this.historique = [] });
  }

  // ── Semaine / agence ───────────────────────────────────────
  get agences(): AgencePresta[] { return this.contexte?.agences ?? []; }
  get agence(): AgencePresta | undefined { return this.agences.find(a => a.id === this.agenceId); }

  choisirAgence(id: number): void {
    this.agenceId = id;
    this.chargerHistorique();
  }

  changerSemaine(n: number): void {
    this.semaine = ajouterJours(this.semaine, 7 * n);
    this.charger();
  }

  /** Lundi → vendredi (samedi / dimanche seulement s'ils ont un menu) */
  get jours(): string[] {
    const j = [0, 1, 2, 3, 4].map(i => ajouterJours(this.semaine, i));
    for (const i of [5, 6]) {
      const d = ajouterJours(this.semaine, i);
      if (this.menus.some(m => m.date_menu === d && m.agence === this.agenceId)) j.push(d);
    }
    return j;
  }

  get titreSemaine(): string {
    const d = versDate(this.semaine);
    const f = versDate(ajouterJours(this.semaine, 4));
    const moisD = d.getMonth() !== f.getMonth() ? ` ${MOIS_FR[d.getMonth()]}` : '';
    return `Semaine du ${d.getDate()}${moisD} au ${f.getDate()} ${MOIS_FR[f.getMonth()]} ${f.getFullYear()}`;
  }

  menusDuJour(date: string, agence = this.agenceId): MenuPresta[] {
    return this.menus.filter(m => m.date_menu === date && m.agence === agence);
  }

  /** « 3 / 5 publiés » dans l'onglet de l'agence */
  nbPublies(agenceId: number): number {
    return [0, 1, 2, 3, 4].map(i => ajouterJours(this.semaine, i))
      .filter(d => this.menusDuJour(d, agenceId).some(m => m.publie && !m.masque)).length;
  }

  get nbBrouillons(): number {
    return this.jours.reduce((n, d) => n + this.menusDuJour(d).filter(m => !m.publie && m.modifiable).length, 0);
  }

  // ── Jour ───────────────────────────────────────────────────
  libelleJour(date: string): string {
    const d = versDate(date);
    const j = JOURS_FR[d.getDay()].slice(0, 3);
    return `${j[0].toUpperCase()}${j.slice(1)}. ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /** Date limite de commande : celle du menu, sinon calculée (minuit du jour − délai, heure du serveur) */
  limite(date: string): Date {
    const m = this.menusDuJour(date)[0];
    if (m?.date_limite_commande) return new Date(m.date_limite_commande);
    const [y, mo, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, mo - 1, d) - (this.contexte?.delai_commande_heures ?? 48) * 3600_000);
  }

  libelleLimite(date: string): string {
    let l = this.limite(date);
    const h = `${String(l.getHours()).padStart(2, '0')}:${String(l.getMinutes()).padStart(2, '0')}`;
    let suffixe = `à ${h}`;
    if (h === '00:00') { l = new Date(l.getTime() - 60_000); suffixe = 'à minuit'; }
    const j = JOURS_FR[l.getDay()].slice(0, 3);
    return `${j}. ${String(l.getDate()).padStart(2, '0')}/${String(l.getMonth() + 1).padStart(2, '0')} ${suffixe}`;
  }

  estOuvert(date: string): boolean {
    return this.limite(date).getTime() > Date.now();
  }

  /** Menu de référence à copier vers un jour vide (le plus récent avant ce jour) */
  menuACopier(date: string): MenuPresta | null {
    const avant = this.menus
      .filter(m => m.agence === this.agenceId && m.date_menu < date && !m.masque && m.menu_plats.length)
      .sort((a, b) => b.date_menu.localeCompare(a.date_menu));
    return avant[0] ?? null;
  }

  photo(plat: any): string | null {
    const img = plat?.images?.find((i: any) => i.is_principale) ?? plat?.images?.[0];
    return img ? urlMedia(img.url ?? img.image) : null;
  }

  // ── Composition ────────────────────────────────────────────
  /** Plats proposés dans l'agence (masqués exclus) */
  get platsAgence(): PlatPresta[] {
    const q = this.rechercheCompo.trim().toLowerCase();
    return this.plats.filter(p => p.agences.includes(this.compo?.agence ?? -1) && (!q || p.nom.toLowerCase().includes(q)));
  }

  ouvrirCompo(date: string, menu: MenuPresta | null = null): void {
    if (!this.agenceId) return;
    this.erreurCompo = null;
    this.rechercheCompo = '';
    this.compo = {
      menu, date, agence: this.agenceId,
      typeequipe: menu?.typeequipe ?? this.typesEquipes[0]?.id ?? null,
      choisis: menu ? menu.menu_plats.map(mp => mp.plat.id) : [],
    };
    this.compoModal?.show();
  }

  basculerPlat(p: PlatPresta): void {
    const c = this.compo;
    if (!c || p.masque) return;
    const i = c.choisis.indexOf(p.id);
    if (i >= 0) c.choisis.splice(i, 1); else c.choisis.push(p.id);
  }

  enregistrerCompo(publier: boolean): void {
    const c = this.compo;
    if (!c || this.envoi) return;
    if (!c.choisis.length) { this.erreurCompo = 'Sélectionnez au moins un plat.'; return; }
    if (!c.typeequipe) { this.erreurCompo = 'Choisissez l\'équipe.'; return; }
    this.envoi = true;
    this.erreurCompo = null;
    const appel$ = c.menu
      ? this.api.modifierMenu(c.menu.id, { plat_ids: c.choisis, ...(publier && !c.menu.publie ? { publie: true } : {}) })
      : this.api.creerMenu({ date_menu: c.date, agence: c.agence, typeequipe: c.typeequipe, plat_ids: c.choisis, publie: publier });
    appel$.subscribe({
      next: m => {
        this.envoi = false;
        this.remplacer(m);
        this.compoModal?.hide();
        this.toastr.success(m.publie
          ? `Menu du ${this.libelleJour(m.date_menu)} publié : ${m.nb_employes_agence} employés de ${m.agence_nom} sont notifiés.`
          : `Brouillon du ${this.libelleJour(m.date_menu)} enregistré (invisible des employés).`);
        this.chargerHistorique();
      },
      error: e => { this.envoi = false; this.erreurCompo = messageErreur(e, 'Enregistrement impossible.'); },
    });
  }

  retirerPlat(menu: MenuPresta, platId: number): void {
    const reste = menu.menu_plats.map(mp => mp.plat.id).filter(id => id !== platId);
    if (!reste.length) { this.demanderSuppression(menu); return; }
    this.api.modifierMenu(menu.id, { plat_ids: reste }).subscribe({
      next: m => { this.remplacer(m); this.chargerHistorique(); },
      error: e => this.toastr.error(messageErreur(e), 'Modification impossible'),
    });
  }

  publierMenu(menu: MenuPresta): void {
    this.api.publier({ ids: [menu.id] }).subscribe({
      next: r => this.apresPublication(r),
      error: e => this.toastr.error(messageErreur(e), 'Publication impossible'),
    });
  }

  publierSemaine(): void {
    if (!this.agenceId || this.envoi) return;
    this.envoi = true;
    this.api.publier({ agence: this.agenceId, date_debut: this.semaine, date_fin: ajouterJours(this.semaine, 6) }).subscribe({
      next: r => { this.envoi = false; this.apresPublication(r); },
      error: e => { this.envoi = false; this.toastr.error(messageErreur(e), 'Publication impossible'); },
    });
  }

  private apresPublication(r: { publies: number[]; ignores: { id: number; date_menu: string; raison: string }[]; menus: MenuPresta[] }): void {
    (r.menus ?? []).forEach(m => this.remplacer(m));
    if (r.publies.length) this.toastr.success(`${r.publies.length} menu${r.publies.length > 1 ? 's' : ''} publié${r.publies.length > 1 ? 's' : ''} : les employés sont notifiés.`);
    else if (!r.ignores.length) this.toastr.info('Aucun brouillon à publier cette semaine.');
    r.ignores.forEach(i => this.toastr.warning(`${this.libelleJour(i.date_menu)} : ${i.raison}`, 'Non publié'));
    this.chargerHistorique();
  }

  copierVers(date: string): void {
    const source = this.menuACopier(date);
    if (!source || !this.agenceId) return;
    this.api.copierMenu({ menu_source: source.id, date_menu: date, agence: this.agenceId, publie: true }).subscribe({
      next: m => {
        this.remplacer(m);
        this.toastr.success(`Menu du ${this.libelleJour(source.date_menu)} copié au ${this.libelleJour(date)} et publié.`);
        this.chargerHistorique();
      },
      error: e => this.toastr.error(messageErreur(e), 'Copie impossible'),
    });
  }

  // ── Copier une semaine ─────────────────────────────────────
  get semainesSources(): { lundi: string; libelle: string }[] {
    return [-1, -2, -3, -4].map(n => {
      const l = ajouterJours(this.semaine, 7 * n);
      const d = versDate(l);
      return { lundi: l, libelle: `Semaine du ${d.getDate()} ${MOIS_FR[d.getMonth()]}${n === -1 ? ' (précédente)' : ''}` };
    });
  }

  ouvrirCopieSemaine(): void {
    this.copie = { source: ajouterJours(this.semaine, -7), publie: true };
    this.copieModal?.show();
  }

  copierSemaine(): void {
    if (!this.agenceId || this.envoi) return;
    this.envoi = true;
    this.api.copierSemaine({ agence: this.agenceId, semaine_source: this.copie.source, semaine_cible: this.semaine, publie: this.copie.publie })
      .subscribe({
        next: r => {
          this.envoi = false;
          this.copieModal?.hide();
          (r.menus ?? []).forEach(m => this.remplacer(m));
          if (r.crees.length) this.toastr.success(`${r.crees.length} menu${r.crees.length > 1 ? 's' : ''} créé${r.crees.length > 1 ? 's' : ''}.`);
          else this.toastr.info('Aucun menu créé.');
          r.ignores.forEach(i => this.toastr.warning(i.raison, `Ignoré : ${this.libelleJour(i.date_menu)}`, { timeOut: 8000 }));
          this.charger();
        },
        error: e => { this.envoi = false; this.toastr.error(messageErreur(e), 'Copie impossible'); },
      });
  }

  // ── Suppression ────────────────────────────────────────────
  demanderSuppression(menu: MenuPresta): void {
    this.aSupprimer = menu;
    this.supprModal?.show();
  }

  supprimer(): void {
    const m = this.aSupprimer;
    if (!m || this.envoi) return;
    this.envoi = true;
    this.api.supprimerMenu(m.id).subscribe({
      next: () => {
        this.envoi = false;
        this.menus = this.menus.filter(x => x.id !== m.id);
        this.supprModal?.hide();
        this.toastr.success(`Menu du ${this.libelleJour(m.date_menu)} supprimé.`);
        this.chargerHistorique();
      },
      error: e => { this.envoi = false; this.supprModal?.hide(); this.toastr.error(messageErreur(e), 'Suppression impossible'); },
    });
  }

  private remplacer(m: MenuPresta): void {
    const i = this.menus.findIndex(x => x.id === m.id);
    this.menus = i >= 0 ? this.menus.map(x => x.id === m.id ? m : x) : [...this.menus, m];
  }

  // ── Historique ─────────────────────────────────────────────
  iconeHistorique(h: HistoriqueMenu): string {
    switch (h.action) {
      case 'creation': return 'ri-add-circle-line';
      case 'publication': return 'ri-send-plane-line';
      case 'masquage': return 'ri-eye-off-line';
      case 'affichage': return 'ri-eye-line';
      case 'suppression': return 'ri-delete-bin-6-line';
      default: return 'ri-edit-2-line';
    }
  }

  dateHeure(iso?: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} · ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
}
