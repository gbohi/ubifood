// Jeux → Tickets à gratter : grattage (tirage sur le serveur), lots en jeu, historique
import { AfterViewInit, Component, ElementRef, OnInit, QueryList, ViewChildren, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { API_JEUX, dateHeure, etatLot, messageErreur } from '../jeux-outils';

@Component({
  selector: 'app-jeux-tickets',
  template: `
  @if (erreur) { <div class="ep-alerte a-ro"><i class="ri-error-warning-line"></i><div>{{ erreur }}</div></div> }
  @if (d; as d) {
    @for (c of d.campagnes; track c.id) {
      @if (c.suspension; as s) { <div class="ep-alerte a-or mb-3"><i class="ri-pause-circle-line"></i><div><span><b>Jeu suspendu momentanément{{ s.motif ? ' : ' + s.motif : '' }}.</b> Revenez un peu plus tard.</span></div></div> }
      <div class="ep-alerte a-bl mb-3"><i class="ri-coupon-3-line"></i><div><span><b>{{ c.titre }}</b> jusqu'au {{ dateHeure(c.fin) }} :
        {{ c.ticket_par_retrait ? 'un ticket à chaque repas retiré' : '' }}{{ c.ticket_par_retrait && c.ticket_quotidien ? ' et ' : '' }}{{ c.ticket_quotidien ? 'un ticket gratuit chaque jour ouvré' : '' }}.
        <span class="d-block small">À gagner : @for (l of c.lots; track l.id) { {{ l.libelle_affiche }} ({{ l.restants }} restant{{ l.restants > 1 ? 's' : '' }})@if (!$last) { · } }</span></span></div></div>
    }
    <h6 class="jx-sec">À gratter <span class="lst-tag t-or ms-1">{{ d.a_gratter.length }}</span></h6>
    <div class="jx-tickets">
      @for (t of d.a_gratter; track t.id) {
        <div class="jx-ticket">
          <div class="jx-ticket-dessous" [class.gagne]="t.gagne">
            @if (t.gagne === null) { <span class="ep-muted">…</span> }
            @else if (t.gagne) { <span class="jx-big">🎉</span><b>Gagné !</b><span>{{ t.gain?.libelle_affiche }}</span><small>{{ etatLot(t.gain) }}</small> }
            @else { <span class="jx-big">🙂</span><b>Perdu</b><small>Retentez votre chance au prochain repas</small> }
          </div>
          @if (!t.gratte_le && t.suspendu) { <div class="jx-grattoir jx-suspendu"><i class="ri-pause-circle-line"></i>Jeu suspendu</div> }
          @else if (!t.gratte_le) { <canvas #grattoir [attr.data-id]="t.id" width="260" height="150" class="jx-grattoir"></canvas> }
          <small class="jx-ticket-pied">{{ t.source_libelle }} · {{ t.campagne }} · à gratter avant le {{ dateHeure(t.expire_le) }}</small>
        </div>
      } @empty { <p class="ep-muted small">Aucun ticket à gratter. @if (d.campagnes.length) { Retirez votre prochain repas pour en recevoir un ! }</p> }
    </div>
    @if (d.grattes.length) {
      <h6 class="jx-sec">Déjà grattés</h6>
      @for (t of d.grattes; track t.id) {
        <div class="jx-ligne statique"><span class="jx-ic" [ngClass]="t.gagne ? 'gagne' : ''"><i [class]="t.gagne ? 'ri-gift-line' : 'ri-coupon-3-line'"></i></span>
          <span class="jx-l-txt"><b>{{ t.gagne ? t.gain.libelle_affiche : 'Perdu' }}</b><small>{{ t.campagne }} · gratté le {{ dateHeure(t.gratte_le) }}</small></span>
          @if (t.gagne) { <span class="jx-res gagne">{{ etatLot(t.gain) }}</span> }</div>
      }
    }
  } @else if (!erreur) { <div class="p-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Chargement…</div> }
  `,
})
export class JeuxTicketsComponent implements OnInit, AfterViewInit {
  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  @ViewChildren('grattoir') grattoirs!: QueryList<ElementRef<HTMLCanvasElement>>;
  d: any = null;
  erreur = '';
  readonly dateHeure = dateHeure;
  readonly etatLot = etatLot;
  private enCours = new Set<number>();

  ngOnInit(): void { this.charger(); }

  ngAfterViewInit(): void { this.grattoirs.changes.subscribe(() => this.preparer()); }

  charger(): void {
    this.http.get<any>(`${API_JEUX}/tickets/`).subscribe({
      next: d => { d.a_gratter.forEach((t: any) => t.gagne = null); this.d = d; },
      error: e => this.erreur = messageErreur(e),
    });
  }

  /** Couche argentée à gratter à la souris ou au doigt ; le tirage part au premier geste */
  private preparer(): void {
    this.grattoirs.forEach(ref => {
      const cv = ref.nativeElement;
      if ((cv as any).__pret) return;
      (cv as any).__pret = true;
      const ctx = cv.getContext('2d')!;
      const g = ctx.createLinearGradient(0, 0, cv.width, cv.height);
      g.addColorStop(0, '#B8C2D1'); g.addColorStop(.5, '#E4E9F0'); g.addColorStop(1, '#AEB8C8');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = '#5A7090'; ctx.font = '600 15px Poppins, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Grattez ici', cv.width / 2, cv.height / 2 + 5);
      const id = Number(cv.dataset['id']);
      let appui = false;
      const gratter = (ev: PointerEvent) => {
        if (!appui) return;
        const r = cv.getBoundingClientRect();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath(); ctx.arc((ev.clientX - r.left) * cv.width / r.width, (ev.clientY - r.top) * cv.height / r.height, 18, 0, Math.PI * 2); ctx.fill();
        this.verifier(cv, id);
      };
      cv.addEventListener('pointerdown', ev => { appui = true; cv.setPointerCapture(ev.pointerId); this.tirer(id); gratter(ev); });
      cv.addEventListener('pointermove', gratter);
      cv.addEventListener('pointerup', () => appui = false);
    });
  }

  private tirer(id: number): void {
    if (this.enCours.has(id)) return;
    this.enCours.add(id);
    this.http.post<any>(`${API_JEUX}/tickets/${id}/gratter/`, {}).subscribe({
      next: t => { const x = this.d.a_gratter.find((y: any) => y.id === id); if (x) Object.assign(x, { gagne: t.gagne, gain: t.gain, _gratte: t.gratte_le }); },
      error: e => { this.toastr.error(messageErreur(e)); this.charger(); },
    });
  }

  /** Plus de 55 % gratté : on dévoile tout */
  private verifier(cv: HTMLCanvasElement, id: number): void {
    const x = this.d.a_gratter.find((y: any) => y.id === id);
    if (!x || x.gagne === null || x.gratte_le) return;
    const px = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
    let vides = 0;
    for (let i = 3; i < px.length; i += 16) if (px[i] === 0) vides++;
    if (vides / (px.length / 16) > .55) {
      x.gratte_le = x._gratte;
      if (x.gagne) this.toastr.success(x.gain?.libelle_affiche, '🎉 Gagné !');
    }
  }
}
