// Contrôle des retraits (maquette « espace-presta-7-controle ») — gestionnaires et
// administrateurs : retraits du jour par agent validant (rythme par tranche de 5 min),
// contestations des employés à trancher (accepter avec une cause : erreur au comptoir =
// retrait et repas annulés, facturés ni à l'employé ni au prestataire ; badge utilisé par
// un tiers = repas servi, facturé normalement ; rejeter = commentaire obligatoire),
// anomalies détectées automatiquement, décisions du mois.
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
import * as XLSX from 'xlsx';

export interface RetraitControle {
  id: number; heure: string; date_retrait: string; user_id: number; user_nom: string; matricule: string;
  agence_id: number; agence_nom: string; plats: string[]; mode: string; valide_par_id: number | null; valide_par_nom: string | null;
  /** Employé d'une autre agence que celle du menu */
  externe?: boolean; agence_origine_id?: number | null; agence_origine?: string | null;
}

export interface AgentControle {
  agent_id: number | null; agent_nom: string; prestataire: string; secours: boolean; agences: string[];
  nb_retraits: number; premier: string | null; dernier: string | null;
  rythme: { debut: string; nb: number }[]; nb_contestations: number; erreurs_comptoir_mois?: number;
  anomalies: { type: string; description: string }[];
  retraits: RetraitControle[];
}

export interface Contestation {
  id: number; commande: number; retrait: number | null; user: number; user_nom: string; matricule: string;
  menu: number; date_menu: string; agence_id: number; agence_nom: string; plat: string;
  motif: string; motif_libelle: string; commentaire: string; statut: 'ouverte' | 'acceptee' | 'rejetee'; statut_libelle: string;
  cause: CauseContestation | null; cause_libelle: string | null; explication: string | null;
  date_retrait: string | null; retrait_valide_par: number | null; retrait_valide_par_nom: string | null;
  retrait_valide_par_prestataire: string | null; retrait_mode: string;
  traite_par: number | null; traite_par_nom: string | null; commentaire_traitement: string; date_traitement: string | null;
  created_at: string; rafale?: { nb: number; debut: string; fin: string } | null; anciennete_jours?: number;
}

export type CauseContestation = 'erreur_comptoir' | 'badge_tiers';

/** Causes possibles à l'acceptation d'une contestation et leurs conséquences (règle validée) */
export const CAUSES_CONTESTATION: { valeur: CauseContestation; libelle: string; consequence: string; icone: string }[] = [
  {
    valeur: 'erreur_comptoir', libelle: 'Erreur ou fraude au comptoir', icone: 'ri-store-2-line',
    consequence: "L'agent du prestataire a validé un mauvais badge ou un retrait fictif : le retrait est annulé, "
      + "le repas n'est pas facturé à l'employé (hors retenue) et sort du relevé du prestataire.",
  },
  {
    valeur: 'badge_tiers', libelle: 'Badge utilisé par un tiers', icone: 'ri-user-shared-line',
    consequence: "Quelqu'un d'autre a utilisé le badge de l'employé (prêté ou perdu) : le repas a bien été servi. "
      + "Le retrait est conservé, l'employé paie le repas et le prestataire est payé.",
  },
];

export interface Controle {
  date: string; agence: number | null;
  chiffres: {
    retraits: number; par_prestataire: number; en_secours: number; commandes: number; a_servir: number;
    retraits_externes?: number;
    contestations_a_traiter: number; contestations_du_jour: number; anomalies: number; anomalies_verifiees?: number;
    retraits_annules_mois: number; annulable_jusqu_a_cloture: boolean;
  };
  agents: AgentControle[];
  contestations: Contestation[];
  decisions_mois: Contestation[];
  anomalies: any[];
  regles: { rafale_nb: number; rafale_secondes: number; saisies_max_mois: number; erreurs_comptoir_max_mois?: number;
            horaires_defaut: { debut: string; fin: string } };
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
  readonly causes = CAUSES_CONTESTATION;
  /** Cause choisie à l'acceptation (obligatoire ; par défaut : erreur au comptoir) */
  cause: CauseContestation = 'erreur_comptoir';
  @ViewChild('accepterModal') accepterModal?: ModalDirective;
  retraitAAnnuler: RetraitControle | null = null;
  @ViewChild('annulerModal') annulerModal?: ModalDirective;

  ngOnInit(): void {
    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.select(selectAllAgenceWithoutPagination).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(a => this.agences = filtrerAgencesGerees(a ?? [], this.user));
    this.charger();
  }

  /** Classe l'anomalie « Vérifié » (commentaire facultatif) ou la remet à vérifier */
  verifier(an: any, annuler = false): void {
    let corps: any = { cle: an.cle, annuler: true };
    if (!annuler) {
      const commentaire = prompt(`Anomalie vérifiée : ${an.libelle}. Commentaire (facultatif) :`, '');
      if (commentaire === null) return;
      corps = { cle: an.cle, type: an.type, date: this.date, commentaire };
    }
    this.http.post<any>(`${this.api}/controle-retraits/anomalies/verifier/`, corps).subscribe({
      next: r => {
        an.verification = r.verification;
        const c = this.donnees!.chiffres;
        c.anomalies += annuler ? 1 : -1;
        c.anomalies_verifiees = (c.anomalies_verifiees ?? 0) + (annuler ? -1 : 1);
      },
      error: () => this.toastr.error('Action impossible.'),
    });
  }

  /** Export Excel du contrôle du jour : retraits, anomalies, contestations à traiter */
  exporter(): void {
    const d = this.donnees!;
    const retraits = XLSX.utils.aoa_to_sheet([
      ['Heure', 'Agence', 'Employé', 'Matricule', 'Agence de l\'employé', 'Plats', 'Identification', 'Validé par', 'Prestataire'],
      ...d.agents.flatMap(a => a.retraits.map(r => [r.heure, r.agence_nom, r.user_nom, r.matricule,
        r.externe ? (r.agence_origine || '') : r.agence_nom, r.plats.join(', '),
        r.mode === 'scan' ? 'Badge scanné' : r.mode === 'saisie' ? 'Matricule saisi' : '', r.valide_par_nom || a.agent_nom, a.prestataire || ''])),
    ]);
    const anomalies = XLSX.utils.aoa_to_sheet([
      ['Type', 'Agent', 'Agence', 'Description', 'Statut', 'Vérifié par', 'Le', 'Commentaire'],
      ...d.anomalies.map((an: any) => [an.libelle, an.agent_nom || '', an.agence_nom || '', an.description,
        an.verification ? 'Vérifié' : 'À vérifier', an.verification?.par || '', an.verification ? this.jourHeure(an.verification.le) : '',
        an.verification?.commentaire || '']),
    ]);
    const contestations = XLSX.utils.aoa_to_sheet([
      ['Déposée le', 'Employé', 'Matricule', 'Agence', 'Repas du', 'Plat', 'Motif', 'Commentaire', 'Retrait validé par'],
      ...d.contestations.map(c => [this.jourHeure(c.created_at), c.user_nom, c.matricule, c.agence_nom, c.date_menu, c.plat,
        c.motif_libelle, c.commentaire, c.retrait_valide_par_nom || '']),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, retraits, 'Retraits');
    XLSX.utils.book_append_sheet(wb, anomalies, 'Anomalies');
    XLSX.utils.book_append_sheet(wb, contestations, 'Contestations');
    XLSX.writeFile(wb, `controle_retraits_${d.date}.xlsx`);
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

  /** « Repas de X (plat, 05/11), validé par Y à 12:22. » (dialogue d'acceptation) */
  get resumeAAccepter(): string {
    const c = this.aAccepter;
    if (!c) return '';
    return `Repas de ${c.user_nom} (${c.plat}, ${this.jourCourt(c.date_menu)}), validé`
      + (c.retrait_valide_par_nom ? ` par ${c.retrait_valide_par_nom}` : '')
      + (c.date_retrait ? ` à ${this.heure(c.date_retrait)}` : '') + '.';
  }

  /** Libellé court de la décision dans l'historique */
  libelleDecision(c: Contestation): string {
    if (c.statut !== 'acceptee') return (c.statut_libelle || '').toLowerCase();
    return c.cause === 'badge_tiers' ? 'acceptée — badge utilisé par un tiers (repas dû)'
      : c.cause === 'erreur_comptoir' ? 'acceptée — erreur au comptoir (repas non facturé)' : 'acceptée';
  }

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
    return t === 'rafale' ? 'ri-flashlight-line' : t === 'hors_horaires' ? 'ri-moon-line'
      : t === 'erreurs_comptoir' ? 'ri-user-unfollow-line' : 'ri-keyboard-line';
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
    this.cause = 'erreur_comptoir';
    this.accepterModal?.show();
  }

  accepter(): void {
    const c = this.aAccepter;
    const cause = this.cause;
    if (!c || !cause || this.envoi) return;
    this.envoi = true;
    this.http.post<Contestation>(`${this.api}/contestations-retrait/${c.id}/accepter/`,
      { cause, commentaire: this.commentaireAcceptation.trim() })
      .subscribe({
        next: () => {
          this.envoi = false;
          this.accepterModal?.hide();
          this.toastr.success(cause === 'badge_tiers'
            ? `Badge utilisé par un tiers : le repas de ${c.user_nom} reste dû et payé au prestataire. L'employé est prévenu.`
            : `Erreur au comptoir : retrait annulé, le repas de ${c.user_nom} n'est facturé ni à l'employé ni au prestataire. L'employé est prévenu.`,
            'Contestation acceptée');
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
