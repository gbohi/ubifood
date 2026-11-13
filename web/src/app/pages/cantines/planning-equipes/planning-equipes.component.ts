// Planning des équipes (maquettes « planning-1 / planning-2 ») — administrateurs et
// gestionnaires (si Paramètres → Société l'autorise) : équipes « réservées aux employés
// programmés » (ex. Nuit). Vue semaine par employé, programmation à l'écran, retrait
// (aperçu des commandes annulées / maintenues avant de confirmer), modification d'une
// période, import Excel (lu dans le navigateur, contrôlé par le serveur), modèle et
// export Excel, copie de la semaine précédente, journal.
// API : planning-equipes/ (voir backend api/planning_equipes.py).
import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import * as XLSX from 'xlsx';
import { environment } from 'src/environments/environment';

export interface CasePlanning {
  date: string; programme: boolean; programmation_id: number | null;
  /** Agence de la programmation ; mission : autre agence que celle de l'employé */
  agence?: string | null; mission?: boolean;
  commande: { id: number; plat: string; statut: string } | null;
}
export interface ProgrammationLigne {
  id: number; date_debut: string; date_fin: string | null; jours: number[]; jours_libelle: string;
  libelle: string; importee: boolean; motif: string; saisi_par: string;
  agence_id: number | null; agence: string | null; mission: boolean;
}
export interface LignePlanning {
  employe: { id: number; nom: string; matricule: string; agence: string | null; agence_id: number | null };
  jours: CasePlanning[];
  programmations: ProgrammationLigne[];
}
export interface GrillePlanning {
  equipes: { id: number; libelle: string; exclusive_planning: boolean }[];
  agences: { id: number; nom: string }[];
  /** Agences de mission possibles */
  toutes_agences: { id: number; nom: string }[];
  typeequipe: number | null; agence: number | null;
  semaine: { debut: string; fin: string; precedente: string; suivante: string };
  jours: { date: string; libelle: string }[];
  aujourdhui: string;
  parametres: { annulation_auto: boolean; remboursement_auto: boolean };
  lignes: LignePlanning[];
  kpi: { employes: number; repas_commandes: number; employes_jours: number; changements: number };
}
export interface LigneImpact {
  commande_id: number; employe: string; matricule: string; date: string; jour: string; plat: string;
  equipe: string; agence: string; mode_paiement: string; prix: number | null; rembourse?: boolean;
  raison?: string; annulable?: boolean; libelle_annulation?: string;
}
export interface Rapport {
  apercu: boolean; annulees: LigneImpact[]; maintenues: LigneImpact[]; conflits: LigneImpact[];
  closes: { employe: string; date: string; jour: string; commande_tardive_jusqua: string | null }[];
  nb_annulees: number; nb_maintenues: number; nb_conflits: number; programmes: number; retires: number;
}
export interface LigneImport {
  ligne: number; matricule: string; employe: string | null; equipe: string; periode?: string; agence?: string;
  date_debut: any; date_fin: any; jours: any; statut: 'ok' | 'avertissement' | 'erreur'; message: string;
}

const SIGLES = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

@Component({
  selector: 'app-planning-equipes',
  templateUrl: './planning-equipes.component.html',
})
export class PlanningEquipesComponent implements OnInit {
  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  private api = `${environment.apiUrl}/api/api/planning-equipes`;

  readonly sigles = SIGLES;
  donnees: GrillePlanning | null = null;
  chargement = true;
  erreur: string | null = null;
  equipe: number | null = null;
  agence: number | '' = '';
  semaine = '';
  recherche = '';
  envoi = false;

  // ── Programmer ─────────────────────────────────────────────
  @ViewChild('programmerModal') programmerModal?: ModalDirective;
  prog = { date_debut: '', date_fin: '', jours: [0, 1, 2, 3, 4, 5, 6] as number[], motif: '', agence: '' as number | '' };
  /** Recherche aussi parmi les employés des autres agences (mission dans l'une de mes agences) */
  autresAgences = false;
  employesTrouves: { id: number; nom: string; matricule: string; agence: string | null }[] = [];
  selection = new Map<number, { id: number; nom: string; matricule: string }>();
  rechercheEmploye = '';
  private minuterie: any;

  // ── Retirer / modifier / supprimer ─────────────────────────
  @ViewChild('retirerModal') retirerModal?: ModalDirective;
  aRetirer: LignePlanning | null = null;
  retraitMode: 'tout' | 'date' = 'date';
  retraitDate = '';
  retraitMotif = '';
  apercu: Rapport | null = null;
  apercuChargement = false;

  @ViewChild('modifierModal') modifierModal?: ModalDirective;
  aModifier: { ligne: LignePlanning; p: ProgrammationLigne } | null = null;
  modif = { date_debut: '', date_fin: '', jours: [] as number[], motif: '', agence: null as number | null };
  apercuModif: Rapport | null = null;

  // ── Résultat d'une opération ──────────────────────────────
  @ViewChild('resultatModal') resultatModal?: ModalDirective;
  resultat: Rapport | null = null;
  resultatTitre = '';

  // ── Import Excel ───────────────────────────────────────────
  @ViewChild('importModal') importModal?: ModalDirective;
  fichierNom = '';
  lignesFichier: any[] = [];
  controle: { lignes: LigneImport[]; nb_valides: number; nb_erreurs: number } & Partial<Rapport> | null = null;
  modeImport: 'ajouter' | 'remplacer' = 'ajouter';

  // ── Copie / journal ───────────────────────────────────────
  @ViewChild('copierModal') copierModal?: ModalDirective;
  journal: any[] | null = null;
  journalOuvert = false;

  ngOnInit(): void {
    this.charger();
  }

  // ══════════════════════════════════════════════════════════
  // Grille
  // ══════════════════════════════════════════════════════════

  charger(): void {
    this.chargement = true;
    let params = new HttpParams();
    if (this.equipe) params = params.set('typeequipe', this.equipe);
    if (this.agence !== '') params = params.set('agence', this.agence);
    if (this.semaine) params = params.set('semaine', this.semaine);
    this.http.get<GrillePlanning>(`${this.api}/`, { params }).subscribe({
      next: d => {
        this.donnees = d;
        this.equipe = d.typeequipe;
        this.semaine = d.semaine.debut;
        this.chargement = false;
        this.erreur = null;
        if (this.journalOuvert) this.chargerJournal();
      },
      error: e => { this.chargement = false; this.erreur = this.message(e, 'Planning indisponible.'); },
    });
  }

  changerSemaine(cible: string): void { this.semaine = cible; this.charger(); }
  cetteSemaine(): void { this.semaine = ''; this.charger(); }

  get lignesFiltrees(): LignePlanning[] {
    const q = this.normaliser(this.recherche);
    const lignes = this.donnees?.lignes ?? [];
    return q ? lignes.filter(l => this.normaliser(`${l.employe.nom} ${l.employe.matricule}`).includes(q)) : lignes;
  }

  get libelleEquipe(): string {
    return this.donnees?.equipes.find(e => e.id === this.equipe)?.libelle ?? '';
  }

  get titreSemaine(): string {
    if (!this.donnees) return '';
    const d = this.dateLocale(this.donnees.semaine.debut), f = this.dateLocale(this.donnees.semaine.fin);
    return `Semaine du ${d.getDate()} ${d.getMonth() !== f.getMonth() ? MOIS[d.getMonth()] + ' ' : ''}au ${f.getDate()} ${MOIS[f.getMonth()]} ${f.getFullYear()}`;
  }

  /** Case précédente / suivante programmée : barres continues */
  classeCase(l: LignePlanning, i: number): string {
    const c = l.jours[i];
    if (!c.programme) return 'pq-case';
    const g = i > 0 && l.jours[i - 1].programme, dr = i < 6 && l.jours[i + 1].programme;
    return 'pq-case on' + (c.commande ? ' cmd' : '') + (g ? ' g' : '') + (dr ? ' d' : '');
  }

  periodeResume(l: LignePlanning): string {
    if (!l.programmations.length) return '—';
    if (l.programmations.length > 1) return `${l.programmations.length} périodes`;
    const p = l.programmations[0];
    return p.libelle + (p.jours.length < 7 ? ` · ${p.jours_libelle}` : '');
  }

  saisiPar(l: LignePlanning): string {
    const noms = [...new Set(l.programmations.map(p => p.saisi_par).filter(Boolean))];
    return noms.join(', ') || '—';
  }

  // ══════════════════════════════════════════════════════════
  // Programmer
  // ══════════════════════════════════════════════════════════

  ouvrirProgrammer(employe?: LignePlanning): void {
    if (!this.equipe) { this.toastr.warning("Aucune équipe n'est réservée aux employés programmés (Paramètres → Types d'équipe)."); return; }
    const lundiSuivant = this.donnees ? this.decaler(this.donnees.semaine.debut, 7) : this.iso(new Date());
    this.prog = { date_debut: this.maxIso(this.donnees?.semaine.debut ?? lundiSuivant, this.donnees?.aujourdhui ?? ''),
                  date_fin: this.donnees?.semaine.fin ?? '', jours: [0, 1, 2, 3, 4, 5, 6], motif: '', agence: '' };
    this.autresAgences = false;
    this.selection.clear();
    if (employe) this.selection.set(employe.employe.id, employe.employe);
    this.rechercheEmploye = '';
    this.chercherEmployes();
    this.programmerModal?.show();
  }

  basculerJour(liste: number[], j: number): void {
    const i = liste.indexOf(j);
    if (i >= 0) { if (liste.length > 1) liste.splice(i, 1); } else { liste.push(j); liste.sort(); }
  }

  chercherEmployes(): void {
    clearTimeout(this.minuterie);
    this.minuterie = setTimeout(() => {
      let params = new HttpParams().set('q', this.rechercheEmploye.trim());
      if (this.autresAgences) params = params.set('tous', '1');
      else if (this.agence !== '') params = params.set('agence', this.agence);
      this.http.get<any[]>(`${this.api}/employes/`, { params }).subscribe({
        next: r => this.employesTrouves = r,
        error: () => this.employesTrouves = [],
      });
    }, 250);
  }

  basculerEmploye(e: { id: number; nom: string; matricule: string }): void {
    if (this.selection.has(e.id)) this.selection.delete(e.id); else this.selection.set(e.id, e);
  }

  get selectionListe() { return [...this.selection.values()]; }

  programmer(): void {
    if (!this.selection.size || !this.prog.date_debut) return;
    if (this.prog.date_fin && this.prog.date_fin < this.prog.date_debut) {
      this.toastr.error('La date de fin doit être après la date de début.'); return;
    }
    this.envoi = true;
    this.http.post<Rapport>(`${this.api}/programmer/`, {
      typeequipe: this.equipe, user_ids: [...this.selection.keys()], date_debut: this.prog.date_debut,
      date_fin: this.prog.date_fin || null, jours: this.prog.jours, motif: this.prog.motif,
      agence: this.prog.agence === '' ? null : this.prog.agence,
    }).subscribe({
      next: r => {
        this.envoi = false;
        this.programmerModal?.hide();
        this.toastr.success(`${this.selection.size} employé${this.selection.size > 1 ? 's' : ''} programmé${this.selection.size > 1 ? 's' : ''} dans l'équipe ${this.libelleEquipe}.`);
        this.afficherResultat(r, 'Programmation enregistrée');
        this.charger();
      },
      error: e => { this.envoi = false; this.toastr.error(this.message(e, 'Programmation impossible.')); },
    });
  }

  // ══════════════════════════════════════════════════════════
  // Retirer
  // ══════════════════════════════════════════════════════════

  ouvrirRetirer(l: LignePlanning): void {
    this.aRetirer = l;
    const debut = l.programmations.length ? l.programmations.map(p => p.date_debut).sort()[0] : '';
    const aujourdhui = this.donnees?.aujourdhui ?? this.iso(new Date());
    this.retraitMode = debut && debut < aujourdhui ? 'date' : 'tout';
    this.retraitDate = this.maxIso(aujourdhui, debut);
    this.retraitMotif = '';
    this.apercu = null;
    this.retirerModal?.show();
    this.apercuRetrait();
  }

  get debutPlanning(): string {
    return this.aRetirer?.programmations.map(p => p.date_debut).sort()[0] ?? '';
  }

  get finPlanning(): string {
    const fins = this.aRetirer?.programmations.map(p => p.date_fin) ?? [];
    if (fins.some(f => f === null)) return '';
    return fins.sort().reverse()[0] ?? '';
  }

  private corpsRetrait(apercu: boolean) {
    return { user: this.aRetirer!.employe.id, typeequipe: this.equipe, motif: this.retraitMotif,
             a_partir_de: this.retraitMode === 'date' ? this.retraitDate : null, apercu };
  }

  apercuRetrait(): void {
    if (!this.aRetirer || (this.retraitMode === 'date' && !this.retraitDate)) return;
    this.apercuChargement = true;
    this.http.post<Rapport>(`${this.api}/retirer/`, this.corpsRetrait(true)).subscribe({
      next: r => { this.apercu = r; this.apercuChargement = false; },
      error: e => { this.apercu = null; this.apercuChargement = false; this.toastr.error(this.message(e, 'Aperçu indisponible.')); },
    });
  }

  retirer(): void {
    if (!this.aRetirer) return;
    this.envoi = true;
    this.http.post<Rapport>(`${this.api}/retirer/`, this.corpsRetrait(false)).subscribe({
      next: r => {
        this.envoi = false;
        this.retirerModal?.hide();
        this.toastr.success(`${this.aRetirer?.employe.nom} retiré(e) du planning.`);
        this.afficherResultat(r, 'Retrait du planning');
        this.charger();
      },
      error: e => { this.envoi = false; this.toastr.error(this.message(e, 'Retrait impossible.')); },
    });
  }

  get libelleBoutonRetrait(): string {
    const n = this.apercu?.nb_annulees ?? 0;
    return n ? `Retirer et annuler ${n} commande${n > 1 ? 's' : ''}` : 'Retirer du planning';
  }

  // ══════════════════════════════════════════════════════════
  // Modifier / supprimer une période
  // ══════════════════════════════════════════════════════════

  ouvrirModifier(ligne: LignePlanning, p: ProgrammationLigne): void {
    this.aModifier = { ligne, p };
    this.modif = { date_debut: p.date_debut, date_fin: p.date_fin ?? '', jours: [...p.jours], motif: '', agence: p.agence_id };
    this.apercuModif = null;
    this.modifierModal?.show();
  }

  private corpsModif(apercu: boolean) {
    return { date_debut: this.modif.date_debut, date_fin: this.modif.date_fin || null, jours: this.modif.jours,
             motif: this.modif.motif, agence: this.modif.agence, apercu };
  }

  verifierModif(): void {
    if (!this.aModifier) return;
    this.apercuChargement = true;
    this.http.patch<Rapport>(`${this.api}/${this.aModifier.p.id}/`, this.corpsModif(true)).subscribe({
      next: r => { this.apercuModif = r; this.apercuChargement = false; },
      error: e => { this.apercuChargement = false; this.toastr.error(this.message(e, 'Aperçu indisponible.')); },
    });
  }

  enregistrerModif(): void {
    if (!this.aModifier) return;
    this.envoi = true;
    this.http.patch<Rapport>(`${this.api}/${this.aModifier.p.id}/`, this.corpsModif(false)).subscribe({
      next: r => {
        this.envoi = false;
        this.modifierModal?.hide();
        this.toastr.success('Période modifiée.');
        this.afficherResultat(r, 'Période modifiée');
        this.charger();
      },
      error: e => { this.envoi = false; this.toastr.error(this.message(e, 'Modification impossible.')); },
    });
  }

  supprimerPeriode(): void {
    if (!this.aModifier) return;
    this.envoi = true;
    const params = new HttpParams().set('motif', this.modif.motif || '');
    this.http.delete<Rapport>(`${this.api}/${this.aModifier.p.id}/`, { params }).subscribe({
      next: r => {
        this.envoi = false;
        this.modifierModal?.hide();
        this.toastr.success('Période supprimée.');
        this.afficherResultat(r, 'Période supprimée');
        this.charger();
      },
      error: e => { this.envoi = false; this.toastr.error(this.message(e, 'Suppression impossible.')); },
    });
  }

  // ══════════════════════════════════════════════════════════
  // Résultat
  // ══════════════════════════════════════════════════════════

  private afficherResultat(r: Rapport, titre: string): void {
    if (!(r.nb_annulees || r.nb_maintenues || r.nb_conflits || r.closes?.length)) return;
    this.resultat = r;
    this.resultatTitre = titre;
    this.resultatModal?.show();
  }

  // ══════════════════════════════════════════════════════════
  // Import Excel
  // ══════════════════════════════════════════════════════════

  ouvrirImport(): void {
    this.fichierNom = '';
    this.lignesFichier = [];
    this.controle = null;
    this.modeImport = 'ajouter';
    this.importModal?.show();
  }

  telechargerModele(): void {
    const equipe = this.libelleEquipe || 'Nuit';
    const lundi = this.donnees ? this.decaler(this.donnees.semaine.debut, 7) : this.iso(new Date());
    const donnees = [
      ['Matricule', 'Équipe', 'Date début', 'Date fin', 'Jours', 'Agence'],
      ['01427', equipe, this.fr(lundi), this.fr(this.decaler(lundi, 6)), 'Lu-Ve', ''],
      ['01102', equipe, this.fr(lundi), '', '', this.donnees?.toutes_agences?.[0]?.nom ?? ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(donnees);
    ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }];
    const aide = XLSX.utils.aoa_to_sheet([
      ['Colonne', 'Contenu'],
      ['Matricule', "Identifiant de connexion de l'employé"],
      ['Équipe', "Libellé exact d'une équipe réservée aux employés programmés (ex. Nuit)"],
      ['Date début', 'JJ/MM/AAAA'],
      ['Date fin', 'JJ/MM/AAAA — vide : jusqu\'à nouvel ordre'],
      ['Jours', 'Vide : tous les jours. Sinon « Lu-Ve », « Lu,Me,Ve », « Sa-Di »…'],
      ['Agence', "Vide : l'agence de l'employé. Sinon le nom de l'agence de mission (ex. Yopougon)"],
    ]);
    aide['!cols'] = [{ wch: 14 }, { wch: 70 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Planning');
    XLSX.utils.book_append_sheet(wb, aide, 'Aide');
    XLSX.writeFile(wb, `modele_planning_${this.normaliser(equipe).replace(/\s+/g, '_')}.xlsx`);
  }

  lireFichier(ev: Event): void {
    const fichier = (ev.target as HTMLInputElement).files?.[0];
    (ev.target as HTMLInputElement).value = '';
    if (!fichier) return;
    this.fichierNom = fichier.name;
    this.controle = null;
    const lecteur = new FileReader();
    lecteur.onload = () => {
      try {
        // CSV / texte : valeurs gardées telles quelles (matricules « 01427 », dates JJ/MM/AAAA)
        const texte = /\.(csv|txt)$/i.test(fichier.name);
        const wb = texte
          ? XLSX.read(new TextDecoder('utf-8').decode(lecteur.result as ArrayBuffer), { type: 'string', raw: true })
          : XLSX.read(lecteur.result, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const brutes = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '', raw: true });
        this.lignesFichier = this.convertir(brutes);
        if (!this.lignesFichier.length) { this.toastr.error('Aucune ligne trouvée : vérifiez les en-têtes (voir le modèle).'); return; }
        this.controler();
      } catch {
        this.toastr.error('Fichier illisible : utilisez un fichier Excel (.xlsx) ou CSV.');
      }
    };
    lecteur.readAsArrayBuffer(fichier);
  }

  /** Lignes du tableur → {ligne, matricule, equipe, date_debut, date_fin, jours} (en-têtes reconnus sans accents) */
  private convertir(brutes: any[][]): any[] {
    const iEntete = brutes.findIndex(r => r.some(c => this.normaliser(String(c)) === 'matricule'));
    if (iEntete < 0) return [];
    const ent = brutes[iEntete].map(c => this.normaliser(String(c)));
    const col = (...noms: string[]) => ent.findIndex(e => noms.some(n => e.startsWith(n)));
    const c = { mat: col('matricule'), eq: col('equipe', 'quipe'), deb: col('date d', 'debut', 'du'),
                fin: col('date f', 'fin', 'au'), jours: col('jours'), agence: col('agence') };
    const res: any[] = [];
    brutes.slice(iEntete + 1).forEach((r, i) => {
      const mat = String(r[c.mat] ?? '').trim();
      if (!mat && !String(r[c.deb] ?? '').trim()) return;
      res.push({
        ligne: iEntete + i + 2, matricule: mat,
        equipe: c.eq >= 0 ? String(r[c.eq] ?? '').trim() || this.libelleEquipe : this.libelleEquipe,
        date_debut: this.dateCellule(r[c.deb]), date_fin: c.fin >= 0 ? this.dateCellule(r[c.fin]) : '',
        jours: c.jours >= 0 ? String(r[c.jours] ?? '').trim() : '',
        agence: c.agence >= 0 ? String(r[c.agence] ?? '').trim() : '',
      });
    });
    return res;
  }

  private dateCellule(v: any): string {
    if (v === null || v === undefined || v === '') return '';
    if (v instanceof Date) {
      // Dates Excel lues en heure locale à minuit (léger décalage possible) : arrondi au jour
      const d = new Date(v.getTime() + 12 * 3600 * 1000);
      return this.iso(d);
    }
    if (typeof v === 'number') {
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      return d.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (m) {
      const a = m[3].length === 2 ? '20' + m[3] : m[3];
      return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    return s;
  }

  controler(): void {
    this.envoi = true;
    this.http.post<any>(`${this.api}/importer/`, { lignes: this.lignesFichier, mode: this.modeImport, apercu: true }).subscribe({
      next: r => { this.controle = r; this.envoi = false; },
      error: e => { this.envoi = false; this.toastr.error(this.message(e, 'Contrôle impossible.')); },
    });
  }

  importer(): void {
    if (!this.controle?.nb_valides) return;
    this.envoi = true;
    this.http.post<any>(`${this.api}/importer/`, { lignes: this.lignesFichier, mode: this.modeImport }).subscribe({
      next: r => {
        this.envoi = false;
        this.importModal?.hide();
        this.toastr.success(`${r.nb_valides} ligne${r.nb_valides > 1 ? 's' : ''} importée${r.nb_valides > 1 ? 's' : ''}.`);
        this.afficherResultat(r, 'Import du planning');
        this.charger();
      },
      error: e => { this.envoi = false; this.toastr.error(this.message(e, 'Import impossible.')); },
    });
  }

  telechargerRapport(): void {
    if (!this.controle) return;
    const lignes = this.controle.lignes.filter(l => l.statut !== 'ok')
      .map(l => ({ Ligne: l.ligne, Matricule: l.matricule, Employé: l.employe ?? '', Équipe: l.equipe,
                   Contrôle: l.statut === 'erreur' ? 'Erreur (ignorée)' : 'Avertissement', Message: l.message }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes), 'Contrôle');
    XLSX.writeFile(wb, `controle_import_${this.fichierNom.replace(/\.[^.]+$/, '')}.xlsx`);
  }

  get perimetreRemplacement(): string {
    const lignes = (this.controle?.lignes ?? []).filter(l => l.statut !== 'erreur');
    if (!lignes.length) return '';
    const debuts = lignes.map(l => String(l.date_debut)).sort();
    const fins = lignes.map(l => l.date_fin);
    const fin = fins.some(f => !f) ? null : fins.map(String).sort().reverse()[0];
    return fin ? `du ${this.fr(debuts[0])} au ${this.fr(fin)}` : `à partir du ${this.fr(debuts[0])}`;
  }

  // ══════════════════════════════════════════════════════════
  // Export, copie, journal
  // ══════════════════════════════════════════════════════════

  exporter(): void {
    if (!this.donnees) return;
    const j = this.donnees.jours;
    const lignes = this.lignesFiltrees.map(l => {
      const o: any = { Matricule: l.employe.matricule, Employé: l.employe.nom, Agence: l.employe.agence ?? '' };
      j.forEach((jj, i) => {
        const c = l.jours[i];
        o[jj.libelle] = c.programme ? (c.commande ? `Programmé · ${c.commande.plat}` : 'Programmé') : '';
      });
      o['Période'] = this.periodeResume(l);
      o['Saisi par'] = this.saisiPar(l);
      return o;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes), 'Planning');
    XLSX.writeFile(wb, `planning_${this.normaliser(this.libelleEquipe).replace(/\s+/g, '_')}_${this.donnees.semaine.debut}.xlsx`);
  }

  copierSemaine(): void {
    if (!this.donnees) return;
    this.envoi = true;
    this.http.post<Rapport>(`${this.api}/copier-semaine/`, {
      typeequipe: this.equipe, agence: this.agence === '' ? null : this.agence, semaine: this.donnees.semaine.debut,
    }).subscribe({
      next: r => {
        this.envoi = false;
        this.copierModal?.hide();
        this.toastr.success(r.programmes ? `${r.programmes} employé${r.programmes > 1 ? 's' : ''} programmé${r.programmes > 1 ? 's' : ''} comme la semaine précédente.`
                                         : 'Rien à copier : personne de nouveau à programmer cette semaine.');
        this.afficherResultat(r, 'Copie de la semaine précédente');
        this.charger();
      },
      error: e => { this.envoi = false; this.toastr.error(this.message(e, 'Copie impossible.')); },
    });
  }

  basculerJournal(): void {
    this.journalOuvert = !this.journalOuvert;
    if (this.journalOuvert) this.chargerJournal();
  }

  chargerJournal(): void {
    let params = new HttpParams();
    if (this.equipe) params = params.set('typeequipe', this.equipe);
    this.http.get<any[]>(`${this.api}/historique/`, { params }).subscribe({
      next: r => this.journal = r, error: () => this.journal = [],
    });
  }

  // ══════════════════════════════════════════════════════════
  // Outils
  // ══════════════════════════════════════════════════════════

  initiales(nom: string): string {
    return (nom || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(m => m[0]).join('').toUpperCase();
  }

  fr(iso: string | null | undefined): string {
    if (!iso) return '';
    const [a, m, j] = String(iso).slice(0, 10).split('-');
    return `${j}/${m}/${a}`;
  }

  fcfa(n: number | null | undefined): string {
    return n == null ? '' : `${Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ')} F`;
  }

  dateHeure(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  private normaliser(s: string): string {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  private iso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private dateLocale(iso: string): Date {
    const [a, m, j] = iso.split('-').map(Number);
    return new Date(a, m - 1, j);
  }

  private decaler(iso: string, jours: number): string {
    const d = this.dateLocale(iso);
    d.setDate(d.getDate() + jours);
    return this.iso(d);
  }

  private maxIso(a: string, b: string): string { return (a || '') > (b || '') ? a : b; }

  private message(e: any, defaut: string): string {
    const err = e?.error;
    if (!err) return defaut;
    if (typeof err === 'string') return err;
    if (err.detail) return err.detail;
    if (Array.isArray(err)) return err[0];
    const premier = Object.values(err)[0];
    return Array.isArray(premier) ? String(premier[0]) : (typeof premier === 'string' ? premier : defaut);
  }
}
