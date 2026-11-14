// Badge d'accès d'un employé (fiche utilisateur, page Badges) : badge actif (numéro
// masqué), associer / remplacer en posant le badge sur le lecteur, déclarer perdu,
// dissocier, réactiver un badge perdu retrouvé, historique.
// API : GET/POST /admin/badges/?user=, POST /admin/badges/{id}/perdu|dissocier|reactiver/.
import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { environment } from 'src/environments/environment';
import { erreurApi } from './erreur-api';

export interface BadgeAccesJson {
  id: number; masque: string; statut: 'actif' | 'perdu' | 'remplace' | 'dissocie'; statut_libelle: string;
  associe_le: string | null; fin_le: string | null; motif: string;
  associe_par: string | null; fin_par: string | null; user_id: number;
}

@Component({
  selector: 'app-badge-employe',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="bdg-fiche">
  @if (chargement) {
    <div class="text-center py-3"><span class="spinner-border spinner-border-sm text-primary" role="status"></span></div>
  } @else {
    @if (actif; as b) {
      <div class="bdg-etat ok"><i class="ri-shield-user-line"></i>
        <div><b>Badge actif · {{ b.masque }}</b><small>Associé le {{ b.associe_le | date:'dd/MM/yyyy' }}@if (b.associe_par) { par {{ b.associe_par }} }</small></div></div>
    } @else if (perdu) {
      <div class="bdg-etat ko"><i class="ri-forbid-line"></i>
        <div><b>Badge perdu · {{ perdu!.masque }}</b><small>Déclaré le {{ perdu!.fin_le | date:'dd/MM/yyyy' }}@if (perdu!.fin_par) { par {{ perdu!.fin_par }} } · refusé au comptoir</small></div></div>
    } @else {
      <div class="bdg-etat"><i class="ri-bank-card-2-line"></i>
        <div><b>Aucun badge</b><small>Au comptoir : QR code ou matricule</small></div></div>
    }

    @if (saisie) {
      <div class="bdg-saisie">
        <label class="form-label small mb-1">{{ actif ? 'Nouveau badge (remplace le badge actif)' : 'Badge à associer' }} : posez-le sur le lecteur</label>
        <div class="d-flex gap-2">
          <input #champ type="password" class="form-control form-control-sm" [(ngModel)]="numero" (keydown.enter)="$event.preventDefault(); associer()"
                 autocomplete="off" placeholder="Badge sur le lecteur, ou numéro + Entrée" aria-label="Numéro du badge" [disabled]="envoi">
          <button type="button" class="btn btn-sm btn-success" [disabled]="!numero.trim() || envoi" (click)="associer()">Associer</button>
          <button type="button" class="btn btn-sm btn-light" (click)="saisie = false; numero = ''">Annuler</button>
        </div>
      </div>
    } @else if (confirmer) {
      <div class="bdg-saisie">
        <label class="form-label small mb-1">{{ confirmer === 'perdu' ? 'Déclarer ce badge perdu (bloqué aussitôt au comptoir)' : 'Dissocier ce badge (rendu, départ…)' }}</label>
        <div class="d-flex gap-2">
          <input type="text" class="form-control form-control-sm" [(ngModel)]="motif" placeholder="Motif (facultatif)" aria-label="Motif">
          <button type="button" class="btn btn-sm btn-danger" [disabled]="envoi" (click)="action(confirmer, actif!)">Confirmer</button>
          <button type="button" class="btn btn-sm btn-light" (click)="confirmer = null">Annuler</button>
        </div>
      </div>
    } @else {
      <div class="d-flex gap-2 flex-wrap">
        <button type="button" class="btn btn-sm btn-subtle-success" (click)="ouvrirSaisie()"><i class="ri-links-line me-1"></i>{{ actif ? 'Remplacer' : 'Associer un badge' }}</button>
        @if (actif) {
          <button type="button" class="btn btn-sm btn-subtle-danger" (click)="confirmer = 'perdu'; motif = ''"><i class="ri-forbid-line me-1"></i>Déclarer perdu</button>
          <button type="button" class="btn btn-sm btn-subtle-secondary" (click)="confirmer = 'dissocier'; motif = ''"><i class="ri-link-unlink me-1"></i>Dissocier</button>
        }
        @if (!actif && perdu) {
          <button type="button" class="btn btn-sm btn-subtle-primary" [disabled]="envoi" (click)="action('reactiver', perdu)"><i class="ri-refresh-line me-1"></i>Réactiver (badge retrouvé)</button>
        }
      </div>
    }

    @if (historique.length) {
      <details class="bdg-histo">
        <summary>Historique ({{ historique.length }})</summary>
        <ul>
          @for (b of historique; track b.id) {
            <li><b>{{ b.masque }}</b> · {{ b.statut_libelle }} · {{ b.associe_le | date:'dd/MM/yyyy' }}@if (b.fin_le) { → {{ b.fin_le | date:'dd/MM/yyyy' }} }@if (b.fin_par) { ({{ b.fin_par }}) }@if (b.motif) { · {{ b.motif }} }</li>
          }
        </ul>
      </details>
    }
  }
</div>`,
  styles: [`
    .bdg-fiche { display: grid; gap: 10px; }
    .bdg-etat { display: flex; gap: 10px; align-items: center; border: 1px solid #E2EAF4; border-radius: 10px; padding: 10px 12px; background: #F8FAFC; }
    .bdg-etat > i { font-size: 22px; color: #5A7090; }
    .bdg-etat b { display: block; } .bdg-etat small { color: #5A7090; }
    .bdg-etat.ok { background: #EAFBF1; border-color: #BFEFD2; } .bdg-etat.ok > i { color: #1d7a43; }
    .bdg-etat.ko { background: #FDF0ED; border-color: #F6C9BE; } .bdg-etat.ko > i { color: #A3341E; }
    .bdg-histo summary { cursor: pointer; font-size: 12px; color: #5A7090; }
    .bdg-histo ul { margin: 6px 0 0; padding-left: 18px; font-size: 12px; }
  `],
})
export class BadgeEmployeComponent implements OnChanges {
  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  private api = `${environment.apiUrl}/api/api/admin/badges`;

  @Input({ required: true }) userId!: number;
  /** Badge actif changé (masque ou null) */
  @Output() change = new EventEmitter<string | null>();

  historique: BadgeAccesJson[] = [];
  chargement = true;
  saisie = false;
  confirmer: 'perdu' | 'dissocier' | null = null;
  numero = '';
  motif = '';
  envoi = false;
  @ViewChild('champ') champ?: ElementRef<HTMLInputElement>;

  get actif(): BadgeAccesJson | undefined { return this.historique.find(b => b.statut === 'actif'); }
  get perdu(): BadgeAccesJson | undefined { return this.historique.find(b => b.statut === 'perdu'); }

  ngOnChanges(): void {
    this.saisie = false; this.confirmer = null; this.numero = '';
    this.charger();
  }

  charger(): void {
    if (!this.userId) return;
    this.chargement = true;
    this.http.get<BadgeAccesJson[]>(`${this.api}/`, { params: { user: this.userId } }).subscribe({
      next: h => { this.historique = h; this.chargement = false; },
      error: e => { this.chargement = false; this.historique = []; this.toastr.error(erreurApi(e, 'Badge : chargement impossible.')); },
    });
  }

  ouvrirSaisie(): void {
    this.saisie = true; this.numero = '';
    setTimeout(() => this.champ?.nativeElement.focus(), 0);
  }

  associer(): void {
    const numero = this.numero.trim();
    if (!numero || this.envoi) return;
    this.envoi = true;
    this.http.post<BadgeAccesJson>(`${this.api}/`, { user: this.userId, numero }).subscribe({
      next: b => {
        this.envoi = false; this.saisie = false; this.numero = '';
        this.toastr.success(`Badge ${b.masque} associé.`);
        this.change.emit(b.masque);
        this.charger();
      },
      error: e => {
        this.envoi = false; this.numero = '';
        this.toastr.error(erreurApi(e, "Le badge n'a pas pu être associé."));
        setTimeout(() => this.champ?.nativeElement.focus(), 0);
      },
    });
  }

  action(action: 'perdu' | 'dissocier' | 'reactiver', b: BadgeAccesJson): void {
    if (this.envoi) return;
    this.envoi = true;
    this.http.post<BadgeAccesJson>(`${this.api}/${b.id}/${action}/`, { motif: this.motif }).subscribe({
      next: r => {
        this.envoi = false; this.confirmer = null; this.motif = '';
        this.toastr.success({ perdu: 'Badge déclaré perdu : bloqué au comptoir.', dissocier: 'Badge dissocié.', reactiver: 'Badge réactivé.' }[action]);
        this.change.emit(r.statut === 'actif' ? r.masque : null);
        this.charger();
      },
      error: e => { this.envoi = false; this.toastr.error(erreurApi(e, 'Action impossible.')); },
    });
  }
}
