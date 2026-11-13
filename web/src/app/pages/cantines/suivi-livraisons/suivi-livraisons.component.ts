// Suivi des livraisons (maquette « suivi-2 », n° 7) — gestionnaires et
// administrateurs : frise de chaque service du jour (heures réelles de
// préparation, départ, arrivée ; avancement des retraits ; incidents) et
// ponctualité des prestataires sur le mois (information, aucune pénalité).
// API : suivi-livraisons/, suivi-livraisons/ponctualite/ (api/suivi_repas.py).
import { Component, OnInit, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Store } from '@ngrx/store';
import { filtrerAgencesGerees } from 'src/app/core/helpers/roles';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';
import { environment } from 'src/environments/environment';
import { ServiceSuivi } from 'src/app/shared/suivi-repas/suivi-repas.model';

interface LignePonctualite {
  prestataire_id: number | null; prestataire: string; services: number; a_l_heure: number; retards: number;
  taux_a_l_heure: number | null; retard_moyen_minutes: number | null; incidents: number; arrivees_non_signalees: number;
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

@Component({
  selector: 'app-suivi-livraisons',
  templateUrl: './suivi-livraisons.component.html',
})
export class SuiviLivraisonsComponent implements OnInit {
  private http = inject(HttpClient);
  private store = inject(Store);
  private user = inject(TokenStorageService).getUser();
  private api = `${environment.apiUrl}/api/api/suivi-livraisons`;

  agences: any[] = [];
  agence: number | '' = '';
  date = this.iso(new Date());
  services: ServiceSuivi[] = [];
  chargement = true;
  erreur: string | null = null;
  mois = new Date().getMonth() + 1;
  annee = new Date().getFullYear();
  ponctualite: LignePonctualite[] = [];

  ngOnInit(): void {
    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.select(selectAllAgenceWithoutPagination).subscribe(a => this.agences = filtrerAgencesGerees(a ?? [], this.user));
    this.charger();
    this.chargerPonctualite();
  }

  charger(): void {
    this.chargement = true;
    let params = new HttpParams().set('date', this.date);
    if (this.agence !== '') params = params.set('agence', this.agence);
    this.http.get<{ services: ServiceSuivi[] }>(`${this.api}/`, { params }).subscribe({
      next: r => { this.services = r.services; this.chargement = false; this.erreur = null; },
      error: e => { this.chargement = false; this.erreur = e?.error?.detail ?? 'Suivi indisponible.'; },
    });
  }

  chargerPonctualite(): void {
    let params = new HttpParams().set('annee', this.annee).set('mois', this.mois);
    if (this.agence !== '') params = params.set('agence', this.agence);
    this.http.get<{ prestataires: LignePonctualite[] }>(`${this.api}/ponctualite/`, { params }).subscribe({
      next: r => this.ponctualite = r.prestataires, error: () => this.ponctualite = [],
    });
  }

  changerAgence(): void { this.charger(); this.chargerPonctualite(); }

  changerMois(delta: number): void {
    const d = new Date(this.annee, this.mois - 1 + delta, 1);
    this.annee = d.getFullYear();
    this.mois = d.getMonth() + 1;
    this.chargerPonctualite();
  }

  get libelleMois(): string { return `${MOIS[this.mois - 1]} ${this.annee}`; }
  get moisCourant(): boolean { const d = new Date(); return this.annee === d.getFullYear() && this.mois === d.getMonth() + 1; }

  libellePonctualite(s: ServiceSuivi): { texte: string; classe: string } {
    const p = s.ponctualite;
    if (!p) return { texte: '—', classe: 'g' };
    if (p.statut === 'a_l_heure') return { texte: `à l'heure (${p.arrivee})`, classe: 'v' };
    if (p.statut === 'retard') return { texte: `+${p.retard_minutes} min (${p.arrivee})`, classe: 'o' };
    if (p.statut === 'a_venir') return { texte: 'à venir', classe: 'g' };
    return { texte: 'arrivée non signalée', classe: 'g' };
  }

  private iso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
