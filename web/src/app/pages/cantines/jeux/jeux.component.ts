// Jeux — côté employé (comme l'application mobile) : jeux en cours et à venir,
// lots et conditions, partie chronométrée (le serveur tient le temps : le
// chrono continue si l'on quitte la page), résultats et classement.
// API : jeux/ (backend api/jeux.py).
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-jeux',
  templateUrl: './jeux.component.html',
})
export class JeuxComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = `${environment.apiUrl}/api/api/jeux`;
  readonly lettres = ['A', 'B', 'C', 'D'];

  vue: 'liste' | 'jeu' | 'partie' | 'resultats' | 'classement' = 'liste';
  readonly onglets = [
    { code: 'quiz', libelle: 'Quiz', icone: 'ri-question-answer-line' },
    { code: 'defis', libelle: 'Défis', icone: 'ri-medal-line' },
    { code: 'pronostics', libelle: 'Pronostics', icone: 'ri-football-line' },
    { code: 'tickets', libelle: 'Tickets', icone: 'ri-coupon-3-line' },
    { code: 'gains', libelle: 'Mes gains', icone: 'ri-gift-line' },
  ];
  onglet = 'quiz';
  liste: any = null;
  jeu: any = null;
  etat: any = null;
  resultats: any = null;
  classement: any = null;
  chargement = false;
  envoi = false;
  choix: number | null = null;

  // Chrono : échéance en heure locale, recalée sur chaque réponse du serveur
  private echeance = 0;
  restantMs = 0;
  private minuteur: any = null;
  private tick: any = null;
  private surVisibilite = () => { if (!document.hidden && this.vue === 'partie') this.rafraichirPartie(); };

  ngOnInit(): void {
    document.addEventListener('visibilitychange', this.surVisibilite);
    this.tick = setInterval(() => this.battre(), 200);
    const o = this.route.snapshot.queryParamMap.get('onglet');
    if (o && this.onglets.some(x => x.code === o)) this.onglet = o;
    const id = Number(this.route.snapshot.queryParamMap.get('jeu'));
    if (id) this.ouvrir(id); else this.chargerListe();
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.surVisibilite);
    clearInterval(this.tick);
    clearTimeout(this.minuteur);
  }

  // ── Liste ──────────────────────────────────────────────────
  changerOnglet(o: string): void {
    this.onglet = o;
    this.router.navigate([], { queryParams: o === 'quiz' ? {} : { onglet: o }, replaceUrl: true });
  }

  chargerListe(): void {
    this.vue = 'liste'; this.chargement = true;
    this.router.navigate([], { queryParams: this.onglet === 'quiz' ? {} : { onglet: this.onglet }, replaceUrl: true });
    this.http.get<any>(`${this.api}/`).subscribe({
      next: l => { this.liste = l; this.chargement = false; this.caler(l.en_cours[0] ? Date.parse(l.en_cours[0].fin) - Date.parse(l.serveur) : 0); },
      error: e => { this.chargement = false; this.toastr.error(this.msg(e)); },
    });
  }

  ouvrir(id: number): void {
    this.chargement = true;
    this.http.get<any>(`${this.api}/${id}/`).subscribe({
      next: j => {
        this.jeu = j; this.chargement = false; this.vue = 'jeu';
        this.router.navigate([], { queryParams: { jeu: id }, replaceUrl: true });
        const cible = j.etat === 'a_venir' ? j.debut : j.fin;
        this.caler(Date.parse(cible) - Date.parse(j.serveur));
      },
      error: e => { this.chargement = false; this.toastr.error(this.msg(e)); this.chargerListe(); },
    });
  }

  // ── Partie ─────────────────────────────────────────────────
  commencer(): void {
    this.envoi = true;
    this.http.post<any>(`${this.api}/${this.jeu.id}/commencer/`, {}).subscribe({
      next: e => { this.envoi = false; this.vue = 'partie'; this.appliquer(e); },
      error: e => { this.envoi = false; this.toastr.error(this.msg(e)); },
    });
  }

  rafraichirPartie(): void {
    this.http.get<any>(`${this.api}/${this.jeu.id}/partie/`).subscribe({
      next: e => this.appliquer(e),
      error: e => this.toastr.error(this.msg(e)),
    });
  }

  repondre(reponseId: number): void {
    if (this.envoi || this.etat?.statut !== 'question') return;
    this.choix = reponseId; this.envoi = true;
    this.http.post<any>(`${this.api}/${this.jeu.id}/repondre/`, { index: this.etat.index, reponse_id: reponseId }).subscribe({
      next: e => { this.envoi = false; this.appliquer(e); },
      error: err => {
        this.envoi = false;
        if (err?.error?.etat) {
          this.toastr.warning(err.error.detail || 'Temps écoulé.');
          this.appliquer(err.error.etat);
        } else { this.toastr.error(this.msg(err)); }
      },
    });
  }

  private appliquer(e: any): void {
    this.etat = e; this.choix = null;
    clearTimeout(this.minuteur);
    const ms = e.statut === 'question' ? e.restant_ms : e.statut === 'attente_debut' ? e.debut_dans_ms
             : e.statut === 'attente_suivante' ? e.suivante_dans_ms : 0;
    this.caler(ms);
    if (e.statut !== 'terminee') {
      // À l'échéance, le serveur dit où en est la partie (question suivante…)
      this.minuteur = setTimeout(() => this.rafraichirPartie(), ms + 400);
    }
  }

  private caler(ms: number): void { this.echeance = Date.now() + Math.max(0, ms); this.battre(); }

  private battre(): void { this.restantMs = Math.max(0, this.echeance - Date.now()); }

  get pourcentage(): number {
    if (this.etat?.statut !== 'question') return 0;
    return Math.min(100, 100 * this.restantMs / (this.etat.question.duree * 1000));
  }

  get secondes(): number { return Math.ceil(this.restantMs / 1000); }

  // ── Résultats et classement ────────────────────────────────
  voirResultats(): void {
    this.http.get<any>(`${this.api}/${this.jeu.id}/resultats/`).subscribe({
      next: r => { this.resultats = r; this.jeu = { ...this.jeu, ...r.jeu }; this.vue = 'resultats'; },
      error: e => this.toastr.error(this.msg(e)),
    });
  }

  voirClassement(): void {
    this.http.get<any>(`${this.api}/${this.jeu.id}/classement/`).subscribe({
      next: c => { this.classement = c; this.vue = 'classement'; },
      error: e => this.toastr.error(this.msg(e)),
    });
  }

  // ── Affichage ──────────────────────────────────────────────
  compteARebours(ms: number): { j: number; h: number; m: number; s: number } {
    const t = Math.max(0, Math.floor(ms / 1000));
    return { j: Math.floor(t / 86400), h: Math.floor(t % 86400 / 3600), m: Math.floor(t % 3600 / 60), s: t % 60 };
  }

  temps(ms: number | null): string {
    if (ms === null || ms === undefined) return '—';
    const s = Math.round(ms / 1000);
    return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}` : `${s} s`;
  }

  dateHeure(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(' ', ' à ');
  }

  rangFr(n: number): string { return n === 1 ? '1er' : `${n}e`; }

  fcfa(n: number): string { return `${Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ')} F`; }

  resume(j: any): { texte: string; classe: string; icone: string } {
    const p = j.participation;
    if (p?.resultat === 'gagne') {
      const remis = p.statut_lot === 'remis' ? `retiré le ${this.dateHeure(p.lot_remis_le)}` : p.statut_lot === 'credite' ? 'crédité' : 'à retirer';
      return { texte: `${p.lot.libelle_affiche} · ${remis}`, classe: 'gagne', icone: 'ri-gift-line' };
    }
    if (p?.resultat === 'perdu') return { texte: 'Perdu', classe: 'perdu', icone: 'ri-emotion-sad-line' };
    if (p?.resultat === 'non_classe') return { texte: 'Non classé', classe: 'perdu', icone: 'ri-forbid-line' };
    if (p?.statut === 'terminee') return { texte: 'Résultats bientôt', classe: 'attente', icone: 'ri-time-line' };
    if (p) return { texte: 'Partie en cours', classe: 'attente', icone: 'ri-play-line' };
    return { texte: j.etat === 'termine' || j.etat === 'resultats' ? 'Non joué' : '', classe: 'perdu', icone: 'ri-calendar-line' };
  }

  private msg(err: any): string {
    const m = err?.error;
    if (typeof m === 'string') return m;
    const v = m && typeof m === 'object' ? (m.detail ?? Object.values(m)[0]) : null;
    return Array.isArray(v) ? String(v[0]) : String(v ?? 'Action impossible.');
  }
}
