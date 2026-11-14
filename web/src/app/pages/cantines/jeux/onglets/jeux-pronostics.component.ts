// Jeux → Pronostics : compétitions, matchs à pronostiquer (jusqu'au coup d'envoi), points, classement
import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { API_JEUX, dateHeure, etatLot, messageErreur, rangFr } from '../jeux-outils';

@Component({
  selector: 'app-jeux-pronostics',
  template: `
  @if (erreur) { <div class="ep-alerte a-ro"><i class="ri-error-warning-line"></i><div>{{ erreur }}</div></div> }
  @if (!c) {
    @for (x of liste; track x.id) {
      <button type="button" class="jx-ligne" (click)="ouvrir(x.id)">
        <span class="jx-ic or"><i class="ri-football-line"></i></span>
        <span class="jx-l-txt"><b>{{ x.titre }}</b><small>{{ x.nb_matchs }} matchs@if (x.prochain_match; as m) { · prochain : {{ m.equipe_a }}-{{ m.equipe_b }} le {{ dateHeure(m.coup_envoi) }} }</small></span>
        @if (x.ma_place; as p) { <span class="jx-res" [ngClass]="p.resultat === 'gagne' ? 'gagne' : 'attente'">{{ rangFr(p.rang) }} · {{ p.points }} pts@if (p.provisoire) { <small class="d-block fw-normal">provisoire</small> }</span> }
        @if (x.a_pronostiquer) { <span class="lst-tag t-or ms-2">{{ x.a_pronostiquer }} à pronostiquer</span> }
      </button>
    } @empty { @if (charge) { <div class="lst-carte"><div class="lst-vide py-4"><i class="ri-football-line"></i><b>Aucune compétition pour le moment.</b></div></div> } }
  } @else {
    <div class="d-flex align-items-center gap-2 mb-3 flex-wrap">
      <button type="button" class="btn-ubi sm" (click)="c = null; classement = null; charger()"><i class="ri-arrow-left-line"></i>Compétitions</button>
      <b class="fs-5">{{ c.titre }}</b>
      <span class="ep-muted small">Score exact : {{ c.points_exact }} pts · bon résultat : {{ c.points_resultat }} pt</span>
      <button type="button" class="btn-ubi sm ms-auto" (click)="voirClassement()"><i class="ri-bar-chart-horizontal-line"></i>Classement</button>
    </div>
    @if (c.ma_place; as p) {
      <div class="ep-alerte mb-3" [ngClass]="p.resultat === 'gagne' ? 'a-ve' : 'a-bl'"><i class="ri-trophy-line"></i><div><span>
        Vous êtes <b>{{ rangFr(p.rang) }}</b>{{ p.provisoire ? ' (provisoire)' : '' }} avec <b>{{ p.points }} points</b> ({{ p.nb_exacts }} score(s) exact(s)).
        @if (p.gain) { Lot : <b>{{ p.gain.libelle_affiche }}</b> — {{ etatLot(p.gain) }}. } @else if (p.resultat === 'perdu') { Perdu cette fois. }</span></div></div>
    }
    @if (c.eligibilite && !c.eligibilite.ok) { <div class="ep-alerte a-or mb-3"><i class="ri-error-warning-line"></i><div>{{ c.eligibilite.message }}</div></div> }
    @if (classement) {
      @for (l of classement.lignes; track l.rang) {
        <div class="jx-cl" [class.moi]="l.moi"><span class="jx-rk">{{ l.rang }}</span><span class="jx-av">{{ l.initiales }}</span>
          <div><b>{{ l.nom }}</b><small [class.gagne]="l.lot">@if (l.lot) { 🏆 {{ l.lot }} } @else { {{ l.nb_exacts }} score(s) exact(s) }</small></div>
          <span class="jx-pt">{{ l.points }}<small>pts</small></span></div>
      }
      <p class="jx-note">{{ classement.definitif ? 'Classement définitif.' : 'Classement provisoire, mis à jour à chaque score.' }}
        Égalité : nombre de scores exacts, puis de bons résultats, puis tirage au sort.</p>
    } @else {
      <div class="jx-matchs">
        @for (m of c.matchs; track m.id) {
          <div class="jx-match" [class.ferme]="!m.ouvert">
            <small class="jx-m-tete">{{ m.phase || 'Match' }} · {{ dateHeure(m.coup_envoi) }}@if (m.annule) { · <b class="text-danger">annulé</b> }</small>
            <div class="jx-m-ligne">
              <b class="jx-eq">{{ m.equipe_a }}</b>
              @if (m.ouvert) {
                <input type="number" min="0" max="30" class="form-control jx-score" [(ngModel)]="saisie[m.id].a" (change)="envoyer(m)">
                <span>–</span>
                <input type="number" min="0" max="30" class="form-control jx-score" [(ngModel)]="saisie[m.id].b" (change)="envoyer(m)">
              } @else if (m.score_a !== null) { <span class="jx-final">{{ m.score_a }} – {{ m.score_b }}</span> }
              @else { <span class="jx-final ep-muted">en cours</span> }
              <b class="jx-eq d">{{ m.equipe_b }}</b>
            </div>
            <small class="jx-m-pied">
              @if (m.mon_pronostic; as p) { Mon pronostic : <b>{{ p.score_a }}-{{ p.score_b }}</b>@if (p.points !== null) { · <b [class.text-success]="p.points">{{ p.points ? '+' + p.points + ' pts' : '0 pt' }}</b> } }
              @else if (m.ouvert) { Saisissez votre pronostic avant le coup d'envoi } @else { Pas de pronostic }
              @if (m.tendance; as t) { · tendances : {{ t.a }} % / nul {{ t.nul }} % / {{ t.b }} % ({{ t.nb }}) }
            </small>
          </div>
        }
      </div>
    }
  }
  `,
})
export class JeuxPronosticsComponent implements OnInit {
  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  liste: any[] = [];
  charge = false;
  c: any = null;
  classement: any = null;
  saisie: Record<number, { a: number | null; b: number | null }> = {};
  erreur = '';
  readonly dateHeure = dateHeure;
  readonly etatLot = etatLot;
  readonly rangFr = rangFr;

  ngOnInit(): void { this.charger(); }

  charger(): void {
    this.http.get<any>(`${API_JEUX}/pronostics/`).subscribe({
      next: r => { this.liste = r.competitions; this.charge = true; },
      error: e => this.erreur = messageErreur(e),
    });
  }

  ouvrir(id: number): void {
    this.http.get<any>(`${API_JEUX}/pronostics/${id}/`).subscribe({
      next: c => {
        this.c = c; this.classement = null;
        this.saisie = {};
        for (const m of c.matchs) this.saisie[m.id] = { a: m.mon_pronostic?.score_a ?? null, b: m.mon_pronostic?.score_b ?? null };
      },
      error: e => this.toastr.error(messageErreur(e)),
    });
  }

  envoyer(m: any): void {
    const s = this.saisie[m.id];
    if (s.a === null || s.b === null || (s.a as any) === '' || (s.b as any) === '') return;
    this.http.post<any>(`${API_JEUX}/pronostics/matchs/${m.id}/`, { score_a: s.a, score_b: s.b }).subscribe({
      next: r => { m.mon_pronostic = { score_a: r.score_a, score_b: r.score_b, points: null }; this.toastr.success(`${m.equipe_a} ${r.score_a}-${r.score_b} ${m.equipe_b}`, 'Pronostic enregistré'); },
      error: e => { this.toastr.error(messageErreur(e)); this.ouvrir(this.c.id); },
    });
  }

  voirClassement(): void {
    if (this.classement) { this.classement = null; return; }
    this.http.get<any>(`${API_JEUX}/pronostics/${this.c.id}/classement/`).subscribe({
      next: r => this.classement = r, error: e => this.toastr.error(messageErreur(e)),
    });
  }
}
