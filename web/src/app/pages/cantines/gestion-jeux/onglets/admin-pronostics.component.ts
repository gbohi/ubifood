// Gérer les jeux → Pronostics : compétition, matchs, saisie des scores,
// classement, publication des résultats.
import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { ADMINS, aUnRole } from 'src/app/core/helpers/roles';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { API_JEUX, dateHeure, messageErreur, versIso } from '../../jeux/jeux-outils';

@Component({
  selector: 'app-admin-pronostics',
  template: `
  @switch (vue) {
    @case ('liste') {
      <div class="d-flex mb-3">@if (admin) { <button type="button" class="btn-ubi vert ms-auto" (click)="nouveau()"><i class="ri-add-line"></i>Nouvelle compétition</button> }</div>
      <div class="lst-carte"><div class="lst-table-wrap"><table class="lst-table">
        <thead><tr><th>Compétition</th><th>Matchs</th><th>État</th><th class="text-end">Joueurs</th><th></th></tr></thead>
        <tbody>@for (c of liste; track c.id) {
          <tr><td><b>{{ c.titre }}</b><small class="d-block ep-muted">{{ c.nb_gagnants }} lot(s) · exact {{ c.points_exact }} pts / résultat {{ c.points_resultat }} pt</small></td>
            <td>{{ c.nb_matchs }}@if (c.debut) { <small class="d-block ep-muted">{{ dateHeure(c.debut) }} → {{ dateHeure(c.fin) }}</small> }</td>
            <td><span class="lst-tag" [ngClass]="classe(c.etat)">{{ c.etat_libelle }}</span>@if (c.suspension) { <span class="lst-tag t-or ms-1" [title]="c.suspension.motif || ''"><i class="ri-pause-circle-line"></i>Suspendu</span> }</td>
            <td class="text-end">{{ c.nb_joueurs }}</td>
            <td class="text-end lst-nowrap"><button type="button" class="btn-ubi sm" (click)="ouvrir(c)"><i class="ri-football-line"></i>Matchs</button>
              @if (c.publie_le) { <button type="button" class="btn-ubi sm navy ms-1" (click)="voirClassement(c)"><i class="ri-bar-chart-horizontal-line"></i>Classement</button> }
              @if (admin) { <app-actions-jeu class="ms-1" [jeu]="c" source="pronostics" [suspendable]="c.etat === 'a_venir' || c.etat === 'en_cours'" (change)="$event?.id ? ouvrir($event) : charger()"></app-actions-jeu> }</td></tr>
        } @empty { <tr><td colspan="5" class="lst-vide"><i class="ri-football-line"></i><b>Aucune compétition.</b></td></tr> }</tbody></table></div></div>
    }
    @case ('edition') {
      <div class="d-flex gap-2 mb-3 flex-wrap">
        <button type="button" class="btn-ubi" (click)="retour()"><i class="ri-arrow-left-line"></i>Retour</button>
        @if (modifiable) {
          <button type="button" class="btn-ubi navy ms-auto" [disabled]="envoi" (click)="enregistrer()"><i class="ri-save-line"></i>Enregistrer</button>
          @if (courant && !courant.publie_le) { <button type="button" class="btn-ubi vert" [disabled]="envoi" (click)="action('programmer')"><i class="ri-send-plane-line"></i>Programmer</button> }
          @if (courant?.publie_le) { <button type="button" class="btn-ubi rouge" (click)="action('annuler')"><i class="ri-close-circle-line"></i>Annuler</button> }
        }
      </div>
      <fieldset [disabled]="!modifiable">
        <div class="ep-carte mb-3"><div class="row g-3">
          <div class="col-md-5"><label class="ep-lab">Titre</label><input class="form-control" [(ngModel)]="f.titre" placeholder="CAN 2027"></div>
          <div class="col-md-2"><label class="ep-lab">Score exact</label><div class="input-group"><input type="number" min="1" class="form-control" [(ngModel)]="f.points_exact"><span class="input-group-text">pts</span></div></div>
          <div class="col-md-2"><label class="ep-lab">Bon résultat</label><div class="input-group"><input type="number" min="0" class="form-control" [(ngModel)]="f.points_resultat"><span class="input-group-text">pt</span></div></div>
          <div class="col-md-3"><label class="ep-lab">Repas minimum (mois du match)</label><input type="number" min="0" class="form-control" [(ngModel)]="f.repas_minimum"></div>
          <div class="col-md-8"><label class="ep-lab">Lots</label>
            @for (l of f.lots; track $index; let i = $index) {
              <div class="d-flex gap-2 mb-1 align-items-center"><input type="number" class="form-control form-control-sm" style="width:64px" [(ngModel)]="l.rang_debut">à
                <input type="number" class="form-control form-control-sm" style="width:64px" [(ngModel)]="l.rang_fin">
                <select class="form-select form-select-sm" style="width:100px" [(ngModel)]="l.type"><option value="objet">Objet</option><option value="argent">Argent</option></select>
                @if (l.type === 'argent') { <input type="number" class="form-control form-control-sm" [(ngModel)]="l.montant" placeholder="Montant F"> } @else { <input class="form-control form-control-sm" [(ngModel)]="l.libelle" placeholder="Maillot des Éléphants">
                  <input type="number" min="0" class="form-control form-control-sm" style="width:130px" [(ngModel)]="l.valeur" placeholder="valeur F"> }
                <button type="button" class="ep-x" (click)="f.lots.splice(i, 1)"><i class="ri-close-line"></i></button></div>
            }
            <button type="button" class="btn-ubi sm" (click)="f.lots.push({rang_debut: f.lots.length + 1, rang_fin: f.lots.length + 1, type: 'objet', libelle: '', montant: null})"><i class="ri-add-line"></i>Lot</button></div>
          <div class="col-md-4"><label class="ep-lab">Agences <span class="ep-muted">(aucune : toutes)</span></label>
            <div class="gj-agences">@for (a of agences; track a.id) { <label class="form-check mb-0"><input type="checkbox" class="form-check-input" [checked]="f.agences.includes(a.id)" (change)="basculer(a.id)"> {{ a.nom_agence }}</label> }</div></div>
        </div></div>
      </fieldset>
      @if (courant) {
        <div class="ep-carte">
          <b class="ep-titre-carte d-flex mb-2"><i class="ri-football-line"></i>Matchs ({{ courant.matchs.length }})</b>
          <table class="lst-table"><thead><tr><th>Coup d'envoi</th><th>Phase</th><th>Match</th><th class="text-center">Pronostics</th><th>Score</th></tr></thead><tbody>
            @for (m of courant.matchs; track m.id) {
              <tr><td class="lst-nowrap">{{ dateHeure(m.coup_envoi) }}</td><td>{{ m.phase }}</td><td><b>{{ m.equipe_a }}</b> – <b>{{ m.equipe_b }}</b></td>
                <td class="text-center">{{ m.nb_pronostics }}</td>
                <td class="lst-nowrap">
                  @if (m.annule) { <span class="lst-tag t-ro">annulé</span> }
                  @else if (m.ouvert) { <span class="ep-muted small">pas commencé</span>
                    @if (admin && !m.nb_pronostics) { <button type="button" class="ep-x ms-1" (click)="supprimerMatch(m)" title="Supprimer"><i class="ri-delete-bin-line"></i></button> } }
                  @else if (admin && !courant.resultats_publies_le) {
                    <input type="number" min="0" class="form-control form-control-sm d-inline-block" style="width:56px" [(ngModel)]="scores[m.id].a"> –
                    <input type="number" min="0" class="form-control form-control-sm d-inline-block" style="width:56px" [(ngModel)]="scores[m.id].b">
                    <button type="button" class="btn-ubi sm vert ms-1" (click)="score(m)" title="Enregistrer le score et notifier"><i class="ri-check-line"></i></button>
                    <button type="button" class="btn-ubi sm rouge ms-1" (click)="score(m, true)" title="Match annulé (0 point)"><i class="ri-forbid-line"></i></button>
                  } @else if (m.score_a !== null) { <b>{{ m.score_a }} – {{ m.score_b }}</b> }
                </td></tr>
            } @empty { <tr><td colspan="5" class="lst-vide"><b>Aucun match.</b></td></tr> }
          </tbody></table>
          @if (modifiable) {
            <div class="d-flex gap-2 mt-3 flex-wrap align-items-end">
              <div><label class="ep-lab mb-1">Équipe A</label><input class="form-control form-control-sm" [(ngModel)]="nm.equipe_a" placeholder="Côte d'Ivoire"></div>
              <div><label class="ep-lab mb-1">Équipe B</label><input class="form-control form-control-sm" [(ngModel)]="nm.equipe_b" placeholder="Mali"></div>
              <div><label class="ep-lab mb-1">Phase</label><input class="form-control form-control-sm" [(ngModel)]="nm.phase" placeholder="Groupe A"></div>
              <div><label class="ep-lab mb-1">Coup d'envoi</label><input type="datetime-local" class="form-control form-control-sm" [(ngModel)]="nm.coup_envoi"></div>
              <button type="button" class="btn-ubi sm vert" (click)="ajouterMatch()"><i class="ri-add-line"></i>Ajouter le match</button>
            </div>
          }
        </div>
      } @else { <div class="ep-alerte a-bl"><i class="ri-information-line"></i><div>Enregistrez la compétition pour ajouter les matchs.</div></div> }
    }
    @case ('classement') {
      <div class="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <button type="button" class="btn-ubi" (click)="retour()"><i class="ri-arrow-left-line"></i>Retour</button>
        <b class="fs-5">{{ cl?.competition?.titre }}</b><span class="ep-muted">{{ cl?.definitif ? 'Résultats publiés' : 'Provisoire' }}</span>
        @if (admin && cl && !cl.definitif) { <button type="button" class="btn-ubi vert ms-auto" [disabled]="envoi || cl.competition.etat !== 'terminee'" (click)="publier()"
          [title]="cl.competition.etat === 'terminee' ? '' : 'Saisissez d\\'abord tous les scores'"><i class="ri-megaphone-line"></i>Publier les résultats</button> }
      </div>
      @if (cl) {
        <div class="lst-carte"><div class="lst-table-wrap"><table class="lst-table">
          <thead><tr><th>Rang</th><th>Employé</th><th>Agence</th><th class="text-end">Points</th><th class="text-center">Exacts</th><th class="text-center">Bons résultats</th><th>Lot</th></tr></thead>
          <tbody>@for (l of cl.lignes; track l.matricule) {
            <tr><td><b>{{ l.rang }}</b></td><td><b>{{ l.employe }}</b><small class="d-block ep-muted">{{ l.matricule }}</small></td><td>{{ l.agence }}</td>
              <td class="text-end"><b>{{ l.points }}</b></td><td class="text-center">{{ l.nb_exacts }}</td><td class="text-center">{{ l.nb_resultats }}</td>
              <td>@if (l.gain) { <span class="gj-lot"><i class="ri-trophy-line"></i>{{ l.gain.libelle_affiche }}</span> }</td></tr>
          } @empty { <tr><td colspan="7" class="lst-vide"><b>Aucun pronostic.</b></td></tr> }</tbody></table></div></div>
      }
    }
  }
  `,
})
export class AdminPronosticsComponent implements OnInit {
  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  readonly admin = aUnRole(inject(TokenStorageService).getUser(), ADMINS);
  readonly dateHeure = dateHeure;
  vue: 'liste' | 'edition' | 'classement' = 'liste';
  liste: any[] = [];
  agences: any[] = [];
  courant: any = null;
  cl: any = null;
  f: any = this.vide();
  nm: any = { equipe_a: '', equipe_b: '', phase: '', coup_envoi: '' };
  scores: Record<number, { a: any; b: any }> = {};
  envoi = false;

  ngOnInit(): void {
    this.charger();
    this.http.get<any[]>(`${API_JEUX}/allnopagin/agences/`).subscribe({ next: a => this.agences = a || [] });
  }

  get modifiable(): boolean { return this.admin && !this.courant?.resultats_publies_le && !this.courant?.annule_le; }

  charger(): void { this.http.get<any[]>(`${API_JEUX}/admin/pronostics/`).subscribe({ next: l => this.liste = l }); }

  classe(e: string): string { return ({ en_cours: 't-ve', a_venir: 't-bl', terminee: 't-or', resultats: 't-na', brouillon: 't-gr', annule: 't-ro' } as any)[e] || 't-gr'; }

  nouveau(): void { this.courant = null; this.f = this.vide(); this.vue = 'edition'; }

  ouvrir(c: any): void { this.http.get<any>(`${API_JEUX}/admin/pronostics/${c.id}/`).subscribe({ next: d => { this.remplir(d); this.vue = 'edition'; } }); }

  retour(): void { this.vue = 'liste'; this.charger(); }

  basculer(id: number): void { const i = this.f.agences.indexOf(id); i >= 0 ? this.f.agences.splice(i, 1) : this.f.agences.push(id); }

  enregistrer(): void {
    this.envoi = true;
    const req = this.courant ? this.http.put<any>(`${API_JEUX}/admin/pronostics/${this.courant.id}/`, this.f) : this.http.post<any>(`${API_JEUX}/admin/pronostics/`, this.f);
    req.subscribe({ next: d => { this.envoi = false; this.remplir(d); this.toastr.success('Compétition enregistrée.'); },
                    error: e => { this.envoi = false; this.toastr.error(messageErreur(e)); } });
  }

  action(a: 'programmer' | 'annuler'): void {
    if (!confirm(a === 'programmer' ? 'Programmer la compétition ? Tous les employés concernés seront notifiés.' : 'Annuler la compétition ?')) return;
    this.http.post<any>(`${API_JEUX}/admin/pronostics/${this.courant.id}/${a}/`, {}).subscribe({
      next: d => { this.remplir(d); this.toastr.success(a === 'programmer' ? 'Compétition programmée.' : 'Compétition annulée.'); },
      error: e => this.toastr.error(messageErreur(e)),
    });
  }

  ajouterMatch(): void {
    this.http.post<any>(`${API_JEUX}/admin/pronostics/${this.courant.id}/matchs/`, { ...this.nm, coup_envoi: versIso(this.nm.coup_envoi) }).subscribe({
      next: d => { this.remplir(d); this.nm = { ...this.nm, equipe_a: '', equipe_b: '' }; },
      error: e => this.toastr.error(messageErreur(e)),
    });
  }

  supprimerMatch(m: any): void {
    this.http.delete<any>(`${API_JEUX}/admin/pronostics/matchs/${m.id}/`).subscribe({ next: d => this.remplir(d), error: e => this.toastr.error(messageErreur(e)) });
  }

  score(m: any, annule = false): void {
    const s = this.scores[m.id];
    if (annule && !confirm(`Annuler ${m.equipe_a} – ${m.equipe_b} ? 0 point pour tous.`)) return;
    this.http.post<any>(`${API_JEUX}/admin/pronostics/matchs/${m.id}/score/`, annule ? { annule: true } : { score_a: s.a, score_b: s.b }).subscribe({
      next: d => { this.remplir(d); this.toastr.success(annule ? 'Match annulé.' : 'Score enregistré : les joueurs ont été notifiés.'); },
      error: e => this.toastr.error(messageErreur(e)),
    });
  }

  voirClassement(c: any): void {
    this.vue = 'classement'; this.cl = null;
    this.http.get<any>(`${API_JEUX}/admin/pronostics/${c.id}/classement/`).subscribe({ next: r => this.cl = r });
  }

  publier(): void {
    if (!confirm('Publier les résultats ? Les lots sont attribués (argent crédité) et chacun est notifié. Action définitive.')) return;
    this.envoi = true;
    this.http.post<any>(`${API_JEUX}/admin/pronostics/${this.cl.competition.id}/publier-resultats/`, {}).subscribe({
      next: d => { this.envoi = false; this.toastr.success('Résultats publiés.'); this.voirClassement(d); },
      error: e => { this.envoi = false; this.toastr.error(messageErreur(e)); },
    });
  }

  private remplir(d: any): void {
    this.courant = d;
    this.f = { titre: d.titre, description: d.description, points_exact: d.points_exact, points_resultat: d.points_resultat, repas_minimum: d.repas_minimum,
               agences: d.agences.map((a: any) => a.id), lots: d.lots.map((l: any) => ({ rang_debut: l.rang_debut, rang_fin: l.rang_fin, type: l.type, libelle: l.libelle, montant: l.montant, valeur: l.valeur })) };
    this.scores = {};
    for (const m of d.matchs || []) this.scores[m.id] = { a: m.score_a, b: m.score_b };
  }

  private vide(): any {
    return { titre: '', description: '', points_exact: 3, points_resultat: 1, repas_minimum: 1, agences: [],
             lots: [{ rang_debut: 1, rang_fin: 1, type: 'objet', libelle: '', montant: null }] };
  }
}
