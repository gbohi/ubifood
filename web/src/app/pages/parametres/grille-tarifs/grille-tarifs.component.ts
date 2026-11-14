// Grille des tarifs en vigueur : catégories de salarié × types de plat
// (cible « employes ») ou prestataires × types de plat (« prestataires »).
// Clic sur une case (administrateurs) : nouveau montant à partir d'une date ;
// l'ancien tarif de la case est clôturé la veille. API : tarifs/grille/.
import { Component, Input, OnInit, ViewChild, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import { ADMINS, aUnRole } from 'src/app/core/helpers/roles';
import { TokenStorageService } from 'src/app/core/services/token-storage.service';
import { environment } from 'src/environments/environment';

interface CaseTarif { tarif_id: number; montant: number; date_debut: string; date_fin: string | null }
interface LigneGrille { id: number; libelle: string; cases: Record<string, CaseTarif | null>;
                        a_venir: { type_plat: number | null; montant: number; date_debut: string }[] }

@Component({
  selector: 'app-grille-tarifs',
  templateUrl: './grille-tarifs.component.html',
})
export class GrilleTarifsComponent implements OnInit {
  @Input() cible: 'employes' | 'prestataires' = 'employes';

  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  private api = `${environment.apiUrl}/api/api/tarifs/grille/`;
  readonly admin = aUnRole(inject(TokenStorageService).getUser(), ADMINS);

  date = this.iso(new Date());
  types: { id: number; libelle: string }[] = [];
  lignes: LigneGrille[] = [];
  chargement = true;
  ouverte = true;

  @ViewChild('caseModal') caseModal?: ModalDirective;
  edition: { ligne: LigneGrille; cle: string; libelleType: string; actuel: CaseTarif | null; defaut: CaseTarif | null } | null = null;
  saisie = { montant: '' as string | number, date_debut: '' };
  envoi = false;

  get colonnes(): { cle: string; libelle: string }[] {
    return [...this.types.map(t => ({ cle: String(t.id), libelle: t.libelle })), { cle: 'tous', libelle: 'Tous types' }];
  }

  get titre(): string { return this.cible === 'employes' ? 'Grille des tarifs employés' : 'Grille des tarifs prestataires'; }
  get premiereColonne(): string { return this.cible === 'employes' ? 'Catégorie de salarié' : 'Prestataire'; }

  ngOnInit(): void { this.charger(); }

  charger(): void {
    this.chargement = true;
    const params = new HttpParams().set('cible', this.cible).set('date', this.date);
    this.http.get<{ types: any[]; lignes: LigneGrille[] }>(this.api, { params }).subscribe({
      next: r => { this.types = r.types; this.lignes = r.lignes; this.chargement = false; },
      error: () => { this.chargement = false; this.toastr.error('Grille des tarifs indisponible.'); },
    });
  }

  aVenir(l: LigneGrille, cle: string) {
    return l.a_venir.find(a => (a.type_plat === null ? 'tous' : String(a.type_plat)) === cle);
  }

  ouvrir(l: LigneGrille, cle: string): void {
    if (!this.admin) return;
    const col = this.colonnes.find(c => c.cle === cle)!;
    this.edition = { ligne: l, cle, libelleType: col.libelle, actuel: l.cases[cle], defaut: l.cases['tous'] };
    const demain = new Date(); demain.setDate(demain.getDate() + 1);
    this.saisie = { montant: l.cases[cle]?.montant ?? '', date_debut: this.iso(demain) };
    this.caseModal?.show();
  }

  get veille(): string {
    if (!this.saisie.date_debut) return '';
    const d = new Date(this.saisie.date_debut + 'T00:00:00'); d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('fr-FR');
  }

  enregistrer(): void {
    const e = this.edition;
    if (!e || this.saisie.montant === '' || !this.saisie.date_debut) return;
    this.envoi = true;
    this.http.post<any>(this.api, {
      cible: this.cible, proprietaire: e.ligne.id, type_plat: e.cle === 'tous' ? null : Number(e.cle),
      montant: this.saisie.montant, date_debut: this.saisie.date_debut,
    }).subscribe({
      next: r => {
        this.envoi = false;
        this.caseModal?.hide();
        this.toastr.success(r.ancien_cloture_le ? `Ancien tarif clôturé le ${new Date(r.ancien_cloture_le + 'T00:00:00').toLocaleDateString('fr-FR')}.`
                                                : 'Tarif enregistré.', `${e.ligne.libelle} · ${e.libelleType}`);
        this.charger();
      },
      error: err => {
        this.envoi = false;
        const m = err?.error; const v = m && typeof m === 'object' ? Object.values(m)[0] : m;
        this.toastr.error(Array.isArray(v) ? String(v[0]) : String(v ?? 'Enregistrement impossible.'));
      },
    });
  }

  fcfa(n: number): string { return `${Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ')} F`; }
  fr(iso: string): string { const [a, m, j] = iso.split('-'); return `${j}/${m}/${a}`; }

  private iso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
