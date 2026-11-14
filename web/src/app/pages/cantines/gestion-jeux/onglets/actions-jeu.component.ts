// Actions communes à tous les jeux (administrateurs) : Dupliquer (copie en
// brouillon avec nouveau titre et nouvelles dates) et Suspendre / Reprendre
// (motif facultatif affiché aux employés, notification de reprise en option).
// API : admin/jeux/dupliquer/ et admin/jeux/suspension/.
import { Component, EventEmitter, Input, Output, ViewChild, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import { API_JEUX, dateHeure, messageErreur, versIso, versLocal } from '../../jeux/jeux-outils';

export type SourceJeu = 'quiz' | 'defis' | 'pronostics' | 'ticket';

@Component({
  selector: 'app-actions-jeu',
  template: `
  @if (jeu?.suspension) {
    <button type="button" class="btn-ubi sm vert-doux" (click)="reprendre()" title="Reprendre le jeu"><i class="ri-play-circle-line"></i>Reprendre</button>
  } @else if (suspendable) {
    <button type="button" class="btn-ubi sm orange" (click)="suspendre()" title="Suspendre le jeu"><i class="ri-pause-circle-line"></i></button>
  }
  <button type="button" class="btn-ubi sm ms-1" (click)="ouvrirDuplication()" title="Dupliquer"><i class="ri-file-copy-line"></i></button>

  <div bsModal #dupModal="bs-modal" class="modal fade" [config]="{backdrop: 'static'}">
    <div class="modal-dialog modal-dialog-centered"><div class="modal-content text-start">
      <div class="modal-header"><h5 class="modal-title">Dupliquer « {{ jeu?.titre }} »</h5><button type="button" class="btn-close" (click)="dupModal.hide()"></button></div>
      <div class="modal-body">
        <p class="small text-muted">La copie reprend les réglages, {{ source === 'quiz' ? 'les questions, ' : '' }}{{ source === 'defis' ? 'les paliers' : 'les lots' }} et les agences.
          Elle est créée en <b>brouillon</b> : rien n'est envoyé aux employés avant « Programmer ».@if (source === 'pronostics') { Les matchs ne sont pas copiés. }</p>
        <label class="form-label">Titre</label>
        <input class="form-control mb-3" [(ngModel)]="d.titre">
        @if (source !== 'pronostics') {
          <div class="row g-2">
            <div class="col-6"><label class="form-label">{{ source === 'quiz' && jeu?.mode === 'direct' ? 'Date et heure du direct' : 'Début' }}</label>
              <input type="datetime-local" class="form-control" [(ngModel)]="d.debut"></div>
            @if (!(source === 'quiz' && jeu?.mode === 'direct')) {
              <div class="col-6"><label class="form-label">Fin</label><input type="datetime-local" class="form-control" [(ngModel)]="d.fin"></div>
            }
          </div>
        }
      </div>
      <div class="modal-footer"><button type="button" class="btn btn-light" (click)="dupModal.hide()">Annuler</button>
        <button type="button" class="btn btn-primary" [disabled]="envoi" (click)="dupliquer()">Dupliquer</button></div>
    </div></div>
  </div>
  `,
})
export class ActionsJeuComponent {
  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  @Input() jeu: any;
  @Input() source: SourceJeu = 'quiz';
  /** Faux pour un jeu terminé / annulé : seul « Dupliquer » est proposé */
  @Input() suspendable = true;
  /** Après une action : liste à recharger ; après duplication : {source, id} de la copie */
  @Output() change = new EventEmitter<any>();
  @ViewChild('dupModal') dupModal?: ModalDirective;
  d = { titre: '', debut: '', fin: '' };
  envoi = false;

  suspendre(): void {
    const motif = prompt(`Suspendre « ${this.jeu.titre} » ? Motif affiché aux employés (facultatif) :`, '');
    if (motif === null) return;
    this.appeler({ action: 'suspendre', motif }, 'Jeu suspendu.');
  }

  reprendre(): void {
    if (!confirm(`Reprendre « ${this.jeu.titre} » ?`)) return;
    const notifier = confirm('Prévenir les employés de la reprise par une notification ?');
    this.appeler({ action: 'reprendre', notifier }, 'Jeu repris.');
  }

  private appeler(corps: any, ok: string): void {
    this.http.post<any>(`${API_JEUX}/admin/jeux/suspension/`, { source: this.source, id: this.jeu.id, ...corps }).subscribe({
      next: r => { this.jeu.suspension = r.suspension; this.toastr.success(ok); this.change.emit(null); },
      error: e => this.toastr.error(messageErreur(e)),
    });
  }

  ouvrirDuplication(): void {
    const decaler = (iso: string | null, jours: number) => iso ? versLocal(new Date(new Date(iso).getTime() + jours * 86400000).toISOString()) : '';
    this.d = { titre: `${this.jeu.titre} (copie)`, debut: decaler(this.jeu.debut, 7), fin: decaler(this.jeu.fin, 7) };
    this.dupModal?.show();
  }

  dupliquer(): void {
    this.envoi = true;
    this.http.post<any>(`${API_JEUX}/admin/jeux/dupliquer/`, {
      source: this.source, id: this.jeu.id, titre: this.d.titre, debut: versIso(this.d.debut), fin: versIso(this.d.fin),
    }).subscribe({
      next: r => { this.envoi = false; this.dupModal?.hide(); this.toastr.success(`« ${r.titre} » créé en brouillon.`, 'Jeu dupliqué'); this.change.emit(r); },
      error: e => { this.envoi = false; this.toastr.error(messageErreur(e)); },
    });
  }

  readonly dateHeure = dateHeure;
}
