// Jeux (quiz à lots) — administration : création des jeux (questions avec
// durée propre, lots par rang, règles), programmation (notifie tous les
// employés), classement en direct, publication des résultats, remise des lots.
// Administrateurs : tout ; gestionnaires : lecture et « Lot retiré » pour les
// employés de leurs agences. API : admin/jeux/ (backend api/jeux.py).
import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import * as XLSX from 'xlsx';
import { ADMINS, aUnRole } from 'src/app/core/helpers/roles';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { environment } from 'src/environments/environment';

interface ReponseForm { texte: string; correcte: boolean }
interface QuestionForm { texte: string; duree: number; points: number; reponses: ReponseForm[] }
interface LotForm { rang_debut: number | null; rang_fin: number | null; libelle: string; type: 'objet' | 'argent'; montant: number | null }
interface JeuForm {
  titre: string; description: string; mode: 'libre' | 'direct'; debut: string; fin: string;
  nb_questions: number; repas_minimum: number; compter_repas_offerts: boolean; bonus_rapidite_pct: number;
  score_minimum_pct: number; exclure_gagnants_jours: number; agences: number[];
  questions: QuestionForm[]; lots: LotForm[];
}

@Component({
  selector: 'app-gestion-jeux',
  templateUrl: './gestion-jeux.component.html',
})
export class GestionJeuxComponent implements OnInit {
  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  private api = `${environment.apiUrl}/api/api/admin/jeux`;
  readonly admin = aUnRole(inject(TokenStorageService).getUser(), ADMINS);
  readonly lettres = ['A', 'B', 'C', 'D'];

  vue: 'liste' | 'edition' | 'classement' = 'liste';
  readonly onglets = [
    { code: 'quiz', libelle: 'Quiz', icone: 'ri-question-answer-line' },
    { code: 'defis', libelle: 'Défis et badges', icone: 'ri-medal-line' },
    { code: 'pronostics', libelle: 'Pronostics', icone: 'ri-football-line' },
    { code: 'tickets', libelle: 'Tickets à gratter', icone: 'ri-coupon-3-line' },
    { code: 'lots', libelle: 'Lots à remettre', icone: 'ri-hand-heart-line' },
  ];
  onglet = 'quiz';
  jeux: any[] = [];
  agences: { id: number; nom_agence: string }[] = [];
  chargement = true;
  envoi = false;

  // Édition
  jeuId: number | null = null;
  jeuCourant: any = null;
  form: JeuForm = this.vide();
  erreurs: string[] = [];

  // Classement
  classement: any = null;

  ngOnInit(): void {
    this.charger();
    this.http.get<any[]>(`${environment.apiUrl}/api/api/allnopagin/agences/`).subscribe({ next: a => this.agences = a || [] });
  }

  charger(): void {
    this.chargement = true;
    this.http.get<any[]>(`${this.api}/`).subscribe({
      next: j => { this.jeux = j; this.chargement = false; },
      error: () => { this.chargement = false; this.toastr.error('Jeux indisponibles.'); },
    });
  }

  // ── Liste ──────────────────────────────────────────────────
  classeEtat(etat: string): string {
    return ({ en_cours: 't-ve', a_venir: 't-bl', termine: 't-or', resultats: 't-na', brouillon: 't-gr', annule: 't-ro' } as any)[etat] || 't-gr';
  }

  nouveau(): void {
    this.jeuId = null; this.jeuCourant = null; this.form = this.vide(); this.erreurs = [];
    this.vue = 'edition';
  }

  ouvrir(j: any): void {
    this.http.get<any>(`${this.api}/${j.id}/`).subscribe({
      next: d => { this.remplir(d); this.vue = 'edition'; },
      error: e => this.toastr.error(this.msg(e)),
    });
  }

  retour(): void { this.vue = 'liste'; this.classement = null; this.charger(); }

  // ── Édition ────────────────────────────────────────────────
  get lectureSeule(): boolean { return !this.admin || (!!this.jeuCourant && !this.jeuCourant.modifiable); }

  get nbGagnants(): number {
    return this.form.lots.reduce((s, l) => s + (l.rang_debut && l.rang_fin && l.rang_fin >= l.rang_debut ? l.rang_fin - l.rang_debut + 1 : 0), 0);
  }

  get dureeDirect(): number {
    // Durée d'une partie en direct (approximation : les nb premières questions)
    return this.form.questions.slice(0, this.form.nb_questions).reduce((s, q) => s + (Number(q.duree) || 0), 0);
  }

  ajouterQuestion(): void {
    this.form.questions.push({ texte: '', duree: 20, points: 100,
      reponses: [{ texte: '', correcte: true }, { texte: '', correcte: false }, { texte: '', correcte: false }] });
  }

  supprimerQuestion(i: number): void { this.form.questions.splice(i, 1); }

  ajouterReponse(q: QuestionForm): void { if (q.reponses.length < 4) q.reponses.push({ texte: '', correcte: false }); }

  supprimerReponse(q: QuestionForm, i: number): void {
    if (q.reponses.length <= 2) return;
    const etaitBonne = q.reponses[i].correcte;
    q.reponses.splice(i, 1);
    if (etaitBonne) q.reponses[0].correcte = true;
  }

  choisirBonne(q: QuestionForm, i: number): void { q.reponses.forEach((r, k) => r.correcte = k === i); }

  ajouterLot(): void {
    const dernier = this.form.lots.reduce((m, l) => Math.max(m, l.rang_fin || 0), 0);
    this.form.lots.push({ rang_debut: dernier + 1, rang_fin: dernier + 1, libelle: '', type: 'objet', montant: null });
  }

  supprimerLot(i: number): void { this.form.lots.splice(i, 1); }

  basculerAgence(id: number): void {
    const i = this.form.agences.indexOf(id);
    if (i >= 0) this.form.agences.splice(i, 1); else this.form.agences.push(id);
  }

  enregistrer(puisProgrammer = false): void {
    this.erreurs = this.verifier();
    if (this.erreurs.length) { this.toastr.warning(this.erreurs[0]); return; }
    this.envoi = true;
    const corps = { ...this.form, debut: this.versIso(this.form.debut), fin: this.versIso(this.form.mode === 'direct' ? this.form.debut : this.form.fin) };
    const req = this.jeuId ? this.http.put<any>(`${this.api}/${this.jeuId}/`, corps) : this.http.post<any>(`${this.api}/`, corps);
    req.subscribe({
      next: d => {
        this.envoi = false;
        this.remplir(d);
        if (puisProgrammer) { this.programmer(); } else { this.toastr.success('Jeu enregistré.'); }
      },
      error: e => { this.envoi = false; this.toastr.error(this.msg(e)); },
    });
  }

  programmer(): void {
    if (!this.jeuId) return;
    if (!confirm(`Programmer « ${this.form.titre} » ? Tous les employés concernés seront notifiés.`)) return;
    this.envoi = true;
    this.http.post<any>(`${this.api}/${this.jeuId}/programmer/`, {}).subscribe({
      next: d => { this.envoi = false; this.remplir(d); this.toastr.success('Jeu programmé : les employés ont été notifiés.'); },
      error: e => { this.envoi = false; this.toastr.error(this.msg(e)); },
    });
  }

  annuler(j: any): void {
    const motif = prompt(`Annuler « ${j.titre} » ? Motif communiqué aux employés (facultatif) :`, '');
    if (motif === null) return;
    this.http.post<any>(`${this.api}/${j.id}/annuler/`, { motif }).subscribe({
      next: () => { this.toastr.success('Jeu annulé.'); this.retour(); },
      error: e => this.toastr.error(this.msg(e)),
    });
  }

  supprimer(j: any): void {
    if (!confirm(`Supprimer « ${j.titre} » ?`)) return;
    this.http.delete(`${this.api}/${j.id}/`).subscribe({
      next: () => { this.toastr.success('Jeu supprimé.'); this.retour(); },
      error: e => this.toastr.error(this.msg(e)),
    });
  }

  // ── Import Excel des questions ─────────────────────────────
  telechargerModele(): void {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Question', 'Réponse A', 'Réponse B', 'Réponse C', 'Réponse D', 'Bonne réponse (A-D)', 'Durée (s)', 'Points'],
      ['Quel plat est fait de semoule de manioc fermentée ?', 'Foutou banane', 'Attiéké', 'Placali', 'Kedjenou', 'B', 20, 100],
      ['Heure limite de commande des repas ?', 'La veille à minuit', 'Le matin même', '', '', 'A', 15, 100],
    ]);
    ws['!cols'] = [{ wch: 50 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Questions');
    XLSX.writeFile(wb, 'modele_questions_quiz.xlsx');
  }

  importer(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const fichier = input.files?.[0];
    input.value = '';
    if (!fichier) return;
    const lecteur = new FileReader();
    lecteur.onload = () => {
      try {
        const csv = fichier.name.toLowerCase().endsWith('.csv');
        const wb = csv ? XLSX.read(new TextDecoder('utf-8').decode(lecteur.result as ArrayBuffer), { type: 'string', raw: true })
                       : XLSX.read(lecteur.result, { type: 'array' });
        const lignes = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
        const ajout: QuestionForm[] = []; const rejets: string[] = [];
        lignes.slice(1).forEach((l, n) => {
          const texte = String(l[0] ?? '').trim();
          if (!texte) return;
          const reps = [1, 2, 3, 4].map(k => String(l[k] ?? '').trim());
          const bonne = this.lettres.indexOf(String(l[5] ?? '').trim().toUpperCase());
          const reponses = reps.map((t, k) => ({ texte: t, correcte: k === bonne })).filter(r => r.texte);
          if (reponses.length < 2 || bonne < 0 || !reps[bonne]) { rejets.push(`ligne ${n + 2}`); return; }
          ajout.push({ texte, reponses, duree: Number(l[6]) || 20, points: Number(l[7]) || 100 });
        });
        this.form.questions.push(...ajout);
        if (ajout.length) this.toastr.success(`${ajout.length} question(s) importée(s). Pensez à enregistrer.`);
        if (rejets.length) this.toastr.warning(`Lignes ignorées (2 réponses au moins et bonne réponse A à D) : ${rejets.slice(0, 8).join(', ')}${rejets.length > 8 ? '…' : ''}`);
      } catch {
        this.toastr.error('Fichier illisible.');
      }
    };
    lecteur.readAsArrayBuffer(fichier);
  }

  // ── Classement ─────────────────────────────────────────────
  voirClassement(j: any): void {
    this.jeuCourant = j; this.vue = 'classement'; this.classement = null;
    this.chargerClassement();
  }

  chargerClassement(): void {
    this.http.get<any>(`${this.api}/${this.jeuCourant.id}/classement/`).subscribe({
      next: c => { this.classement = c; this.jeuCourant = c.jeu; },
      error: e => this.toastr.error(this.msg(e)),
    });
  }

  publierResultats(): void {
    const n = this.classement?.kpi?.gagnants ?? 0;
    if (!confirm(`Publier les résultats ? ${n} gagnant(s) ; les lots en argent sont crédités sur les comptes repas et tous les participants sont notifiés. Action définitive.`)) return;
    this.envoi = true;
    this.http.post<any>(`${this.api}/${this.jeuCourant.id}/publier-resultats/`, {}).subscribe({
      next: () => { this.envoi = false; this.toastr.success('Résultats publiés.'); this.chargerClassement(); },
      error: e => { this.envoi = false; this.toastr.error(this.msg(e)); },
    });
  }

  remettre(l: any): void {
    if (!confirm(`Confirmer que ${l.employe} a retiré son lot « ${l.lot} » ? Il ne pourra plus le retirer une seconde fois.`)) return;
    this.http.post<any>(`${this.api}/${this.jeuCourant.id}/remettre/${l.participation_id}/`, {}).subscribe({
      next: r => { Object.assign(l, r, { peut_remettre: false }); this.toastr.success('Lot marqué comme retiré.'); },
      error: e => { this.toastr.error(this.msg(e)); this.chargerClassement(); },
    });
  }

  // ── Outils ─────────────────────────────────────────────────
  temps(ms: number | null): string {
    if (ms === null || ms === undefined) return '—';
    const s = Math.round(ms / 1000);
    return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}` : `${s} s`;
  }

  dateHeure(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  private verifier(): string[] {
    const f = this.form; const e: string[] = [];
    if (!f.titre.trim()) e.push('Donnez un titre au jeu.');
    if (!f.debut) e.push('Indiquez le début du jeu.');
    if (f.mode === 'libre' && (!f.fin || f.fin <= f.debut)) e.push('La fin doit être après le début.');
    if (!f.questions.length) e.push('Ajoutez au moins une question.');
    f.questions.forEach((q, i) => {
      if (!q.texte.trim()) e.push(`Question ${i + 1} : texte manquant.`);
      if (q.reponses.filter(r => r.texte.trim()).length < 2) e.push(`Question ${i + 1} : 2 réponses au moins.`);
      const bonne = q.reponses.find(r => r.correcte);
      if (!bonne || !bonne.texte.trim()) e.push(`Question ${i + 1} : choisissez la bonne réponse.`);
    });
    if (f.nb_questions > f.questions.length) e.push(`Le jeu pose ${f.nb_questions} questions : la banque n'en contient que ${f.questions.length}.`);
    f.lots.forEach((l, i) => {
      if (!l.rang_debut || !l.rang_fin || l.rang_fin < l.rang_debut) e.push(`Lot ${i + 1} : rangs invalides.`);
      if (l.type === 'argent' && !(Number(l.montant) > 0)) e.push(`Lot ${i + 1} : montant manquant.`);
      if (l.type === 'objet' && !l.libelle.trim()) e.push(`Lot ${i + 1} : libellé manquant.`);
    });
    return e;
  }

  private remplir(d: any): void {
    this.jeuId = d.id; this.jeuCourant = d;
    this.form = {
      titre: d.titre, description: d.description || '', mode: d.mode, debut: this.versLocal(d.debut), fin: this.versLocal(d.fin),
      nb_questions: d.nb_questions_par_partie ?? d.nb_questions, repas_minimum: d.repas_minimum,
      compter_repas_offerts: !!d.compter_repas_offerts, bonus_rapidite_pct: d.bonus_rapidite_pct ?? 50,
      score_minimum_pct: d.score_minimum_pct ?? 0, exclure_gagnants_jours: d.exclure_gagnants_jours ?? 0,
      agences: (d.agences || []).map((a: any) => a.id),
      questions: (d.questions || []).map((q: any) => ({ texte: q.texte, duree: q.duree, points: q.points,
        reponses: q.reponses.map((r: any) => ({ texte: r.texte, correcte: r.correcte })) })),
      lots: (d.lots || []).map((l: any) => ({ rang_debut: l.rang_debut, rang_fin: l.rang_fin, libelle: l.libelle, type: l.type, montant: l.montant })),
    };
  }

  private vide(): JeuForm {
    const debut = new Date(); debut.setDate(debut.getDate() + 1); debut.setHours(8, 0, 0, 0);
    const fin = new Date(debut); fin.setDate(fin.getDate() + 4); fin.setHours(18, 0, 0, 0);
    return {
      titre: '', description: '', mode: 'libre', debut: this.local(debut), fin: this.local(fin), nb_questions: 10,
      repas_minimum: 1, compter_repas_offerts: false, bonus_rapidite_pct: 50, score_minimum_pct: 0, exclure_gagnants_jours: 0,
      agences: [], questions: [], lots: [{ rang_debut: 1, rang_fin: 1, libelle: '', type: 'objet', montant: null }],
    };
  }

  private local(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  private versLocal(iso: string | null): string { return iso ? this.local(new Date(iso)) : ''; }

  private versIso(local: string): string { return local ? new Date(local).toISOString() : ''; }

  private msg(err: any): string {
    const m = err?.error;
    if (typeof m === 'string') return m;
    const v = m && typeof m === 'object' ? (m.detail ?? Object.values(m)[0]) : null;
    return Array.isArray(v) ? String(v[0]) : String(v ?? 'Action impossible.');
  }
}
