// Gérer les jeux → Tickets à gratter : campagne, lots (probabilité, stock),
// budget maximum, statistiques et gagnants.
import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { ADMINS, aUnRole } from 'src/app/core/helpers/roles';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { API_JEUX, dateHeure, fcfa, messageErreur, versIso, versLocal } from '../../jeux/jeux-outils';

@Component({
  selector: 'app-admin-tickets',
  template: `
  @switch (vue) {
    @case ('liste') {
      <div class="d-flex mb-3">@if (admin) { <button type="button" class="btn-ubi vert ms-auto" (click)="nouveau()"><i class="ri-add-line"></i>Nouvelle campagne</button> }</div>
      <div class="lst-carte"><div class="lst-table-wrap"><table class="lst-table">
        <thead><tr><th>Campagne</th><th>Période</th><th>État</th><th class="text-end">Tickets émis / grattés</th><th class="text-end">Gagnants</th><th></th></tr></thead>
        <tbody>@for (c of liste; track c.id) {
          <tr><td><b>{{ c.titre }}</b><small class="d-block ep-muted">{{ c.ticket_par_retrait ? 'par repas retiré' : '' }}{{ c.ticket_par_retrait && c.ticket_quotidien ? ' + ' : '' }}{{ c.ticket_quotidien ? 'quotidien' : '' }}</small></td>
            <td class="lst-nowrap">{{ dateHeure(c.debut) }}<small class="d-block ep-muted">→ {{ dateHeure(c.fin) }}</small></td>
            <td><span class="lst-tag" [ngClass]="classe(c.etat)">{{ c.etat_libelle }}</span></td>
            <td class="text-end">{{ c.stats.emis }} / {{ c.stats.grattes }}</td><td class="text-end">{{ c.stats.gagnants }}</td>
            <td class="text-end lst-nowrap"><button type="button" class="btn-ubi sm" (click)="ouvrir(c)"><i class="ri-edit-line"></i></button>
              @if (c.publie_le) { <button type="button" class="btn-ubi sm navy ms-1" (click)="voirSuivi(c)"><i class="ri-trophy-line"></i>Gagnants</button> }</td></tr>
        } @empty { <tr><td colspan="6" class="lst-vide"><i class="ri-coupon-3-line"></i><b>Aucune campagne.</b></td></tr> }</tbody></table></div></div>
    }
    @case ('edition') {
      <div class="d-flex gap-2 mb-3 flex-wrap">
        <button type="button" class="btn-ubi" (click)="retour()"><i class="ri-arrow-left-line"></i>Retour</button>
        @if (modifiable) {
          <button type="button" class="btn-ubi navy ms-auto" [disabled]="envoi" (click)="enregistrer()"><i class="ri-save-line"></i>Enregistrer</button>
          @if (courant && !courant.publie_le) { <button type="button" class="btn-ubi vert" (click)="action('programmer')"><i class="ri-send-plane-line"></i>Programmer</button> }
          @if (courant?.publie_le) { <button type="button" class="btn-ubi rouge" (click)="action('annuler')"><i class="ri-close-circle-line"></i>Annuler</button> }
        }
      </div>
      <fieldset [disabled]="!modifiable">
        <div class="ep-carte mb-3"><div class="row g-3">
          <div class="col-md-4"><label class="ep-lab">Titre</label><input class="form-control" [(ngModel)]="f.titre" placeholder="Tickets de décembre"></div>
          <div class="col-md-3"><label class="ep-lab">Début</label><input type="datetime-local" class="form-control" [(ngModel)]="f.debut"></div>
          <div class="col-md-3"><label class="ep-lab">Fin</label><input type="datetime-local" class="form-control" [(ngModel)]="f.fin"></div>
          <div class="col-md-2"><label class="ep-lab">Gratter jusqu'à</label><div class="input-group"><span class="input-group-text">+</span><input type="number" min="0" max="90" class="form-control" [(ngModel)]="f.validite_jours"><span class="input-group-text">j</span></div></div>
          <div class="col-md-6"><label class="ep-lab">Comment obtenir un ticket</label>
            <label class="form-check mb-1"><input type="checkbox" class="form-check-input" [(ngModel)]="f.ticket_par_retrait"> Un ticket à chaque repas retiré</label>
            <label class="form-check mb-0"><input type="checkbox" class="form-check-input" [(ngModel)]="f.ticket_quotidien"> Un ticket gratuit par jour ouvré (lundi-vendredi), même sans commande</label></div>
          <div class="col-md-3"><label class="ep-lab">Budget maximum (lots en argent)</label><div class="input-group"><input type="number" min="0" class="form-control" [(ngModel)]="f.budget_max" placeholder="illimité"><span class="input-group-text">F</span></div>
            @if (courant) { <small class="ep-muted">consommé : {{ fcfa(courant.budget_consomme) }}</small> }</div>
          <div class="col-md-3"><label class="ep-lab">Agences <span class="ep-muted">(aucune : toutes)</span></label>
            <div class="gj-agences">@for (a of agences; track a.id) { <label class="form-check mb-0"><input type="checkbox" class="form-check-input" [checked]="f.agences.includes(a.id)" (change)="basculer(a.id)"> {{ a.nom_agence }}</label> }</div></div>
        </div></div>
        <div class="ep-carte">
          <div class="d-flex align-items-center mb-2"><b class="ep-titre-carte"><i class="ri-gift-line"></i>Lots</b>
            <span class="ms-auto lst-tag" [ngClass]="sommeProba() > 100 ? 't-ro' : 't-gr'">Perdu : {{ (100 - sommeProba()) | number:'1.0-3' }} % des tickets</span></div>
          <table class="lst-table"><thead><tr><th>Type</th><th>Lot</th><th>Stock</th><th>Probabilité par ticket</th>@if (courant) { <th class="text-end">Gagnés</th> }<th></th></tr></thead><tbody>
            @for (l of f.lots; track $index; let i = $index) {
              <tr><td><select class="form-select form-select-sm" [(ngModel)]="l.type"><option value="objet">Objet</option><option value="argent">Argent</option></select></td>
                <td>@if (l.type === 'argent') { <div class="input-group input-group-sm"><input type="number" min="1" class="form-control" [(ngModel)]="l.montant"><span class="input-group-text">F</span></div> }
                    @else { <input class="form-control form-control-sm" [(ngModel)]="l.libelle" placeholder="Dessert offert"><div class="input-group input-group-sm mt-1"><span class="input-group-text">valeur</span><input type="number" min="0" class="form-control" [(ngModel)]="l.valeur" placeholder="estimée"><span class="input-group-text">F</span></div> }</td>
                <td><input type="number" min="1" class="form-control form-control-sm" style="width:90px" [(ngModel)]="l.stock"></td>
                <td><div class="input-group input-group-sm" style="width:130px"><input type="number" min="0.001" max="100" step="0.1" class="form-control" [(ngModel)]="l.probabilite"><span class="input-group-text">%</span></div></td>
                @if (courant) { <td class="text-end">{{ l.distribues || 0 }}</td> }
                <td>@if (modifiable && !l.distribues) { <button type="button" class="ep-x" (click)="f.lots.splice(i, 1)"><i class="ri-close-line"></i></button> }</td></tr>
            }
          </tbody></table>
          @if (modifiable) { <button type="button" class="btn-ubi sm mt-2" (click)="f.lots.push({type: 'objet', libelle: '', montant: null, stock: 10, probabilite: 5})"><i class="ri-add-line"></i>Ajouter un lot</button> }
          <div class="gj-aide"><i class="ri-shield-check-line"></i>Le tirage a lieu sur le serveur. Un lot épuisé, ou en argent au-delà du budget, n'est plus tirable : sa chance revient à « Perdu ».</div>
        </div>
      </fieldset>
    }
    @case ('suivi') {
      <div class="d-flex gap-2 mb-3 align-items-center"><button type="button" class="btn-ubi" (click)="retour()"><i class="ri-arrow-left-line"></i>Retour</button><b class="fs-5">{{ suivi?.campagne?.titre }}</b></div>
      @if (suivi; as s) {
        <div class="ep-kpis-ligne ep-kpis-4 mb-3">
          <div class="ep-carte ep-kpi"><span class="ep-kpi-ic bl"><i class="ri-coupon-3-line"></i></span><div><small>Tickets émis</small><b>{{ s.campagne.stats.emis }}</b></div></div>
          <div class="ep-carte ep-kpi"><span class="ep-kpi-ic ve"><i class="ri-hand-coin-line"></i></span><div><small>Grattés</small><b>{{ s.campagne.stats.grattes }}</b></div></div>
          <div class="ep-carte ep-kpi"><span class="ep-kpi-ic or"><i class="ri-trophy-line"></i></span><div><small>Gagnants</small><b>{{ s.campagne.stats.gagnants }}</b></div></div>
          <div class="ep-carte ep-kpi"><span class="ep-kpi-ic ro"><i class="ri-wallet-3-line"></i></span><div><small>Budget consommé</small><b>{{ fcfa(s.campagne.budget_consomme) }}</b>@if (s.campagne.budget_max) { <span>sur {{ fcfa(s.campagne.budget_max) }}</span> }</div></div>
        </div>
        <div class="lst-carte"><div class="lst-table-wrap"><table class="lst-table">
          <thead><tr><th>Gratté le</th><th>Employé</th><th>Agence</th><th>Lot</th><th>Remise</th></tr></thead>
          <tbody>@for (g of s.gagnants; track g.ticket_id) {
            <tr><td class="lst-nowrap">{{ dateHeure(g.gratte_le) }}</td><td><b>{{ g.employe }}</b><small class="d-block ep-muted">{{ g.matricule }}</small></td><td>{{ g.agence }}</td>
              <td><span class="gj-lot"><i class="ri-gift-line"></i>{{ g.gain?.libelle_affiche }}</span></td>
              <td>@switch (g.gain?.statut_lot) { @case ('credite') { <span class="lst-tag t-ve">crédité</span> } @case ('remis') { <span class="lst-tag t-ve">retiré le {{ dateHeure(g.gain.lot_remis_le) }}</span> } @default { <span class="lst-tag t-or">à remettre</span> } }</td></tr>
          } @empty { <tr><td colspan="5" class="lst-vide"><b>Pas encore de gagnant.</b></td></tr> }</tbody></table></div></div>
      }
    }
  }
  `,
})
export class AdminTicketsComponent implements OnInit {
  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  readonly admin = aUnRole(inject(TokenStorageService).getUser(), ADMINS);
  readonly dateHeure = dateHeure;
  readonly fcfa = fcfa;
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

  get modifiable(): boolean { return this.admin && !this.courant?.annule_le; }

  charger(): void { this.http.get<any[]>(`${API_JEUX}/admin/tickets/`).subscribe({ next: l => this.liste = l }); }

  classe(e: string): string { return ({ en_cours: 't-ve', a_venir: 't-bl', termine: 't-na', brouillon: 't-gr', annule: 't-ro' } as any)[e] || 't-gr'; }

  sommeProba(): number { return this.f.lots.reduce((s: number, l: any) => s + (Number(l.probabilite) || 0), 0); }

  nouveau(): void { this.courant = null; this.f = this.vide(); this.vue = 'edition'; }

  ouvrir(c: any): void { this.http.get<any>(`${API_JEUX}/admin/tickets/${c.id}/`).subscribe({ next: d => { this.remplir(d); this.vue = 'edition'; } }); }

  voirSuivi(c: any): void { this.vue = 'suivi'; this.suivi = null; this.http.get<any>(`${API_JEUX}/admin/tickets/${c.id}/suivi/`).subscribe({ next: s => this.suivi = s }); }

  retour(): void { this.vue = 'liste'; this.charger(); }

  basculer(id: number): void { const i = this.f.agences.indexOf(id); i >= 0 ? this.f.agences.splice(i, 1) : this.f.agences.push(id); }

  enregistrer(): void {
    this.envoi = true;
    const corps = { ...this.f, debut: versIso(this.f.debut), fin: versIso(this.f.fin) };
    const req = this.courant ? this.http.put<any>(`${API_JEUX}/admin/tickets/${this.courant.id}/`, corps) : this.http.post<any>(`${API_JEUX}/admin/tickets/`, corps);
    req.subscribe({ next: d => { this.envoi = false; this.remplir(d); this.toastr.success('Campagne enregistrée.'); },
                    error: e => { this.envoi = false; this.toastr.error(messageErreur(e)); } });
  }

  action(a: 'programmer' | 'annuler'): void {
    if (!confirm(a === 'programmer' ? 'Programmer la campagne ? Tous les employés concernés seront notifiés.' : 'Annuler la campagne ? Les tickets non grattés ne pourront plus l\'être.')) return;
    this.http.post<any>(`${API_JEUX}/admin/tickets/${this.courant.id}/${a}/`, {}).subscribe({
      next: d => { this.remplir(d); this.toastr.success(a === 'programmer' ? 'Campagne programmée.' : 'Campagne annulée.'); },
      error: e => this.toastr.error(messageErreur(e)),
    });
  }

  private remplir(d: any): void {
    this.courant = d;
    this.f = { titre: d.titre, debut: versLocal(d.debut), fin: versLocal(d.fin), ticket_par_retrait: d.ticket_par_retrait, ticket_quotidien: d.ticket_quotidien,
               budget_max: d.budget_max, validite_jours: d.validite_jours, agences: d.agences.map((a: any) => a.id),
               lots: d.lots.map((l: any) => ({ id: l.id, type: l.type, libelle: l.libelle, montant: l.montant, stock: l.stock, probabilite: l.probabilite, distribues: l.distribues, valeur: l.valeur })) };
  }

  private vide(): any {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(7, 0, 0, 0);
    const f = new Date(d); f.setDate(f.getDate() + 30); f.setHours(18, 0, 0, 0);
    return { titre: '', debut: versLocal(d.toISOString()), fin: versLocal(f.toISOString()), ticket_par_retrait: true, ticket_quotidien: false,
             budget_max: 50000, validite_jours: 7, agences: [],
             lots: [{ type: 'objet', libelle: 'Dessert offert', montant: null, stock: 50, probabilite: 10 },
                    { type: 'argent', libelle: '', montant: 500, stock: 40, probabilite: 5 },
                    { type: 'objet', libelle: 'T-shirt UbiFood', montant: null, stock: 10, probabilite: 1 }] };
  }
}
