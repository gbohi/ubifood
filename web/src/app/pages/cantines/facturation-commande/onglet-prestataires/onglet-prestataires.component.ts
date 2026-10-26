// Onglet « Prestataires » de la page Facturation : ce que nous devons à un
// prestataire sur la période (mois de la page ou période personnalisée).
//
// AUCUN calcul ici : tout vient du serveur (GET /facturation/prestataires/releve/),
// avec les mêmes règles que la clôture : repas commandés et non annulés des
// agences rattachées au prestataire, à son tarif en vigueur à la date du menu ;
// montants figés pour un mois clôturé. Le PDF « Relevé de prestations » est
// produit par le serveur (provisoire avant clôture, officiel numéroté après).

import { Component, DestroyRef, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpParams } from '@angular/common/http';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { environment } from 'src/environments/environment';

export type EtatClotureReleve = 'cloture' | 'a_cloturer' | 'en_cours' | 'periode';

export interface PrestataireListe { id: number; libelle: string; nb_repas: number; montant: number; }

/** Informations remontées à la page (barre : sélecteur de prestataire, état) */
export interface InfosReleve {
  prestataires: PrestataireListe[];
  prestataireId: number | null;
  etat: EtatClotureReleve | null;
  numero: string | null;
  aDesRepas: boolean;
}

interface PlatReleve { plat: string; nb_repas: number; retires: number; pu: number | null; montant: number | null; part: number; ecart: number | null; }
interface JourReleve { date: string; libelle: string; plats: { plat: string; nb: number }[]; nb_repas: number; montant: number; }
interface SemaineReleve { numero: number; libelle: string; nb_jours: number; nb_repas: number; montant: number; plats: Record<string, number>; jours: JourReleve[]; }
interface AgentReleve {
  user_id: number | null; username: string; nom_prenom: string; agence: string; nb_repas: number; retires: number; montant: number;
  service?: string | null; poste?: string | null;
  lignes: { date_menu: string; plat: string; statut: string | null; montant: number | null; source: string }[];
}
interface ReleveOfficiel { id: number; numero: string; annee: number; mois: number; nb_repas: number; montant_total: number; cloturee_le: string; }

export interface Releve {
  date_debut: string;
  date_fin: string;
  periode: string;
  regle: string;
  prestataires: PrestataireListe[];
  prestataire: {
    id: number; libelle: string; contact_nom: string; telephone: string; email: string; adresse: string; ville: string;
    identifiant_fiscal: string; registre_commerce: string; agences: string[];
  } | null;
  tarif: { montant: number; date_debut: string } | null;
  tarifs_appliques: number[];
  chiffres: {
    nb_repas: number; retires: number; non_retires: number; repas_sans_tarif: number; montant: number;
    jours_servis: number; moyenne_jour: number;
    precedent: { annee: number; mois: number; libelle: string; nb_repas: number; montant: number;
                 ecart_montant: number; ecart_repas: number; ecart_pct: number | null } | null;
  };
  par_plat: PlatReleve[];
  semaines: SemaineReleve[];
  par_agence: { agence: string; nb_repas: number; montant: number }[];
  agences_sans_prestataire: { agence: string; nb_jours: number; nb_repas: number }[];
  etat: 'cloturee' | 'provisoire' | 'partielle';
  cloture: { etat: EtatClotureReleve; annee: number | null; mois: number | null; cloturee_le: string | null;
             releve: { id: number; numero: string } | null; prochain_numero: string | null;
             obstacles: { repas_agents_sans_tarif: number; repas_sans_prestataire_ou_tarif: number } | null };
  releves: ReleveOfficiel[];
  agents?: AgentReleve[];
}

@Component({
  selector: 'app-onglet-prestataires',
  templateUrl: './onglet-prestataires.component.html',
})
export class OngletPrestatairesComponent implements OnChanges {
  /** Période de la page (mois affiché ou dates personnalisées) */
  @Input() periode: { debut: string; fin: string } | null = null;
  @Input() prestataireId: number | null = null;
  @Input() agence: string | number | null = '';
  @Input() estAdmin = false;

  @Output() infos = new EventEmitter<InfosReleve>();
  /** Un mois vient d'être clôturé depuis cet onglet (la page recharge ses clôtures) */
  @Output() cloture = new EventEmitter<void>();

  releve: Releve | null = null;
  chargement = false;
  erreur: string | null = null;

  semainesDepliees = false;
  agentsOuverts = false;
  chargementAgents = false;
  agentDeplie: string | null = null;
  rechercheAgent = '';

  telechargement: string | null = null;   // bouton en cours de téléchargement
  isCloturing = false;
  clotureMessage: string | null = null;
  clotureErreur: string | null = null;

  private cle = '';
  private http = inject(HttpClient);
  private destroyRef = inject(DestroyRef);
  private apiUrl = `${environment.apiUrl}/api/api`;

  ngOnChanges(): void {
    const cle = JSON.stringify([this.periode, this.prestataireId, this.agence]);
    // Le prestataire choisi par le serveur remonte à la page puis redescend : pas de second appel
    if (cle === this.cle || !this.periode) return;
    this.charger();
  }

  // ══════════════════════════════════════════════════════════
  // CHARGEMENT
  // ══════════════════════════════════════════════════════════

  private params(avecPrestataire = true): HttpParams {
    let p = new HttpParams();
    if (this.periode?.debut) p = p.set('date_debut', this.periode.debut);
    if (this.periode?.fin) p = p.set('date_fin', this.periode.fin);
    if (this.agence) p = p.set('agence', String(this.agence));
    const id = this.releve?.prestataire?.id ?? this.prestataireId;
    if (avecPrestataire && id) p = p.set('prestataire', String(id));
    return p;
  }

  charger(): void {
    this.cle = JSON.stringify([this.periode, this.prestataireId, this.agence]);
    this.chargement = true;
    this.erreur = null;
    this.clotureMessage = null;
    this.clotureErreur = null;
    let params = this.params(false);
    if (this.prestataireId) params = params.set('prestataire', String(this.prestataireId));
    if (this.agentsOuverts) params = params.set('agents', '1');
    this.http.get<Releve>(`${this.apiUrl}/facturation/prestataires/releve/`, { params })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: r => {
          this.releve = r;
          this.chargement = false;
          this.semainesDepliees = r.semaines.length <= 2;
          const id = r.prestataire?.id ?? null;
          if (id !== this.prestataireId) {
            this.prestataireId = id;
            this.cle = JSON.stringify([this.periode, id, this.agence]);
          }
          this.infos.emit({
            prestataires: r.prestataires, prestataireId: id, etat: r.cloture.etat,
            numero: r.cloture.releve?.numero ?? null, aDesRepas: r.chiffres.nb_repas > 0,
          });
        },
        error: err => {
          this.chargement = false;
          this.erreur = typeof err === 'string' ? err : 'Erreur lors du calcul du relevé du prestataire';
        },
      });
  }

  /** Détail par agent : chargé à la demande (agents=1) */
  basculerAgents(): void {
    this.agentsOuverts = !this.agentsOuverts;
    if (this.agentsOuverts && this.releve && !this.releve.agents) this.chargerAgents();
  }

  private chargerAgents(suite?: () => void): void {
    this.chargementAgents = true;
    this.http.get<Releve>(`${this.apiUrl}/facturation/prestataires/releve/`, { params: this.params().set('agents', '1') })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: r => {
          if (this.releve) this.releve.agents = r.agents ?? [];
          this.chargementAgents = false;
          suite?.();
        },
        error: err => {
          this.chargementAgents = false;
          this.erreur = typeof err === 'string' ? err : 'Erreur lors du chargement du détail par agent';
        },
      });
  }

  // ══════════════════════════════════════════════════════════
  // AFFICHAGE
  // ══════════════════════════════════════════════════════════

  get c() { return this.releve!.chiffres; }

  get tarifTexte(): string {
    const t = this.releve?.tarifs_appliques ?? [];
    if (t.length === 1) return `${this.f(t[0])} F`;
    if (t.length > 1) return `${this.f(t[0])} à ${this.f(t[t.length - 1])} F`;
    return this.releve?.tarif ? `${this.f(this.releve.tarif.montant)} F` : '—';
  }

  get maxPlat(): number {
    return Math.max(1, ...(this.releve?.par_plat ?? []).map(p => p.nb_repas));
  }

  get semainesVisibles(): SemaineReleve[] {
    const s = this.releve?.semaines ?? [];
    return this.semainesDepliees ? s : s.slice(0, 2);
  }

  get semainesCachees(): { nb: number; jours: number; repas: number; montant: number } {
    const s = (this.releve?.semaines ?? []).slice(2);
    return { nb: s.length, jours: s.reduce((t, x) => t + x.nb_jours, 0),
             repas: s.reduce((t, x) => t + x.nb_repas, 0), montant: s.reduce((t, x) => t + x.montant, 0) };
  }

  get agentsFiltres(): AgentReleve[] {
    const q = this.rechercheAgent.trim().toLowerCase();
    const a = this.releve?.agents ?? [];
    return q ? a.filter(x => `${x.nom_prenom} ${x.username} ${x.agence}`.toLowerCase().includes(q)) : a;
  }

  get libelleMoisPrecedent(): string {
    return this.releve?.chiffres.precedent?.libelle ?? 'mois précédent';
  }

  get moisLibelle(): string {
    const c = this.releve?.cloture;
    if (!c?.annee || !c.mois) return '';
    return new Date(c.annee, c.mois - 1, 1).toLocaleDateString('fr-FR', { month: 'long' });
  }

  /** Repas (toutes agences) qui empêchent la clôture du mois */
  get obstacles(): string {
    const o = this.releve?.cloture.obstacles;
    if (!o) return '';
    const t: string[] = [];
    if (o.repas_agents_sans_tarif) t.push(`${this.f(o.repas_agents_sans_tarif)} repas d'agents sans tarif`);
    if (o.repas_sans_prestataire_ou_tarif) t.push(`${this.f(o.repas_sans_prestataire_ou_tarif)} repas sans prestataire ou sans tarif`);
    return t.join(' · ');
  }

  get finPeriode(): string { return this.date(this.releve?.date_fin ?? ''); }

  get nomsSansPrestataire(): string {
    return (this.releve?.agences_sans_prestataire ?? []).map(a => a.agence).join(', ');
  }

  get joursSansPrestataire(): number {
    return (this.releve?.agences_sans_prestataire ?? []).reduce((t, a) => t + a.nb_jours, 0);
  }

  get repasSansPrestataire(): number {
    return (this.releve?.agences_sans_prestataire ?? []).reduce((t, a) => t + a.nb_repas, 0);
  }

  libelleReleve(r: ReleveOfficiel): string {
    return new Date(r.annee, r.mois - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  f(n: number | null | undefined): string {
    return n == null ? '—' : Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
  }

  signe(n: number | null | undefined): string {
    if (n == null) return '';
    return (n > 0 ? '+' : n < 0 ? '−' : '') + this.f(Math.abs(n));
  }

  pct(n: number | null | undefined): string {
    if (n == null) return '';
    return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';
  }

  date(iso: string | null): string {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  dateCourte(iso: string | null): string {
    return this.date(iso).slice(0, 5);
  }

  libelleStatut(s: string | null): string {
    return s === 'retiree' ? 'Retiré' : s === 'en_attente' ? 'Non retiré' : '—';
  }

  // ══════════════════════════════════════════════════════════
  // CLÔTURE (même action que l'onglet Agents : fige agents et prestataires)
  // ══════════════════════════════════════════════════════════

  cloturer(): void {
    const c = this.releve?.cloture;
    if (!c?.annee || !c.mois) return;
    const libelle = new Date(c.annee, c.mois - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    if (!confirm(`Clôturer définitivement la facturation de ${libelle} ?\n` +
                 'Les montants des agents et des prestataires de ce mois ne pourront plus être modifiés, ' +
                 'et chaque prestataire recevra un relevé officiel numéroté.')) {
      return;
    }
    this.isCloturing = true;
    this.clotureErreur = null;
    this.http.post<any>(`${this.apiUrl}/facturation/clotures/cloturer/`, { annee: c.annee, mois: c.mois })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isCloturing = false;
          this.cloture.emit();
          this.charger();
          this.clotureMessage = `${libelle} clôturé : le relevé officiel est disponible.`;
        },
        error: err => {
          this.isCloturing = false;
          this.clotureErreur = typeof err === 'string' ? err : 'Clôture impossible';
        },
      });
  }

  // ══════════════════════════════════════════════════════════
  // DOCUMENTS
  // ══════════════════════════════════════════════════════════

  private get suffixeFichier(): string {
    const nom = (this.releve?.prestataire?.libelle ?? 'prestataire').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `${nom}-${this.releve?.date_debut ?? ''}-${this.releve?.date_fin ?? ''}`;
  }

  /** Relevé de prestations (serveur) : officiel si le mois est clôturé, provisoire sinon */
  telechargerReleve(): void {
    const p = this.releve?.prestataire;
    if (!p) return;
    const numero = this.releve!.cloture.releve?.numero;
    const nom = numero && !this.agence ? `releve-prestations-${numero}.pdf` : `releve-prestations-provisoire-${this.suffixeFichier}.pdf`;
    this.telecharger('releve', `${this.apiUrl}/facturation/prestataires/${p.id}/releve-pdf/`, this.params(false), nom);
  }

  telechargerOfficiel(r: ReleveOfficiel): void {
    this.telecharger(`off-${r.id}`, `${this.apiUrl}/factures-prestataires/${r.id}/pdf/`, new HttpParams(),
                     `releve-prestations-${r.numero}.pdf`);
  }

  private telecharger(cle: string, url: string, params: HttpParams, nom: string): void {
    this.telechargement = cle;
    this.http.get(url, { params, responseType: 'blob' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: blob => { this.telechargement = null; saveAs(blob, nom); },
        error: err => {
          this.telechargement = null;
          this.erreur = typeof err === 'string' ? err : 'Téléchargement impossible';
        },
      });
  }

  /** Détail par agent (PDF A4) : qui a mangé quoi, jour par jour — justificatif en cas de contestation */
  telechargerDetailAgents(): void {
    if (!this.releve?.prestataire) return;
    if (!this.releve.agents) { this.chargerAgents(() => this.telechargerDetailAgents()); return; }
    const r = this.releve;
    const net = (v: any) => String(v ?? '').replace(/[  ]/g, ' ').replace(/[–—−]/g, '-');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(9, 36, 64);
    doc.text(net(`Détail par agent - ${r.prestataire!.libelle}`), 15, 17);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 112, 144);
    const etat = r.cloture.releve ? `relevé officiel ${r.cloture.releve.numero}` : 'provisoire (mois non clôturé)';
    doc.text(net(`Période : du ${this.date(r.date_debut)} au ${this.date(r.date_fin)} · ${etat}`), 15, 23);
    doc.text(net(`${r.agents!.length} agents · ${r.chiffres.nb_repas} repas · ${this.f(r.chiffres.montant)} FCFA · ` +
                 `justificatif du relevé de prestations`), 15, 28);
    const body: any[] = [];
    r.agents!.forEach((a, i) => {
      body.push([{ content: net(`${i + 1}. ${a.nom_prenom} (${a.username}) · ${a.agence}`), colSpan: 3, styles: { fontStyle: 'bold' } },
                 { content: String(a.nb_repas), styles: { fontStyle: 'bold', halign: 'right' } },
                 { content: this.f(a.montant), styles: { fontStyle: 'bold', halign: 'right' } }]);
      a.lignes.forEach(l => body.push([this.date(l.date_menu), net(l.plat), this.libelleStatut(l.statut), '1',
                                       net(this.f(l.montant))]));
    });
    body.push([{ content: 'TOTAL', colSpan: 3, styles: { fontStyle: 'bold' } },
               { content: String(r.chiffres.nb_repas), styles: { fontStyle: 'bold', halign: 'right' } },
               { content: net(this.f(r.chiffres.montant)), styles: { fontStyle: 'bold', halign: 'right' } }]);
    autoTable(doc, {
      startY: 33,
      head: [['Date', 'Plat', 'Retrait', 'Repas', 'Montant (FCFA)']],
      body,
      styles: { fontSize: 8, cellPadding: 1.4, textColor: [29, 41, 57] },
      headStyles: { fillColor: [9, 36, 64], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 24 }, 2: { cellWidth: 24 }, 3: { cellWidth: 16, halign: 'right' }, 4: { cellWidth: 30, halign: 'right' } },
      margin: { left: 15, right: 15, bottom: 16 },
      didParseCell: d => {
        if (d.section === 'body' && d.row.raw && Array.isArray(d.row.raw) && (d.row.raw[0] as any)?.colSpan) {
          d.cell.styles.fillColor = [242, 244, 247];
        }
      },
    });
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(7.5); doc.setTextColor(102, 112, 133);
      doc.text(net(`${r.prestataire!.libelle} · ${r.periode} · Page ${i} / ${pages}`), 195, 290, { align: 'right' });
    }
    doc.save(`detail-par-agent-${this.suffixeFichier}.pdf`);
  }

  /** Classeur Excel : « Par plat », « Par jour (grille) », « Par agent » */
  exporterExcel(): void {
    if (!this.releve?.prestataire) return;
    if (!this.releve.agents) { this.chargerAgents(() => this.exporterExcel()); return; }
    const r = this.releve;
    const titre = [`Relevé de prestations — ${r.prestataire!.libelle}`];
    const sous = [`Période : du ${this.date(r.date_debut)} au ${this.date(r.date_fin)} · ` +
                  (r.cloture.releve ? `relevé officiel ${r.cloture.releve.numero}` : 'provisoire') + ` · ${r.regle}`];

    const plats = [titre, sous, [], ['N°', 'Plat', 'Quantité', 'Retirés', 'P.U. (FCFA)', 'Montant (FCFA)', 'Part (%)'],
      ...r.par_plat.map((p, i) => [i + 1, p.plat, p.nb_repas, p.retires, p.pu ?? 'sans tarif', p.montant ?? '', p.part]),
      ['', 'TOTAL', r.chiffres.nb_repas, r.chiffres.retires, '', r.chiffres.montant, 100]];
    const wsPlats = XLSX.utils.aoa_to_sheet(plats);
    wsPlats['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 10 }];

    const noms = [...new Set(r.par_plat.map(p => p.plat))];
    const grille: any[][] = [titre, sous, [], ['Date', ...noms, 'Repas', 'Montant (FCFA)']];
    for (const s of r.semaines) {
      for (const j of s.jours) {
        const q = Object.fromEntries(j.plats.map(x => [x.plat, x.nb]));
        grille.push([j.libelle, ...noms.map(n => q[n] ?? ''), j.nb_repas, j.montant]);
      }
      grille.push([`Semaine ${s.numero} (${s.libelle.replace('Semaine ', '')})`, ...noms.map(n => s.plats[n] ?? ''), s.nb_repas, s.montant]);
    }
    const totauxPlat = Object.fromEntries(noms.map(n => [n, r.par_plat.filter(p => p.plat === n).reduce((t, p) => t + p.nb_repas, 0)]));
    grille.push(['TOTAL', ...noms.map(n => totauxPlat[n]), r.chiffres.nb_repas, r.chiffres.montant]);
    const wsGrille = XLSX.utils.aoa_to_sheet(grille);
    wsGrille['!cols'] = [{ wch: 30 }, ...noms.map(() => ({ wch: 14 })), { wch: 8 }, { wch: 14 }];

    const agents: any[][] = [titre, sous, [], ['N°', 'Matricule', 'Nom & prénom', 'Agence', 'Repas', 'Retirés', 'Montant (FCFA)', 'Détail (date : plat)']];
    r.agents!.forEach((a, i) => agents.push([i + 1, a.username, a.nom_prenom, a.agence, a.nb_repas, a.retires, a.montant,
      a.lignes.map(l => `${this.dateCourte(l.date_menu)} : ${l.plat}${l.statut === 'retiree' ? '' : ' (non retiré)'}`).join(' ; ')]));
    agents.push(['', 'TOTAL', '', '', r.chiffres.nb_repas, r.chiffres.retires, r.chiffres.montant, '']);
    const wsAgents = XLSX.utils.aoa_to_sheet(agents);
    wsAgents['!cols'] = [{ wch: 5 }, { wch: 12 }, { wch: 26 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 80 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsPlats, 'Par plat');
    XLSX.utils.book_append_sheet(wb, wsGrille, 'Par jour (grille)');
    XLSX.utils.book_append_sheet(wb, wsAgents, 'Par agent');
    XLSX.writeFile(wb, `releve-prestations-${this.suffixeFichier}.xlsx`);
  }
}
