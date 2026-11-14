// Jeux → Mes gains : tous les lots gagnés (quiz, défis, pronostics, tickets) et leur retrait
import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_JEUX, dateHeure, etatLot, messageErreur } from '../jeux-outils';

@Component({
  selector: 'app-mes-gains',
  template: `
  @if (erreur) { <div class="ep-alerte a-ro"><i class="ri-error-warning-line"></i><div>{{ erreur }}</div></div> }
  @for (g of gains; track $index) {
    <div class="jx-ligne statique">
      <span class="jx-ic gagne"><i [class]="g.type === 'argent' ? 'ri-wallet-3-line' : 'ri-gift-line'"></i></span>
      <span class="jx-l-txt"><b>{{ g.libelle_affiche }}</b><small>{{ g.source_libelle }} · {{ g.jeu }} · gagné le {{ dateHeure(g.gagne_le) }}</small></span>
      <span class="jx-res" [ngClass]="g.statut_lot === 'a_remettre' ? 'attente' : 'gagne'"><i [class]="g.statut_lot === 'remis' ? 'ri-check-double-line' : g.statut_lot === 'credite' ? 'ri-wallet-3-line' : 'ri-hand-heart-line'"></i> {{ etatLot(g) }}</span>
    </div>
  } @empty { @if (charge) { <div class="lst-carte"><div class="lst-vide py-4"><i class="ri-gift-line"></i><b>Pas encore de lot gagné.</b><span>Participez aux jeux pour tenter votre chance !</span></div></div> } }
  `,
})
export class MesGainsComponent implements OnInit {
  private http = inject(HttpClient);
  gains: any[] = [];
  charge = false;
  erreur = '';
  readonly dateHeure = dateHeure;
  readonly etatLot = etatLot;

  ngOnInit(): void {
    this.http.get<any[]>(`${API_JEUX}/mes-gains/`).subscribe({ next: g => { this.gains = g; this.charge = true; }, error: e => this.erreur = messageErreur(e) });
  }
}
