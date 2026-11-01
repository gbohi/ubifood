// Contrôle des retraits (maquette « espace-presta-7-controle ») — gestionnaires et
// administrateurs : retraits du jour par agent validant (rythme par tranche de 5 min),
// contestations des employés à trancher (accepter = annuler le retrait ; rejeter =
// commentaire obligatoire), anomalies détectées automatiquement, décisions du mois.
// API : GET /controle-retraits/, POST /contestations-retrait/{id}/accepter|rejeter/,
// DELETE /retraits/{id}/ (annulation jusqu'à la clôture, route existante).
import { Component, DestroyRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Store } from '@ngrx/store';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import { filtrerAgencesGerees } from 'src/app/core/helpers/roles';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';
import { environment } from 'src/environments/environment';

export interface RetraitControle {
  id: number; heure: string; date_retrait: string; user_id: number; user_nom: string; matricule: string;
  agence_id: number; agence_nom: string; plats: string[]; mode: string; valide_par_id: number | null; valide_par_nom: string | null;
}

export interface AgentControle {
  agent_id: number | null; agent_nom: string; prestataire: string; secours: boolean; agences: string[];
  nb_retraits: number; premier: string | null; dernier: string | null;
  rythme: { debut: string; nb: number }[]; nb_contestations: number;
  anomalies: { type: string; description: string }[];
  retraits: RetraitControle[];
}

export interface Contestation {
  id: number; commande: number; retrait: number | null; user: number; user_nom: string; matricule: string;
  menu: number; date_menu: string; agence_id: number; agence_nom: string; plat: string;
  motif: string; motif_libelle: string; commentaire: string; statut: 'ouverte' | 'acceptee' | 'rejetee'; statut_libelle: string;
  date_retrait: string | null; retrait_valide_par: number | null; retrait_valide_par_nom: string | null;
  retrait_valide_par_prestataire: string | null; retrait_mode: string;
  traite_par: number | null; traite_par_nom: string | null; commentaire_traitement: string; date_traitement: string | null;
  created_at: string; rafale?: { nb: number; debut: string; fin: string } | null; anciennete_jours?: number;
}

export interface Controle {
  date: string; agence: number | null;
  chiffres: {
    retraits: number; par_prestataire: number; en_secours: number; commandes: number; a_servir: number;
    contestations_a_traiter: number; contestations_du_jour: number; anomalies: number;
    retraits_annules_mois: number; annulable_jusqu_a_cloture: boolean;
  };
  agents: AgentControle[];
  contestations: Contestation[];
  decisions_mois: Contestation[];
  anomalies: any[];
  regles: { rafale_nb: number; rafale_secondes: number; saisies_max_mois: number; horaires_defaut: { debut: string; fin: string } };
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const COULEURS = ['#C98A16', '#0F3A6E', '#7B61FF', '#3EC970', '#2F80ED', '#9AA9BE'];

@Component({
  selector: 'app-controle-retraits',
  templateUrl: './controle-retraits.component.html',
})
export class ControleRetraitsComponent implements OnInit {
  private http = inject(HttpClient);
  private store = inject(Store);
  private toastr = inject(ToastrService);
  private destroyRef = inject(DestroyRef);
  private user = inject(TokenStorageService).getUser();
  private api = `${environment.apiUrl}/api/api`;

  agences: any[] = [];
  date = this.isoJour(new Date());
  agence: number | '' = '';
  donnees: Controle | null = null;
  chargement = true;
  erreur: string | null = null;

  /** Agents dont le détail des retraits est ouvert */
  ouverts = new Set<string>();
  /** Graphiques de rythme (ApexCharts, un par agent) */
  graphes = new Map<string, any>();

  // Décisions
  rejetEnCours: number | null = null;
  commentaireRejet = '';
  envoi = false;
  aAccepter: Contestation | null = null;
  commentaireAcceptation = '';
  @ViewChild('accepterModal') accepterModal?: ModalDirective;
  retraitAAnnuler: RetraitControle | null = null;
  @ViewChild('annulerModal') annulerModal?: ModalDirective;

  ngOnInit(): void {
    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.select(selectAllAgenceWithoutPagination).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(a => this.agences = filtrerAgencesGerees(a ?? [], this.user));
    this.charger();
  }

  charger(): void {
    this.chargement = true;
    let params = new HttpParams().set('date', this.date);
    if (this.agence) params = params.set('agence', String(this.agence));
    this.http.get<Controle>(`${this.api}/controle-retraits/`, { params }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: d => {
        this.donnees = d;
        this.chargement = false;
        this.erreur = null;
        this.graphes = new Map(d.agents.map(a => [this.cle(a), this.graphe(a, d.regles)]));
      },
      error: e => { this.erreur = typeof e === 'string' ? e : 'Le contrôle n\'a pas pu être chargé.'; this.chargement = false; },
    });
  }

  // ── Affichage ──────────────────────────────────────────────
  cle(a: AgentControle): string { return `${a.agent_id ?? 'x'}-${a.secours}`; }

  basculer(a: AgentControle): void {
    const c = this.cle(a);
    this.ouverts.has(c) ? this.ouverts.delete(c) : this.ouverts.add(c);
  }

  get titreJour(): string {
    const [y, m, d] = this.date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return `${JOURS[dt.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }

  get moisCourant(): string {
    const [, m] = this.date.split('-').map(Number);
    return MOIS[m - 1];
  }

  initiales(nom?: string | null): string {
    return (nom ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?';
  }

  couleur(id?: number | null): string { return id == null ? '#9AA9BE' : COULEURS[id % COULEURS.length]; }

  heure(iso?: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  jourHeure(iso?: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} à ${this.heure(iso)}`;
  }

  jourCourt(iso?: string | null): string {
    if (!iso) return '';
    const [, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}`;
  }

  libelleMode(m?: string | null): string {
    return m === 'scan' ? 'badge QR scanné' : m === 'saisie' ? 'matricule saisi' : 'non précisé';
  }

  iconeAnomalie(t: string): string {
    return t === 'rafale' ? 'ri-flashlight-line' : t === 'hors_horaires' ? 'ri-moon-line' : 'ri-keyboard-line';
  }

  /** Rythme par tranche de 5 min : barre rouge quand la tranche dépasse le seuil de rafale */
  private graphe(a: AgentControle, regles: Controle['regles']): any {
    if (!a.rythme?.length) return null;
    const seuil = regles?.rafale_nb ?? 5;
    return {
      series: [{ name: 'Retraits', data: a.rythme.map(r => r.nb) }],
      chart: { type: 'bar', height: 38, width: 150, sparkline: { enabled: true }, animations: { enabled: false } },
      colors: a.rythme.map(r => r.nb > seuil ? '#F06548' : '#8FA3BF'),
      plotOptions: { bar: { columnWidth: '70%', distributed: true, borderRadius: 1 } },
      xaxis: { categories: a.rythme.map(r => r.debut) },
      tooltip: { y: { formatter: (v: number) => `${v} retrait${v > 1 ? 's' : ''}` }, x: { show: true }, marker: { show: false } },
      legend: { show: false },
    };
  }

  // ── Contestations ──────────────────────────────────────────
  demanderAcceptation(c: Contestation): void {
    this.aAccepter = c;
    this.commentaireAcceptation = '';
    this.accepterModal?.show();
  }

  accepter(): void {
    const c = this.aAccepter;
    if (!c || this.envoi) return;
    this.envoi = true;
    this.http.post<Contestation>(`${this.api}/contestations-retrait/${c.id}/accepter/`, { commentaire: this.commentaireAcceptation.trim() })
      .subscribe({
        next: () => {
          this.envoi = false;
          this.accepterModal?.hide();
          this.toastr.success(`Retrait annulé : le repas de ${c.user_nom} sort du relevé du prestataire. L'employé est prévenu.`, 'Contestation acceptée');
          this.charger();
        },
        error: e => { this.envoi = false; this.toastr.error(typeof e === 'string' ? e : 'Action impossible.', 'Erreur'); },
      });
  }

  ouvrirRejet(c: Contestation): void {
    this.rejetEnCours = c.id;
    this.commentaireRejet = '';
  }

  rejeter(c: Contestation): void {
    const commentaire = this.commentaireRejet.trim();
    if (!commentaire) { this.toastr.warning('Le commentaire est obligatoire pour rejeter une contestation : il est envoyé à l\'employé.'); return; }
    if (this.envoi) return;
    this.envoi = true;
    this.http.post<Contestation>(`${this.api}/contestations-retrait/${c.id}/rejeter/`, { commentaire }).subscribe({
      next: () => {
        this.envoi = false;
        this.rejetEnCours = null;
        this.toastr.success(`Contestation rejetée : ${c.user_nom} reçoit votre commentaire. Le repas reste retiré.`, 'Contestation rejetée');
        this.charger();
      },
      error: e => { this.envoi = false; this.toastr.error(typeof e === 'string' ? e : 'Action impossible.', 'Erreur'); },
    });
  }

  // ── Annuler un retrait (jusqu'à la clôture) ────────────────
  demanderAnnulation(r: RetraitControle): void {
    this.retraitAAnnuler = r;
    this.annulerModal?.show();
  }

  annulerRetrait(): void {
    const r = this.retraitAAnnuler;
    if (!r || this.envoi) return;
    this.envoi = true;
    this.http.delete(`${this.api}/retraits/${r.id}/`).subscribe({
      next: () => {
        this.envoi = false;
        this.annulerModal?.hide();
        this.toastr.success(`Retrait de ${r.user_nom} annulé : la commande est de nouveau en attente.`, 'Retrait annulé');
        this.charger();
      },
      error: e => { this.envoi = false; this.toastr.error(typeof e === 'string' ? e : 'Action impossible.', 'Erreur'); },
    });
  }

  private isoJour(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
}
