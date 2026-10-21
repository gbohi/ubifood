// Retrait des repas : écran de comptoir « scanner → valider ».
// Le menu du jour des agences gérées est choisi automatiquement (modifiable),
// l'avancement du service et les derniers retraits viennent du serveur
// (GET /retraits/service/?menu=), l'identification et la validation passent
// par le store (recherche-par-badge, POST /retraits/) comme avant.

import { filtrerAgencesGerees } from 'src/app/core/helpers/roles';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import {
  Component, OnInit, OnDestroy, DestroyRef, inject, ElementRef, ViewChild, HostListener,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import { interval } from 'rxjs';

import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';
import { selectAllTypeequipeWithoutPagination } from 'src/app/store/Typeequipe/typeequipe-selector';
import { fetchtypeequipeNoPaginateData } from 'src/app/store/Typeequipe/typeequipe.action';

import {
  rechercheParBadge,
  resetRechercheParBadge,
  createRetrait,
  resetCommandeError,
} from 'src/app/store/Commande/commande.action';
import {
  selectRechercheParBadge,
  selectIsSearchingBadge,
  selectBadgeError,
  selectCommandeIsSubmitting,
  selectCommandeSuccess,
  selectCommandeError,
} from 'src/app/store/Commande/commande-selector';
import { RechercheParBadgeResult, CommandeModel } from 'src/app/store/Commande/commande.model';
import { environment } from 'src/environments/environment';

export interface ServiceComptoir {
  menu: { id: number; date_menu: string; agence_id: number; agence_nom: string; typeequipe_libelle: string | null };
  commandees: number;
  servies: number;
  a_servir: number;
  plats: { plat_id: number; nom: string; commandees: number; servies: number; a_servir: number }[];
  annulable: boolean;
  derniers: {
    id: number; user_id: number; user_nom: string; username: string; date_retrait: string;
    plats: { commande_id: number; plat: string }[];
  }[];
}

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const COULEURS = ['#0F3A6E', '#3EC970', '#C77B2A', '#2F80ED', '#9AA9BE', '#7B61FF'];

@Component({
  selector: 'app-retrait-commande',
  templateUrl: './retrait-commande.component.html',
  styleUrl: './retrait-commande.component.scss',
})
export class RetraitCommandeComponent implements OnInit, OnDestroy {
  private userConnecte = inject(TokenStorageService).getUser();
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private toastr = inject(ToastrService);
  private destroyRef = inject(DestroyRef);
  private apiUrl = `${environment.apiUrl}/api/api`;

  agences:     any[] = [];
  typeEquipes: any[] = [];

  // ── Sélection du menu (compacte) ────────────────────────────
  selDate = this.iso(new Date());
  selAgence = '';
  selEquipe = '';
  menusJour: any[] = [];
  menusCharges = false;
  selecteurOuvert = false;
  selectedMenuId: number | null = null;
  menuSelectionne: any = null;

  service: ServiceComptoir | null = null;

  // ── Identification / retrait (store) ───────────────────────
  resultatBadge:   RechercheParBadgeResult | null = null;
  isSearching    = false;
  isSubmitting   = false;
  badgeError:      string | null = null;
  error:           string | null = null;
  successMessage:  string | null = null;

  badgeInput = '';
  /** Badge de la dernière recherche (Entrée sur le même badge = valider) */
  private dernierBadge = '';
  /** Agent dont on vient de valider le retrait (pas d'alerte « déjà retiré ») */
  valideUserId: number | null = null;

  // ── Annulation d'un retrait ─────────────────────────────────
  @ViewChild('annulerModal', { static: false }) annulerModal?: ModalDirective;
  retraitAAnnuler: ServiceComptoir['derniers'][number] | null = null;
  annulationEnvoi = false;

  pleinEcran = false;

  imgBase = `${environment.apiUrl}`;

  @ViewChild('badgeField') badgeField?: ElementRef<HTMLInputElement>;

  constructor(private store: Store) {}

  ngOnInit(): void {
    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.select(selectAllAgenceWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(a => this.agences = filtrerAgencesGerees(a ?? [], this.userConnecte));

    this.store.dispatch(fetchtypeequipeNoPaginateData());
    this.store.select(selectAllTypeequipeWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(t => this.typeEquipes = t ?? []);

    this.store.select(selectRechercheParBadge)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(r => {
        this.resultatBadge = r;
        if (r && this.attenteResultat) {
          // Son distinct : agent identifié / repas déjà retiré
          this.attenteResultat = false;
          this.bip(r.a_retire);
        }
        if (r?.a_retire) setTimeout(() => this.focusBadge(), 300);
      });

    this.store.select(selectIsSearchingBadge)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.isSearching = v);

    this.store.select(selectBadgeError)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(e => {
        this.badgeError = e;
        if (e && this.attenteResultat) { this.attenteResultat = false; this.bip(true); }
      });

    this.store.select(selectCommandeIsSubmitting)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.isSubmitting = v);

    this.store.select(selectCommandeError)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(e => this.error = e);

    this.store.select(selectCommandeSuccess)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(s => {
        this.successMessage = s;
        if (s) {
          this.chargerService();
          setTimeout(() => {
            this.badgeInput = '';
            this.focusBadge();
          }, 1500);
        }
      });

    // Les autres postes du comptoir font avancer le service : rafraîchir
    interval(30000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.chargerService());

    const menuDemande = Number(this.route.snapshot.queryParamMap.get('menu')) || null;
    if (menuDemande) {
      this.http.get<any>(`${this.apiUrl}/menus/${menuDemande}/`).pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: m => { this.selDate = m.date_menu; this.chargerMenus(m.id); },
          error: () => this.chargerMenus(),
        });
    } else {
      this.chargerMenus();
    }
  }

  ngOnDestroy(): void {
    this.store.dispatch(resetRechercheParBadge());
    this.store.dispatch(resetCommandeError());
    if (this.pleinEcran) this.basculerPleinEcran();
  }

  /** Une recherche vient d'être lancée : jouer le son à son résultat */
  private attenteResultat = false;

  // ── Menus du jour ─────────────────────────────────────────

  chargerMenus(menuVoulu: number | null = null): void {
    let params = new HttpParams().set('gerees', '1').set('page_size', '100').set('date_menu', this.selDate);
    if (this.selAgence) params = params.set('agence', this.selAgence);
    if (this.selEquipe) params = params.set('typeequipe', this.selEquipe);
    this.menusCharges = false;
    this.http.get<any>(`${this.apiUrl}/menus/`, { params }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: r => {
          this.menusJour = (r?.results ?? r ?? []).sort((a: any, b: any) =>
            `${a.agence_nom}${a.typeequipe_libelle}`.localeCompare(`${b.agence_nom}${b.typeequipe_libelle}`));
          this.menusCharges = true;
          const choix = this.menusJour.find(m => m.id === menuVoulu)
            ?? this.menusJour.find(m => m.id === this.selectedMenuId)
            ?? this.menusJour[0];
          if (choix) {
            if (choix.id !== this.selectedMenuId) this.selectionnerMenu(choix);
          } else {
            this.selectedMenuId = null;
            this.menuSelectionne = null;
            this.service = null;
            this.selecteurOuvert = true;
          }
        },
        error: () => { this.menusJour = []; this.menusCharges = true; },
      });
  }

  selectionnerMenu(m: any): void {
    this.selectedMenuId = m.id;
    this.menuSelectionne = m;
    this.selecteurOuvert = false;
    this.badgeInput = '';
    this.dernierBadge = '';
    this.valideUserId = null;
    this.service = null;
    this.store.dispatch(resetRechercheParBadge());
    this.store.dispatch(resetCommandeError());
    this.chargerService();
    setTimeout(() => this.focusBadge(), 200);
  }

  chargerService(): void {
    if (!this.selectedMenuId) return;
    const id = this.selectedMenuId;
    this.http.get<ServiceComptoir>(`${this.apiUrl}/retraits/service/`, { params: { menu: id } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: s => { if (id === this.selectedMenuId) this.service = s; }, error: () => {} });
  }

  get avancement(): number {
    const s = this.service;
    return s && s.commandees ? Math.round(100 * s.servies / s.commandees) : 0;
  }

  // ── Recherche par badge ───────────────────────────────────

  onBadgeKeyup(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    const badge = this.badgeInput.trim();
    // Entrée sur l'agent déjà affiché : valider son retrait
    if (this.resultatBadge && badge && badge === this.dernierBadge && this.peutValider) {
      this.confirmerRetrait();
      return;
    }
    this.lancerRecherche();
  }

  lancerRecherche(): void {
    const badge = this.badgeInput.trim();
    if (!badge || !this.selectedMenuId) return;
    this.dernierBadge = badge;
    this.valideUserId = null;
    this.attenteResultat = true;
    this.store.dispatch(resetCommandeError());
    this.store.dispatch(rechercheParBadge({ badge, menuId: this.selectedMenuId }));
  }

  resetRecherche(): void {
    this.badgeInput = '';
    this.dernierBadge = '';
    this.valideUserId = null;
    this.store.dispatch(resetRechercheParBadge());
    this.store.dispatch(resetCommandeError());
    this.focusBadge();
  }

  // ── Retrait ───────────────────────────────────────────────

  get peutValider(): boolean {
    return !!this.resultatBadge && !this.resultatBadge.a_retire && this.commandesEnAttente.length > 0 && !this.isSubmitting;
  }

  confirmerRetrait(): void {
    if (!this.resultatBadge || !this.selectedMenuId) return;
    if (this.resultatBadge.a_retire) return;
    this.valideUserId = this.resultatBadge.user_id;
    this.store.dispatch(createRetrait({
      userId:          this.resultatBadge.user_id,
      menuId:          this.selectedMenuId,
      badge_matricule: this.resultatBadge.badge,
    }));
  }

  /** Retrait validé à l'instant pour l'agent affiché */
  get vientDEtreValide(): boolean {
    return !!this.resultatBadge?.a_retire && this.resultatBadge.user_id === this.valideUserId;
  }

  /** Agent qui avait déjà retiré son repas avant ce scan */
  get dejaRetire(): boolean {
    return !!this.resultatBadge?.a_retire && !this.vientDEtreValide;
  }

  // ── Annulation d'un retrait (jusqu'à la clôture du mois) ─────

  demanderAnnulation(r: ServiceComptoir['derniers'][number]): void {
    this.retraitAAnnuler = r;
    this.annulerModal?.show();
  }

  confirmerAnnulation(): void {
    const r = this.retraitAAnnuler;
    if (!r || this.annulationEnvoi) return;
    this.annulationEnvoi = true;
    this.http.delete(`${this.apiUrl}/retraits/${r.id}/`).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.annulationEnvoi = false;
        this.annulerModal?.hide();
        this.toastr.success('Retrait annulé : la commande est de nouveau en attente. L\'agent a été prévenu.', 'Succès');
        if (this.resultatBadge?.user_id === r.user_id) this.resetRecherche();
        this.chargerService();
      },
      error: err => {
        this.annulationEnvoi = false;
        this.toastr.error(typeof err === 'string' ? err : 'L\'action a échoué.', 'Erreur');
      },
    });
  }

  // ── Mode plein écran comptoir ─────────────────────────────

  basculerPleinEcran(): void {
    this.pleinEcran = !this.pleinEcran;
    try {
      if (this.pleinEcran && !document.fullscreenElement) document.documentElement.requestFullscreen?.()?.catch(() => {});
      if (!this.pleinEcran && document.fullscreenElement) document.exitFullscreen?.()?.catch(() => {});
    } catch { /* navigateur sans plein écran : la vue comptoir suffit */ }
    setTimeout(() => this.focusBadge(), 200);
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    if (!document.fullscreenElement && this.pleinEcran) this.pleinEcran = false;
  }

  // ── Son (bip court ; plus grave pour une alerte) ──────────

  private audio: AudioContext | null = null;

  private bip(alerte: boolean): void {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      this.audio = this.audio ?? new Ctx();
      const ctx = this.audio!;
      const notes = alerte ? [330, 220] : [880];
      notes.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        o.type = alerte ? 'square' : 'sine';
        g.gain.value = 0.08;
        o.connect(g); g.connect(ctx.destination);
        const t = ctx.currentTime + i * 0.18;
        o.start(t); o.stop(t + 0.15);
      });
    } catch { /* pas de son disponible */ }
  }

  // ── Helpers ───────────────────────────────────────────────

  focusBadge(): void {
    this.badgeField?.nativeElement?.focus();
  }

  libelleMenu(m: any): string {
    if (!m) return '';
    const d = this.versDate(m.date_menu);
    return `${JOURS[d.getDay()]} ${this.formatCourt(m.date_menu)} · ${m.agence_nom}`;
  }

  formatCourt(d: string): string {
    if (!d) return '';
    const [, m, day] = d.split('-');
    return `${day}/${m}`;
  }

  heure(iso?: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  initiales(nom?: string | null): string {
    return (nom ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?';
  }

  couleur(id?: number | null): string {
    return COULEURS[(id ?? 0) % COULEURS.length];
  }

  platsRetires(r: ServiceComptoir['derniers'][number]): string {
    return r.plats.length ? r.plats.map(x => x.plat).join(', ') : r.username;
  }

  pourcent(servies: number, total: number): number {
    return total ? Math.round(100 * servies / total) : 0;
  }

  getPlatNom(c: CommandeModel): string {
    return c.plat_detail?.nom ?? '—';
  }

  getImageUrl(c: CommandeModel): string | null {
    const images = (c.plat_detail as any)?.images;
    if (images?.length) {
      const img = images.find((i: any) => i.is_principale) ?? images[0];
      const url = img.url ?? img.image;
      return url.startsWith('http') ? url : `${this.imgBase}${url}`;
    }
    return null;
  }

  dismissAlert(): void {
    this.store.dispatch(resetCommandeError());
  }

  /** Commandes en attente : ce qu'il reste à remettre à l'agent */
  get commandesEnAttente(): CommandeModel[] {
    return this.resultatBadge?.commandes.filter(c => c.statut === 'en_attente') ?? [];
  }

  /** Commandes affichées : en attente + retirées (les annulées ne concernent pas la distribution) */
  get commandesAffichees(): CommandeModel[] {
    return this.resultatBadge?.commandes.filter(
      c => c.statut === 'en_attente' || c.statut === 'retiree'
    ) ?? [];
  }

  get nbPlatsADistribuer(): number {
    return this.commandesEnAttente.length;
  }

  formatDateHeure(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private versDate(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  private iso(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
}
