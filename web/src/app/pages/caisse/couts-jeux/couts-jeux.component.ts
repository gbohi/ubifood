// Comptabilité → Coût des jeux : lots attribués sur une période (argent
// crédité sur les comptes repas et valeur estimée des objets), par jeu et
// par gagnant, export Excel. API : comptabilite/couts-jeux/.
import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import * as XLSX from 'xlsx';
import { API_JEUX, dateHeure, fcfa, messageErreur } from '../../cantines/jeux/jeux-outils';

@Component({
  selector: 'app-couts-jeux',
  template: `
  <div class="lst ep">
    <app-page-entete titre="Coût des jeux" icone="ri-trophy-line" [fil]="[{label: 'Comptabilité'}]"
                     sousTitre="Lots attribués : argent crédité sur les comptes repas et valeur estimée des objets">
      <input type="date" class="form-control ep-select" [(ngModel)]="debut" (change)="charger()" aria-label="Du">
      <input type="date" class="form-control ep-select" [(ngModel)]="fin" (change)="charger()" aria-label="Au">
      <button type="button" class="btn-ubi" [disabled]="!d?.lignes?.length" (click)="exporter()"><i class="ri-file-excel-2-line"></i>Excel</button>
    </app-page-entete>
    @if (d; as d) {
      <div class="ep-kpis-ligne ep-kpis-4 mb-3">
        <div class="ep-carte ep-kpi"><span class="ep-kpi-ic ro"><i class="ri-money-cny-circle-line"></i></span><div><small>Coût total</small><b>{{ fcfa(d.totaux.total) }}</b><span>{{ d.totaux.nb_gains }} lot(s)</span></div></div>
        <div class="ep-carte ep-kpi"><span class="ep-kpi-ic ve"><i class="ri-wallet-3-line"></i></span><div><small>Argent crédité</small><b>{{ fcfa(d.totaux.argent) }}</b><span>sur les comptes repas</span></div></div>
        <div class="ep-carte ep-kpi"><span class="ep-kpi-ic or"><i class="ri-gift-line"></i></span><div><small>Objets (valeur estimée)</small><b>{{ fcfa(d.totaux.objets_valeur) }}</b><span>{{ d.totaux.nb_objets }} objet(s) · {{ d.totaux.objets_a_remettre }} à remettre</span></div></div>
        <div class="ep-carte ep-kpi"><span class="ep-kpi-ic bl"><i class="ri-question-line"></i></span><div><small>Objets sans valeur</small><b>{{ d.totaux.objets_sans_valeur }}</b><span>à renseigner sur le lot</span></div></div>
      </div>
      @if (d.totaux.objets_sans_valeur) {
        <div class="ep-alerte a-or mb-3"><i class="ri-error-warning-line"></i><div><span>{{ d.totaux.objets_sans_valeur }} objet(s) sans valeur estimée : leur coût n'est pas compté.
          Renseignez la « valeur estimée » sur les lots dans Cantine → Gérer les jeux.</span></div></div>
      }
      <div class="ep-alerte a-bl mb-3"><i class="ri-information-line"></i><div><span>L'argent gagné est crédité sur le compte repas de l'employé (mouvement « Lot gagné à un jeu ») :
        c'est une dépense de l'entreprise, sans encaissement en caisse. Il sert à payer des repas ou peut être remboursé avec le solde.</span></div></div>
      <div class="lst-carte">
        <div class="lst-barre bord"><b class="ep-titre-carte"><i class="ri-gamepad-line"></i>Par jeu</b></div>
        <div class="lst-table-wrap"><table class="lst-table">
          <thead><tr><th>Jeu</th><th>Type</th><th class="text-end">Lots</th><th class="text-end">Argent crédité</th><th class="text-end">Objets</th><th class="text-end">Total</th></tr></thead>
          <tbody>
            @for (j of d.par_jeu; track j.source + j.jeu) {
              <tr><td><b>{{ j.jeu }}</b></td><td>{{ j.source }}</td><td class="text-end">{{ j.nb_gains }}</td><td class="text-end">{{ fcfa(j.argent) }}</td>
                <td class="text-end">{{ fcfa(j.objets_valeur) }}@if (j.objets_sans_valeur) { <small class="d-block text-warning">{{ j.objets_sans_valeur }} sans valeur</small> }</td>
                <td class="text-end"><b>{{ fcfa(j.total) }}</b></td></tr>
            } @empty { <tr><td colspan="6" class="lst-vide"><i class="ri-trophy-line"></i><b>Aucun lot attribué sur la période.</b></td></tr> }
            @if (d.par_jeu.length) { <tr class="ep-tot"><td colspan="2">Total</td><td class="text-end">{{ d.totaux.nb_gains }}</td><td class="text-end">{{ fcfa(d.totaux.argent) }}</td><td class="text-end">{{ fcfa(d.totaux.objets_valeur) }}</td><td class="text-end">{{ fcfa(d.totaux.total) }}</td></tr> }
          </tbody></table></div>
      </div>
      <div class="lst-carte">
        <div class="lst-barre bord"><b class="ep-titre-carte"><i class="ri-user-star-line"></i>Gagnants</b></div>
        <div class="lst-table-wrap"><table class="lst-table">
          <thead><tr><th>Date</th><th>Employé</th><th>Agence</th><th>Jeu</th><th>Lot</th><th class="text-end">Coût</th><th>Remise</th></tr></thead>
          <tbody>@for (l of d.lignes; track $index) {
            <tr><td class="lst-nowrap">{{ dateHeure(l.date, true) }}</td><td><b>{{ l.employe }}</b><small class="d-block ep-muted">{{ l.matricule }}</small></td>
              <td>{{ l.agence }}</td><td>{{ l.jeu }}<small class="d-block ep-muted">{{ l.source }}</small></td><td>{{ l.lot }}</td>
              <td class="text-end">{{ l.cout === null ? '—' : fcfa(l.cout) }}</td>
              <td>{{ etat(l) }}</td></tr>
          }</tbody></table></div>
      </div>
    } @else { <div class="p-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Chargement…</div> }
  </div>
  `,
})
export class CoutsJeuxComponent implements OnInit {
  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  readonly fcfa = fcfa;
  readonly dateHeure = dateHeure;
  d: any = null;
  debut = this.iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  fin = this.iso(new Date());

  ngOnInit(): void { this.charger(); }

  charger(): void {
    this.http.get<any>(`${API_JEUX}/comptabilite/couts-jeux/`, { params: { debut: this.debut, fin: this.fin } }).subscribe({
      next: d => this.d = d, error: e => this.toastr.error(messageErreur(e)),
    });
  }

  etat(l: any): string {
    return l.statut_lot === 'credite' ? 'Crédité' : l.statut_lot === 'remis' ? `Retiré le ${dateHeure(l.remis_le, true)}` : 'À remettre';
  }

  exporter(): void {
    const d = this.d;
    const parJeu = XLSX.utils.aoa_to_sheet([
      ['Jeu', 'Type', 'Lots', 'Argent crédité (F)', 'Objets valeur estimée (F)', 'Objets sans valeur', 'Total (F)'],
      ...d.par_jeu.map((j: any) => [j.jeu, j.source, j.nb_gains, j.argent, j.objets_valeur, j.objets_sans_valeur, j.total]),
      ['Total', '', d.totaux.nb_gains, d.totaux.argent, d.totaux.objets_valeur, d.totaux.objets_sans_valeur, d.totaux.total],
    ]);
    const lignes = XLSX.utils.aoa_to_sheet([
      ['Date', 'Matricule', 'Employé', 'Agence', 'Jeu', 'Type de jeu', 'Lot', 'Nature', 'Coût (F)', 'Remise'],
      ...d.lignes.map((l: any) => [dateHeure(l.date, true), l.matricule, l.employe, l.agence, l.jeu, l.source, l.lot,
                                   l.type === 'argent' ? 'Argent' : 'Objet', l.cout ?? '', this.etat(l)]),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, parJeu, 'Par jeu');
    XLSX.utils.book_append_sheet(wb, lignes, 'Gagnants');
    XLSX.writeFile(wb, `cout_des_jeux_${this.debut}_${this.fin}.xlsx`);
  }

  private iso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
