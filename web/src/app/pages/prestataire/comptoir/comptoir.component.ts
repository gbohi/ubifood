// Comptoir du prestataire (maquette « espace-presta-3-preparer-comptoir », partie droite) :
// scan du badge (QR) ou saisie du matricule → carte de l'employé (sans catégorie)
// → « Valider le retrait ». Le mode (scan / saisie) est déduit de la vitesse de frappe
// (un lecteur de badge « tape » le code en quelques millisecondes).
// L'agent peut annuler SON retrait pendant 2 minutes ; au-delà, seul UbiPharm le peut.
import { Component, DestroyRef, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToastrService } from 'ngx-toastr';
import { interval } from 'rxjs';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import {
  ContextePresta, EspacePrestataireService, RechercheComptoir, RetraitComptoir, ServiceComptoirPresta,
  JOURS_FR, couleur, initiales, messageErreur, urlMedia, versDate,
} from 'src/app/core/services/espace-prestataire/espace-prestataire.service';

/** Intervalle moyen maximal entre deux frappes d'un lecteur de badge (ms) */
const SEUIL_SCAN_MS = 35;

@Component({
  selector: 'app-comptoir-presta',
  templateUrl: './comptoir.component.html',
})
export class ComptoirComponent implements OnInit, OnDestroy {
  private api = inject(EspacePrestataireService);
  private toastr = inject(ToastrService);
  private destroyRef = inject(DestroyRef);
  private moi = inject(TokenStorageService).getUser();

  contexte: ContextePresta | null = null;
  agenceId: number | null = null;
  service: ServiceComptoirPresta | null = null;
  erreurService: string | null = null;

  badge = '';
  private frappes: number[] = [];
  private colle = false;
  mode: 'scan' | 'saisie' = 'saisie';
  recherche: RechercheComptoir | null = null;
  enRecherche = false;
  erreurRecherche: string | null = null;

  envoi = false;
  /** Retrait que je viens de valider (carte verte) */
  valide: RetraitComptoir | null = null;
  /** 409 « déjà retiré » renvoyé à la validation */
  alerteDejaRetire: string | null = null;
  maintenant = Date.now();

  pleinEcran = false;

  @ViewChild('champBadge') champBadge?: ElementRef<HTMLInputElement>;

  readonly urlMedia = urlMedia;
  readonly initiales = initiales;
  readonly couleur = couleur;

  ngOnInit(): void {
    this.api.contexte().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: c => {
        this.contexte = c;
        const memo = Number(localStorage.getItem('comptoir_agence')) || null;
        this.agenceId = c.agences.find(a => a.id === memo)?.id ?? c.agences[0]?.id ?? null;
        this.chargerService();
      },
      error: e => this.erreurService = messageErreur(e),
    });
    // Les autres postes font avancer le service ; le compte à rebours d'annulation avance
    interval(30000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.chargerService());
    interval(1000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.maintenant = Date.now());
  }

  ngOnDestroy(): void {
    if (this.pleinEcran) this.basculerPleinEcran();
  }

  choisirAgence(id: number): void {
    this.agenceId = id;
    try { localStorage.setItem('comptoir_agence', String(id)); } catch { /* facultatif */ }
    this.reinitialiser();
    this.service = null;
    this.chargerService();
  }

  chargerService(): void {
    if (!this.contexte) return;
    this.api.service(this.agenceId, 8).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: s => { this.service = s; this.erreurService = null; },
      error: e => { this.erreurService = messageErreur(e, 'Le service du jour n\'a pas pu être chargé.'); },
    });
  }

  get agenceNom(): string {
    return this.service?.agence?.nom ?? this.contexte?.agences.find(a => a.id === this.agenceId)?.nom ?? '';
  }

  get titreJour(): string {
    const iso = this.service?.date;
    if (!iso) return '';
    const d = versDate(iso);
    const j = JOURS_FR[d.getDay()];
    return `${j[0].toUpperCase()}${j.slice(1)} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  pct(n: number, total: number): number {
    return total ? Math.round(100 * n / total) : 0;
  }

  // ── Saisie : détection scan / clavier ──────────────────────
  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.entree();
      return;
    }
    if (e.key.length === 1) {
      if (!this.badge) { this.frappes = []; this.colle = false; }
      this.frappes.push(performance.now());
    }
  }

  onPaste(): void { this.colle = true; }

  private modeDetecte(): 'scan' | 'saisie' {
    const f = this.frappes;
    if (this.colle || f.length < 3) return 'saisie';
    const moyenne = (f[f.length - 1] - f[0]) / (f.length - 1);
    return moyenne <= SEUIL_SCAN_MS ? 'scan' : 'saisie';
  }

  /** Entrée : rechercher, ou valider si l'employé affiché peut retirer */
  entree(): void {
    const b = this.badge.trim();
    if (this.recherche?.a_retirer && !this.valide && (!b || b.toLowerCase() === this.recherche.employe.matricule.toLowerCase())) {
      this.valider();
      return;
    }
    this.rechercher();
  }

  rechercher(): void {
    const b = this.badge.trim();
    if (!b || this.enRecherche) return;
    this.mode = this.modeDetecte();
    this.enRecherche = true;
    this.erreurRecherche = null;
    this.alerteDejaRetire = null;
    this.valide = null;
    this.recherche = null;
    this.api.rechercher(b, this.agenceId).subscribe({
      next: r => {
        this.enRecherche = false;
        this.recherche = r;
        this.badge = '';
        this.bip(!r.a_retirer);
        this.focus();
      },
      error: e => {
        this.enRecherche = false;
        this.erreurRecherche = messageErreur(e, 'Recherche impossible.');
        this.bip(true);
        this.badge = '';
        this.focus();
      },
    });
  }

  valider(): void {
    const r = this.recherche;
    if (!r?.a_retirer || !r.menu_id || this.envoi) return;
    this.envoi = true;
    this.api.valider(r.menu_id, r.employe.id, this.mode).subscribe({
      next: retrait => {
        this.envoi = false;
        this.valide = retrait;
        this.recherche = { ...r, a_retirer: false };
        this.badge = '';
        this.bip(false);
        this.chargerService();
        this.focus();
      },
      error: e => {
        this.envoi = false;
        // 409 : retiré entre-temps (autre poste) — alerte orange, aucun second retrait
        this.alerteDejaRetire = messageErreur(e, 'Le retrait n\'a pas pu être validé.');
        this.recherche = { ...r, a_retirer: false };
        this.bip(true);
        this.chargerService();
        this.focus();
      },
    });
  }

  reinitialiser(): void {
    this.badge = '';
    this.recherche = null;
    this.valide = null;
    this.erreurRecherche = null;
    this.alerteDejaRetire = null;
    this.focus();
  }

  // ── Annulation (2 minutes) ─────────────────────────────────
  secondesRestantes(r: RetraitComptoir | null): number {
    if (!r?.annulable_par_moi || !r.annulable_jusqu_a) return 0;
    return Math.max(0, Math.floor((new Date(r.annulable_jusqu_a).getTime() - this.maintenant) / 1000));
  }

  compteRebours(r: RetraitComptoir | null): string {
    const s = this.secondesRestantes(r);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  annuler(r: RetraitComptoir): void {
    if (!this.secondesRestantes(r)) return;
    this.api.annulerRetrait(r.id).subscribe({
      next: res => {
        this.toastr.success(res?.detail || 'Retrait annulé : la commande est de nouveau à servir.');
        if (this.valide?.id === r.id) this.reinitialiser();
        this.chargerService();
      },
      error: e => { this.toastr.error(messageErreur(e), 'Annulation impossible'); this.chargerService(); },
    });
  }

  platsTexte(r: RetraitComptoir): string {
    return r.plats.length ? r.plats.map(p => p.plat).join(', ') : r.matricule;
  }

  estMoi(r: RetraitComptoir): boolean {
    return r.valide_par_id === this.moi?.id;
  }

  // ── Plein écran ────────────────────────────────────────────
  basculerPleinEcran(): void {
    this.pleinEcran = !this.pleinEcran;
    try {
      if (this.pleinEcran && !document.fullscreenElement) document.documentElement.requestFullscreen?.()?.catch(() => {});
      if (!this.pleinEcran && document.fullscreenElement) document.exitFullscreen?.()?.catch(() => {});
    } catch { /* la vue comptoir suffit */ }
    this.focus();
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    if (!document.fullscreenElement && this.pleinEcran) this.pleinEcran = false;
  }

  focus(): void {
    setTimeout(() => this.champBadge?.nativeElement?.focus(), 50);
  }

  dateCommande(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} à ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // ── Son : bip court (ok) / grave (alerte) ──────────────────
  private audio: AudioContext | null = null;
  private bip(alerte: boolean): void {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      this.audio = this.audio ?? new Ctx();
      const ctx = this.audio!;
      (alerte ? [330, 220] : [880]).forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        o.type = alerte ? 'square' : 'sine';
        g.gain.value = 0.08;
        o.connect(g); g.connect(ctx.destination);
        const t = ctx.currentTime + i * 0.18;
        o.start(t); o.stop(t + 0.15);
      });
    } catch { /* pas de son */ }
  }
}
