// Jeux → Défis : défis du mois en cours (progression), paliers, badges, historique
import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_JEUX, dateHeure, etatLot, messageErreur } from '../jeux-outils';

@Component({
  selector: 'app-jeux-defis',
  template: `
  @if (erreur) { <div class="ep-alerte a-ro"><i class="ri-error-warning-line"></i><div>{{ erreur }}</div></div> }
  @if (d; as d) {
    @if (d.courante; as c) {
      <div class="jx-hero jx-hero-defis">
        <i class="ri-medal-fill jx-hero-fond"></i>
        <span class="jx-tag">{{ c.periode_libelle }}</span>
        <h3>{{ c.titre }}</h3>
        <div class="jx-hero-s">{{ c.points }} / {{ c.points_max }} points · {{ nbReussis(c) }} défi(s) réussi(s) sur {{ c.defis.length }}</div>
        <div class="jx-jauge"><i [style.width.%]="c.points_max ? 100 * c.points / c.points_max : 0"></i>
          @for (p of c.paliers; track p.id) { <span [style.left.%]="c.points_max ? 100 * p.points_min / c.points_max : 0" [class.ok]="p.atteint" [title]="p.nom + ' : ' + p.recompense"></span> }</div>
      </div>
@if (c.suspension; as s) { <div class="ep-alerte a-or mb-3"><i class="ri-pause-circle-line"></i><div><span><b>Jeu suspendu momentanément</b>@if (s.motif) { : {{ s.motif }} }. Revenez un peu plus tard.</span></div></div> }
      @if (c.resultat; as r) {
        <div class="ep-alerte a-ve mb-3"><i class="ri-trophy-line"></i><div><span><b>Bilan : {{ r.points }} points</b>
          @if (r.palier) { · palier {{ r.palier }} : {{ r.gain?.libelle_affiche }} ({{ etatLot(r.gain) }}) }</span></div></div>
      }
      <div class="jx-defis">
        @for (x of c.defis; track x.code) {
          <div class="jx-defi" [class.ok]="x.reussi" [class.ko]="x.perdu">
            <span class="jx-defi-ic"><i [class]="x.reussi ? 'ri-check-line' : x.icone"></i></span>
            <div class="jx-defi-txt">
              <b>{{ x.nom }} <small>+{{ x.points }} pts</small></b>
              <span>{{ x.description }}</span>
              @if (x.code === 'retraits') {
                <div class="jx-defi-prog"><i [style.width.%]="x.commandes ? 100 * x.retires / x.commandes : 0"></i></div>
                <small>{{ x.retires }}/{{ x.commandes }} repas retirés@if (x.oublies) { · <b class="text-danger">{{ x.oublies }} oublié(s) : défi perdu</b> } @else if (x.constate_a_la_cloture) { · validé à la fin du mois } </small>
              } @else {
                <div class="jx-defi-prog"><i [style.width.%]="100 * min(x.valeur, x.objectif) / x.objectif"></i></div>
                <small>@if (x.reussi) { Réussi le {{ dateHeure(x.reussi_le) }} } @else { {{ x.valeur }} / {{ x.objectif }}@if (x.code === 'serie') { · série en cours : {{ x.serie_courante }} } }</small>
              }
            </div>
          </div>
        }
      </div>
      <h6 class="jx-sec">Paliers et récompenses</h6>
      <div class="jx-paliers">
        @for (p of c.paliers; track p.id) {
          <div class="jx-palier" [class.ok]="p.atteint"><i [class]="p.atteint ? 'ri-medal-fill' : 'ri-medal-line'"></i><b>{{ p.nom }}</b>
            <small>dès {{ p.points_min }} pts</small><span>{{ p.recompense }}</span></div>
        } @empty { <p class="ep-muted small">Pas de récompense ce mois-ci : seulement des badges.</p> }
      </div>
    } @else if (d.prochaine) {
      <div class="ep-alerte a-bl"><i class="ri-calendar-event-line"></i><div><span><b>{{ d.prochaine.titre }}</b> : {{ d.prochaine.periode_libelle }}.
        <span class="d-block">@for (x of d.prochaine.defis; track x.code) { {{ x.description }} (+{{ x.points }} pts)@if (!$last) { · } }</span></span></div></div>
    } @else {
      <div class="lst-carte"><div class="lst-vide py-4"><i class="ri-medal-line"></i><b>Pas de défis en ce moment.</b><span>Vous serez notifié au lancement des prochains.</span></div></div>
    }
    <h6 class="jx-sec">Mes badges</h6>
    <div class="jx-badges">
      @for (b of d.badges; track b.code) {
        <div class="jx-badge" [class.off]="!b.nombre"><span><i [class]="b.icone"></i></span><b>{{ b.nom }}</b><small>{{ b.nombre ? '×' + b.nombre : 'à débloquer' }}</small></div>
      }
    </div>
    @if (d.historique.length) {
      <h6 class="jx-sec">Mois précédents</h6>
      @for (h of d.historique; track h.id) {
        <div class="jx-ligne statique"><span class="jx-ic" [ngClass]="h.gain ? 'gagne' : ''"><i [class]="h.gain ? 'ri-gift-line' : 'ri-medal-line'"></i></span>
          <span class="jx-l-txt"><b>{{ h.titre }}</b><small>{{ h.points }} points@if (h.palier) { · palier {{ h.palier }} }</small></span>
          @if (h.gain) { <span class="jx-res gagne">{{ h.gain.libelle_affiche }}<small class="d-block fw-normal">{{ etatLot(h.gain) }}</small></span> }</div>
      }
    }
  } @else if (!erreur) { <div class="p-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Chargement…</div> }
  `,
})
export class JeuxDefisComponent implements OnInit {
  private http = inject(HttpClient);
  d: any = null;
  erreur = '';
  readonly dateHeure = dateHeure;
  readonly etatLot = etatLot;
  readonly min = Math.min;

  ngOnInit(): void {
    this.http.get<any>(`${API_JEUX}/defis/`).subscribe({ next: d => this.d = d, error: e => this.erreur = messageErreur(e) });
  }

  nbReussis(c: any): number { return c.defis.filter((x: any) => x.reussi).length; }
}
