// Gérer les jeux → Lots à remettre : tous les lots objets gagnés (quiz,
// défis, pronostics, tickets) ; « Lot retiré » une seule fois.
import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { API_JEUX, dateHeure, messageErreur } from '../../jeux/jeux-outils';

@Component({
  selector: 'app-lots-a-remettre',
  template: `
  <div class="d-flex gap-2 mb-3 align-items-center flex-wrap">
    <div class="ep-onglets mb-0">
      <button type="button" class="ep-onglet" [class.on]="statut === 'a_remettre'" (click)="statut = 'a_remettre'; charger()">À remettre</button>
      <button type="button" class="ep-onglet" [class.on]="statut === 'remis'" (click)="statut = 'remis'; charger()">Déjà retirés</button>
    </div>
    <input class="form-control ms-auto" style="max-width:260px" [(ngModel)]="filtre" placeholder="Rechercher un employé, un matricule…">
  </div>
  <div class="lst-carte"><div class="lst-table-wrap"><table class="lst-table">
    <thead><tr><th>Employé</th><th>Agence</th><th>Jeu</th><th>Lot</th><th>{{ statut === 'remis' ? 'Retiré' : 'Gagné le' }}</th><th></th></tr></thead>
    <tbody>@for (l of filtres(); track l.genre + l.id) {
      <tr><td><b>{{ l.employe }}</b><small class="d-block ep-muted">{{ l.matricule }}</small></td><td>{{ l.agence }}</td>
        <td>{{ l.jeu }}<small class="d-block ep-muted">{{ l.source }}</small></td><td><span class="gj-lot"><i class="ri-gift-line"></i>{{ l.lot }}</span></td>
        <td class="lst-nowrap">@if (statut === 'remis') { {{ dateHeure(l.lot_remis_le) }}<small class="d-block ep-muted">par {{ l.lot_remis_par }}</small> } @else { {{ dateHeure(l.gagne_le) }} }</td>
        <td class="text-end">@if (statut === 'a_remettre') { <button type="button" class="btn-ubi sm vert" (click)="remettre(l)"><i class="ri-hand-heart-line"></i>Lot retiré</button> }</td></tr>
    } @empty { <tr><td colspan="6" class="lst-vide"><i class="ri-gift-line"></i><b>{{ statut === 'remis' ? 'Aucun lot retiré.' : 'Aucun lot à remettre.' }}</b></td></tr> }</tbody></table></div></div>
  <div class="gj-aide"><i class="ri-shield-check-line"></i>Vérifiez l'identité (badge) avant de remettre un lot. Une fois marqué « retiré », il ne peut plus l'être une seconde fois et l'employé le voit dans son application.</div>
  `,
})
export class LotsARemettreComponent implements OnInit {
  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  readonly dateHeure = dateHeure;
  statut: 'a_remettre' | 'remis' = 'a_remettre';
  lignes: any[] = [];
  filtre = '';

  ngOnInit(): void { this.charger(); }

  charger(): void {
    this.http.get<any[]>(`${API_JEUX}/admin/jeux/lots-a-remettre/`, { params: { statut: this.statut } }).subscribe({
      next: l => this.lignes = l, error: e => this.toastr.error(messageErreur(e)),
    });
  }

  filtres(): any[] {
    const f = this.filtre.trim().toLowerCase();
    return f ? this.lignes.filter(l => `${l.employe} ${l.matricule} ${l.lot} ${l.jeu}`.toLowerCase().includes(f)) : this.lignes;
  }

  remettre(l: any): void {
    if (!confirm(`Confirmer que ${l.employe} a retiré « ${l.lot} » ? Il ne pourra pas le retirer une seconde fois.`)) return;
    const url = l.genre === 'quiz' ? `${API_JEUX}/admin/jeux/${l.jeu_id}/remettre/${l.id}/` : `${API_JEUX}/admin/jeux/gains/${l.id}/remettre/`;
    this.http.post(url, {}).subscribe({
      next: () => { this.toastr.success('Lot marqué comme retiré.'); this.charger(); },
      error: e => { this.toastr.error(messageErreur(e)); this.charger(); },
    });
  }
}
