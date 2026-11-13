// Suivi des services du jour (maquette « suivi-2 », n° 6) — comptoir du
// prestataire : un bloc par service (agence, équipe), bouton de l'étape
// suivante (Préparation, Livraison partie, Arrivé au comptoir) qui prévient
// les employés, signalement d'un incident (retard avec nouvelle heure, ou
// message). API : prestataire/suivi/ (backend api/suivi_repas.py).
import { Component, DestroyRef, Input, OnChanges, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { interval } from 'rxjs';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import { environment } from 'src/environments/environment';
import { ServiceSuivi } from 'src/app/shared/suivi-repas/suivi-repas.model';

@Component({
  selector: 'app-suivi-services',
  templateUrl: './suivi-services.component.html',
})
export class SuiviServicesComponent implements OnInit, OnChanges {
  /** Agence du comptoir (null : toutes) */
  @Input() agenceId: number | null = null;

  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  private destroyRef = inject(DestroyRef);
  private api = `${environment.apiUrl}/api/api/prestataire/suivi`;

  services: ServiceSuivi[] = [];
  tous: ServiceSuivi[] = [];
  incidentsActif = true;
  envoi: number | null = null;

  @ViewChild('incidentModal') incidentModal?: ModalDirective;
  cible: ServiceSuivi | null = null;
  incident = { type: 'retard' as 'retard' | 'autre', heure: '', message: '' };

  ngOnInit(): void {
    this.charger();
    interval(60000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.charger());
  }

  ngOnChanges(): void { this.filtrer(); }

  charger(): void {
    this.http.get<{ services: ServiceSuivi[]; reglages: { incidents_actif: boolean } }>(`${this.api}/`).subscribe({
      next: r => { this.tous = r.services; this.incidentsActif = r.reglages.incidents_actif; this.filtrer(); },
      error: () => { this.tous = []; this.filtrer(); },
    });
  }

  private filtrer(): void {
    this.services = this.agenceId ? this.tous.filter(s => s.agence_id === this.agenceId) : this.tous;
  }

  etapesService(s: ServiceSuivi) {
    return s.etapes.filter(e => e.code === 'preparation' || e.code === 'en_route' || e.code === 'arrive');
  }

  declarer(s: ServiceSuivi, etape: string): void {
    this.envoi = s.menu_id;
    this.http.post<{ notifies: number; service: ServiceSuivi }>(`${this.api}/${s.menu_id}/`, { etape }).subscribe({
      next: r => {
        this.envoi = null;
        this.remplacer(r.service);
        const lib = { preparation: 'Préparation', en_route: 'Livraison partie', arrive: 'Arrivé au comptoir' }[etape];
        this.toastr.success(r.notifies ? `${r.notifies} employé${r.notifies > 1 ? 's' : ''} prévenu${r.notifies > 1 ? 's' : ''}.`
                                       : 'Visible dans l\'application des employés.', `${lib} : enregistré`);
      },
      error: e => { this.envoi = null; this.toastr.error(this.message(e), 'Action impossible'); this.charger(); },
    });
  }

  ouvrirIncident(s: ServiceSuivi): void {
    this.cible = s;
    this.incident = { type: 'retard', heure: this.heureSuggeree(s), message: '' };
    this.incidentModal?.show();
  }

  envoyerIncident(): void {
    const s = this.cible;
    if (!s) return;
    this.envoi = s.menu_id;
    this.http.post<{ notifies: number; service: ServiceSuivi }>(`${this.api}/${s.menu_id}/incident/`, this.incident).subscribe({
      next: r => {
        this.envoi = null;
        this.incidentModal?.hide();
        this.remplacer(r.service);
        this.toastr.success(`${r.notifies} employé${r.notifies > 1 ? 's' : ''} et les gestionnaires prévenus.`, 'Incident signalé');
      },
      error: e => { this.envoi = null; this.toastr.error(this.message(e), 'Signalement impossible'); },
    });
  }

  get incidentValide(): boolean {
    return this.incident.type === 'retard' ? /^\d{2}:\d{2}$/.test(this.incident.heure) : !!this.incident.message.trim();
  }

  libelleEtape(code: string): string {
    return { preparation: 'Préparation', en_route: 'Livraison partie', arrive: 'Arrivé au comptoir' }[code] ?? code;
  }

  iconeEtape(code: string): string {
    return { preparation: 'ri-fire-line', en_route: 'ri-truck-line', arrive: 'ri-store-2-line' }[code] ?? 'ri-check-line';
  }

  classeStatut(s: ServiceSuivi): string {
    return { arrive: 't-ve', retire: 't-ve', retard: 't-or', en_route: 't-bl', preparation: 't-gr', confirmee: 't-gr' }[s.statut] ?? 't-gr';
  }

  private heureSuggeree(s: ServiceSuivi): string {
    const [h, m] = (s.heure_debut || '12:00').split(':').map(Number);
    const t = h * 60 + m + 30;
    return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }

  private remplacer(s: ServiceSuivi): void {
    this.tous = this.tous.map(x => x.menu_id === s.menu_id ? s : x);
    this.filtrer();
  }

  private message(e: any): string {
    const err = e?.error;
    if (!err) return 'Erreur réseau.';
    if (typeof err === 'string') return err;
    if (err.detail) return err.detail;
    if (Array.isArray(err)) return err[0];
    const v = Object.values(err)[0];
    return Array.isArray(v) ? String(v[0]) : String(v);
  }
}
