// Gérer les jeux → Défis : programme du mois (objectifs et points réglables),
// paliers de récompense, suivi de la progression, clôture du mois.
import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { ADMINS, aUnRole } from 'src/app/core/helpers/roles';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { API_JEUX, dateHeure, messageErreur } from '../../jeux/jeux-outils';

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

@Component({
  selector: 'app-admin-defis',
  template: `
  @switch (vue) {
    @case ('liste') {
      <div class="d-flex mb-3">@if (admin) { <button type="button" class="btn-ubi vert ms-auto" (click)="nouveau()"><i class="ri-add-line"></i>Nouveau programme de défis</button> }</div>
      <div class="lst-carte"><div class="lst-table-wrap"><table class="lst-table">
        <thead><tr><th>Programme</th><th>Défis</th><th>État</th><th class="text-end">Défis réussis</th><th></th></tr></thead>
        <tbody>
          @for (c of liste; track c.id) {
            <tr><td><b>{{ c.titre }}</b><small class="d-block ep-muted">{{ c.mois_libelle }} · {{ c.paliers.length }} palier(s)</small></td>
              <td><small>@for (d of c.defis; track d.code) { {{ d.nom }} (+{{ d.points }})@if (!$last) { · } }</small></td>
              <td><span class="lst-tag" [ngClass]="classe(c.etat)">{{ c.etat_libelle }}</span></td>
              <td class="text-end">{{ c.nb_reussites }}</td>
              <td class="text-end lst-nowrap">
                <button type="button" class="btn-ubi sm" (click)="ouvrir(c)"><i [class]="admin && !c.cloture_le && !c.annule_le ? 'ri-edit-line' : 'ri-eye-line'"></i></button>
                @if (c.publie_le) { <button type="button" class="btn-ubi sm navy ms-1" (click)="suivre(c)"><i class="ri-line-chart-line"></i>Suivi</button> }
                @if (admin && c.publie_le && !c.cloture_le && !c.annule_le) { <button type="button" class="btn-ubi sm rouge ms-1" (click)="action(c, 'annuler')" title="Annuler"><i class="ri-close-circle-line"></i></button> }
                @if (admin && (!c.publie_le || c.annule_le)) { <button type="button" class="btn-ubi sm rouge ms-1" (click)="supprimer(c)" title="Supprimer"><i class="ri-delete-bin-line"></i></button> }
              </td></tr>
          } @empty { <tr><td colspan="5" class="lst-vide"><i class="ri-medal-line"></i><b>Aucun programme de défis.</b></td></tr> }
        </tbody></table></div></div>
    }
    @case ('edition') {
      <div class="d-flex gap-2 mb-3 flex-wrap">
        <button type="button" class="btn-ubi" (click)="retour()"><i class="ri-arrow-left-line"></i>Retour</button>
        @if (modifiable) {
          <button type="button" class="btn-ubi navy ms-auto" [disabled]="envoi" (click)="enregistrer()"><i class="ri-save-line"></i>Enregistrer</button>
          @if (!courant?.publie_le) { <button type="button" class="btn-ubi vert" [disabled]="envoi" (click)="enregistrer(true)"><i class="ri-send-plane-line"></i>Enregistrer et programmer</button> }
        }
      </div>
      <fieldset [disabled]="!modifiable">
        <div class="ep-carte mb-3"><div class="row g-3">
          <div class="col-md-5"><label class="ep-lab">Titre</label><input class="form-control" [(ngModel)]="f.titre" placeholder="Défis de novembre"></div>
          <div class="col-md-4"><label class="ep-lab">Mois du jeu</label>
            <div class="d-flex gap-2"><select class="form-select" [(ngModel)]="f.mois">@for (m of moisNoms; track $index) { <option [ngValue]="$index + 1">{{ m }}</option> }</select>
              <input type="number" class="form-control" style="width:100px" [(ngModel)]="f.annee"></div></div>
          <div class="col-md-3"><label class="ep-lab">Points au total</label><div class="form-control gj-calc">{{ total() }} points possibles</div></div>
        </div></div>
        <div class="ep-carte mb-3">
          <b class="ep-titre-carte d-flex mb-2"><i class="ri-flag-line"></i>Défis du mois <small class="ep-muted fw-normal ms-1">(mettez 0 point pour désactiver un défi)</small></b>
          <table class="lst-table gj-defis"><thead><tr><th>Défi</th><th>Objectif</th><th style="width:130px">Points</th></tr></thead><tbody>
            <tr><td><b><i class="ri-fire-line"></i> Fidèle</b><small class="d-block ep-muted">Jours de service de suite avec une commande (les jours sans menu ne cassent pas la série)</small></td>
              <td><div class="input-group input-group-sm"><input type="number" min="1" max="31" class="form-control" [(ngModel)]="f.serie_jours"><span class="input-group-text">jours de suite</span></div></td>
              <td><input type="number" min="0" class="form-control form-control-sm" [(ngModel)]="f.serie_points"></td></tr>
            <tr><td><b><i class="ri-restaurant-2-line"></i> Gourmet curieux</b><small class="d-block ep-muted">Plats différents goûtés dans le mois</small>
                <label class="form-check small mb-0"><input type="checkbox" class="form-check-input" [(ngModel)]="f.plats_nouveaux"> seulement des plats jamais commandés avant</label></td>
              <td><div class="input-group input-group-sm"><input type="number" min="1" max="100" class="form-control" [(ngModel)]="f.plats_nombre"><span class="input-group-text">plats</span></div></td>
              <td><input type="number" min="0" class="form-control form-control-sm" [(ngModel)]="f.plats_points"></td></tr>
            <tr><td><b><i class="ri-star-smile-line"></i> Critique culinaire</b><small class="d-block ep-muted">Avis donnés sur les repas du mois</small></td>
              <td><div class="input-group input-group-sm"><input type="number" min="1" max="100" class="form-control" [(ngModel)]="f.avis_nombre"><span class="input-group-text">avis</span></div></td>
              <td><input type="number" min="0" class="form-control form-control-sm" [(ngModel)]="f.avis_points"></td></tr>
            <tr><td><b><i class="ri-checkbox-circle-line"></i> Zéro oubli</b><small class="d-block ep-muted">Tous les repas du mois retirés (constaté à la clôture)</small></td>
              <td><div class="input-group input-group-sm"><span class="input-group-text">au moins</span><input type="number" min="1" max="31" class="form-control" [(ngModel)]="f.retraits_minimum"><span class="input-group-text">repas</span></div></td>
              <td><input type="number" min="0" class="form-control form-control-sm" [(ngModel)]="f.retraits_points"></td></tr>
          </tbody></table>
        </div>
        <div class="row g-3 mb-3">
          <div class="col-lg-8"><div class="ep-carte h-100">
            <b class="ep-titre-carte d-flex mb-2"><i class="ri-medal-line"></i>Paliers <small class="ep-muted fw-normal ms-1">(récompense du plus haut palier atteint)</small></b>
            <table class="lst-table"><thead><tr><th>Nom</th><th>Dès</th><th>Type</th><th>Récompense</th><th>Quantité</th><th></th></tr></thead><tbody>
              @for (p of f.paliers; track $index; let i = $index) {
                <tr><td><input class="form-control form-control-sm" style="width:100px" [(ngModel)]="p.nom" placeholder="Bronze"></td>
                  <td><div class="input-group input-group-sm" style="width:110px"><input type="number" min="1" class="form-control" [(ngModel)]="p.points_min"><span class="input-group-text">pts</span></div></td>
                  <td><select class="form-select form-select-sm" style="min-width:110px" [(ngModel)]="p.type"><option value="argent">Argent</option><option value="objet">Objet</option></select></td>
                  <td>@if (p.type === 'argent') { <div class="input-group input-group-sm"><input type="number" min="1" class="form-control" [(ngModel)]="p.montant"><span class="input-group-text">F</span></div> }
                      @else { <input class="form-control form-control-sm" [(ngModel)]="p.libelle" placeholder="T-shirt UbiFood"><div class="input-group input-group-sm mt-1"><span class="input-group-text">valeur</span><input type="number" min="0" class="form-control" [(ngModel)]="p.valeur" placeholder="estimée"><span class="input-group-text">F</span></div> }</td>
                  <td><input type="number" min="1" class="form-control form-control-sm" style="width:90px" [(ngModel)]="p.quantite" placeholder="illimité"></td>
                  <td>@if (modifiable) { <button type="button" class="ep-x" (click)="f.paliers.splice(i, 1)"><i class="ri-close-line"></i></button> }</td></tr>
              }
            </tbody></table>
            @if (modifiable) { <button type="button" class="btn-ubi sm mt-2" (click)="ajouterPalier()"><i class="ri-add-line"></i>Ajouter un palier</button> }
            <div class="gj-aide"><i class="ri-information-line"></i>Quantité limitée : attribuée par classement (points, puis défis réussis le plus tôt) ; au-delà, le palier inférieur s'applique.</div>
          </div></div>
          <div class="col-lg-4"><div class="ep-carte h-100">
            <label class="ep-lab mb-1">Agences concernées <span class="ep-muted">(aucune : toutes)</span></label>
            <div class="gj-agences">@for (a of agences; track a.id) { <label class="form-check mb-0"><input type="checkbox" class="form-check-input" [checked]="f.agences.includes(a.id)" (change)="basculer(a.id)"> {{ a.nom_agence }}</label> }</div>
          </div></div>
        </div>
      </fieldset>
    }
    @case ('suivi') {
      <div class="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <button type="button" class="btn-ubi" (click)="retour()"><i class="ri-arrow-left-line"></i>Retour</button>
        <b class="fs-5">{{ suivi?.campagne?.titre }}</b>
        @if (admin && suivi?.campagne?.etat === 'a_cloturer') {
          <button type="button" class="btn-ubi vert ms-auto" [disabled]="envoi || !suivi.campagne.peut_cloturer" (click)="action(suivi.campagne, 'cloturer')"
                  [title]="suivi.campagne.peut_cloturer ? '' : 'Possible à partir du ' + suivi.campagne.cloture_possible_le"><i class="ri-flag-2-line"></i>Clôturer et attribuer les récompenses</button>
        }
      </div>
      @if (suivi; as s) {
        <div class="ep-kpis-ligne ep-kpis-4 mb-3">
          <div class="ep-carte ep-kpi"><span class="ep-kpi-ic bl"><i class="ri-team-line"></i></span><div><small>Employés concernés</small><b>{{ s.kpi.concernes }}</b></div></div>
          <div class="ep-carte ep-kpi"><span class="ep-kpi-ic ve"><i class="ri-shopping-basket-2-line"></i></span><div><small>Ont commandé</small><b>{{ s.kpi.actifs }}</b></div></div>
          <div class="ep-carte ep-kpi"><span class="ep-kpi-ic or"><i class="ri-medal-line"></i></span><div><small>Avec des points</small><b>{{ s.kpi.avec_points }}</b></div></div>
          <div class="ep-carte ep-kpi"><span class="ep-kpi-ic ro"><i class="ri-fire-line"></i></span><div><small>Défis réussis</small><b>{{ s.kpi.par_defi.serie + s.kpi.par_defi.plats + s.kpi.par_defi.avis + s.kpi.par_defi.retraits }}</b></div></div>
        </div>
        <div class="lst-carte"><div class="lst-table-wrap"><table class="lst-table">
          <thead><tr><th>Employé</th><th>Agence</th><th class="text-center">Série</th><th class="text-center">Plats</th><th class="text-center">Avis</th><th class="text-center">Retirés</th><th>Défis réussis</th><th class="text-end">Points</th><th>Récompense</th></tr></thead>
          <tbody>@for (l of s.lignes; track l.matricule) {
            <tr><td><b>{{ l.employe }}</b><small class="d-block ep-muted">{{ l.matricule }}</small></td><td>{{ l.agence }}</td>
              <td class="text-center">{{ l.serie }}</td><td class="text-center">{{ l.plats }}</td><td class="text-center">{{ l.avis }}</td>
              <td class="text-center">{{ l.retires }}/{{ l.commandes }}@if (l.oublies) { <small class="d-block text-danger">{{ l.oublies }} oublié(s)</small> }</td>
              <td>@for (r of l.reussis; track r) { <span class="lst-tag t-ve me-1">{{ noms[r] }}</span> }</td>
              <td class="text-end"><b>{{ l.points }}</b></td>
              <td>@if (l.gain) { <span class="gj-lot"><i class="ri-medal-line"></i>{{ l.palier }} : {{ l.gain.libelle_affiche }}</span>
                    <small class="d-block ep-muted">{{ l.gain.statut_lot === 'remis' ? 'retiré le ' + dateHeure(l.gain.lot_remis_le) : l.gain.statut_lot === 'credite' ? 'crédité' : 'à remettre (onglet Lots à remettre)' }}</small> }</td></tr>
          } @empty { <tr><td colspan="9" class="lst-vide"><b>Aucun employé concerné.</b></td></tr> }</tbody></table></div></div>
      }
    }
  }
  `,
})
export class AdminDefisComponent implements OnInit {
  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  readonly admin = aUnRole(inject(TokenStorageService).getUser(), ADMINS);
  readonly moisNoms = MOIS;
  readonly dateHeure = dateHeure;
  readonly noms: Record<string, string> = { serie: 'Fidèle', plats: 'Gourmet curieux', avis: 'Critique culinaire', retraits: 'Zéro oubli' };
  vue: 'liste' | 'edition' | 'suivi' = 'liste';
  liste: any[] = [];
  agences: any[] = [];
  courant: any = null;
  suivi: any = null;
  f: any = this.vide();
  envoi = false;

  ngOnInit(): void {
    this.charger();
    this.http.get<any[]>(`${API_JEUX}/allnopagin/agences/`).subscribe({ next: a => this.agences = a || [] });
  }

  get modifiable(): boolean { return this.admin && !this.courant?.cloture_le && !this.courant?.annule_le; }

  charger(): void { this.http.get<any[]>(`${API_JEUX}/admin/defis/`).subscribe({ next: l => this.liste = l, error: e => this.toastr.error(messageErreur(e)) }); }

  classe(e: string): string { return ({ en_cours: 't-ve', a_venir: 't-bl', a_cloturer: 't-or', cloture: 't-na', brouillon: 't-gr', annule: 't-ro' } as any)[e] || 't-gr'; }

  total(): number {
    const f = this.f; const n = (x: any) => Number(x) || 0;
    return n(f.serie_points) + n(f.plats_points) + n(f.avis_points) + n(f.retraits_points);
  }

  nouveau(): void { this.courant = null; this.f = this.vide(); this.vue = 'edition'; }

  ouvrir(c: any): void {
    this.http.get<any>(`${API_JEUX}/admin/defis/${c.id}/`).subscribe({ next: d => { this.remplir(d); this.vue = 'edition'; } });
  }

  suivre(c: any): void {
    this.vue = 'suivi'; this.suivi = null;
    this.http.get<any>(`${API_JEUX}/admin/defis/${c.id}/suivi/`).subscribe({ next: s => this.suivi = s, error: e => this.toastr.error(messageErreur(e)) });
  }

  retour(): void { this.vue = 'liste'; this.charger(); }

  ajouterPalier(): void {
    const max = this.f.paliers.reduce((m: number, p: any) => Math.max(m, Number(p.points_min) || 0), 0);
    this.f.paliers.push({ nom: '', points_min: max + 20, type: 'argent', montant: null, libelle: '', quantite: null });
  }

  basculer(id: number): void { const i = this.f.agences.indexOf(id); i >= 0 ? this.f.agences.splice(i, 1) : this.f.agences.push(id); }

  enregistrer(programmer = false): void {
    this.envoi = true;
    const req = this.courant ? this.http.put<any>(`${API_JEUX}/admin/defis/${this.courant.id}/`, this.f) : this.http.post<any>(`${API_JEUX}/admin/defis/`, this.f);
    req.subscribe({
      next: d => { this.envoi = false; this.remplir(d); if (programmer) this.action(d, 'programmer'); else this.toastr.success('Programme enregistré.'); },
      error: e => { this.envoi = false; this.toastr.error(messageErreur(e)); },
    });
  }

  action(c: any, a: 'programmer' | 'annuler' | 'cloturer'): void {
    const q = { programmer: `Programmer « ${c.titre} » ? Tous les employés concernés seront notifiés.`, annuler: `Annuler « ${c.titre} » ?`,
                cloturer: 'Clôturer le mois ? Les défis sont recalculés, les récompenses attribuées (argent crédité) et chacun est notifié. Action définitive.' }[a];
    if (!confirm(q)) return;
    this.envoi = true;
    this.http.post<any>(`${API_JEUX}/admin/defis/${c.id}/${a}/`, {}).subscribe({
      next: d => { this.envoi = false; this.toastr.success({ programmer: 'Programmé : les employés ont été notifiés.', annuler: 'Programme annulé.', cloturer: 'Mois clôturé, récompenses attribuées.' }[a]);
                   if (this.vue === 'suivi') this.suivre(d); else if (this.vue === 'edition') this.remplir(d); else this.charger(); },
      error: e => { this.envoi = false; this.toastr.error(messageErreur(e)); },
    });
  }

  supprimer(c: any): void {
    if (!confirm(`Supprimer « ${c.titre} » ?`)) return;
    this.http.delete(`${API_JEUX}/admin/defis/${c.id}/`).subscribe({ next: () => this.charger(), error: e => this.toastr.error(messageErreur(e)) });
  }

  private remplir(d: any): void {
    this.courant = d;
    this.f = { titre: d.titre, annee: d.annee, mois: d.mois, serie_jours: d.serie_jours, serie_points: d.serie_points, plats_nombre: d.plats_nombre,
               plats_points: d.plats_points, plats_nouveaux: d.plats_nouveaux, avis_nombre: d.avis_nombre, avis_points: d.avis_points,
               retraits_minimum: d.retraits_minimum, retraits_points: d.retraits_points, agences: d.agences.map((a: any) => a.id),
               paliers: d.paliers.map((p: any) => ({ nom: p.nom, points_min: p.points_min, type: p.type, montant: p.montant, libelle: p.libelle, quantite: p.quantite, valeur: p.valeur })) };
  }

  private vide(): any {
    const d = new Date(); const prochain = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return { titre: `Défis de ${MOIS[prochain.getMonth()].toLowerCase()}`, annee: prochain.getFullYear(), mois: prochain.getMonth() + 1,
             serie_jours: 5, serie_points: 20, plats_nombre: 3, plats_points: 15, plats_nouveaux: true, avis_nombre: 5, avis_points: 10,
             retraits_minimum: 5, retraits_points: 25, agences: [],
             paliers: [{ nom: 'Bronze', points_min: 20, type: 'argent', montant: 500, libelle: '', quantite: null },
                       { nom: 'Argent', points_min: 45, type: 'argent', montant: 1000, libelle: '', quantite: null },
                       { nom: 'Or', points_min: 70, type: 'objet', montant: null, libelle: 'T-shirt UbiFood', quantite: 20 }] };
  }
}
