// src/app/pages/cantine/gestion-commandes/gestion-commandes.component.ts

import { Component, OnInit, OnDestroy, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';

import { selectAllAgenceWithoutPagination } from 'src/app/store/Agence/agence-selector';
import { fetchagenceNoPaginateData } from 'src/app/store/Agence/agence.action';
import { selectAllTypeequipeWithoutPagination } from 'src/app/store/Typeequipe/typeequipe-selector';
import { fetchtypeequipeNoPaginateData } from 'src/app/store/Typeequipe/typeequipe.action';
import { selectAllDepartementWithoutPagination } from 'src/app/store/Departement/departement-selector';
import { fetchdepartementNoPaginateData } from 'src/app/store/Departement/departement.action';
import { selectAllPosteWithoutPagination } from 'src/app/store/Poste/poste-selector';
import { fetchposteNoPaginateData } from 'src/app/store/Poste/poste.action';
import { selectAllCategoriesalarieWithoutPagination } from 'src/app/store/Categoriesalarie/categoriesalarie-selector';
import { fetchcategoriesalarieNoPaginateData } from 'src/app/store/Categoriesalarie/categoriesalarie.action';

import {
  fetchCommandesParAgencePeriode,
  resetCommandesParAgencePeriode,
  resetCommandeError,
} from 'src/app/store/Commande/commande.action';
import {
  selectCommandesParAgencePeriode,
  selectCommandeIsLoading,
  selectCommandeIsSubmitting,
  selectCommandeError,
  selectCommandeSuccess,
} from 'src/app/store/Commande/commande-selector';
import { CommandeModel } from 'src/app/store/Commande/commande.model';

import { selectuserData } from 'src/app/store/User/user-selector';
import { fetchuserData } from 'src/app/store/User/user.action';

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-gestion-commandes',
  templateUrl: './gestion-commandes.component.html',
  styleUrl: './gestion-commandes.component.scss',
})
export class GestionCommandesComponent implements OnInit, OnDestroy {

  breadCrumbItems = [
    { label: 'Cantine', active: false },
    { label: 'Gestion des commandes', active: true },
  ];

  agences:           any[] = [];
  typeEquipes:       any[] = [];
  services:          any[] = [];
  postes:            any[] = [];
  categoriesalaries: any[] = [];
  commandes:         CommandeModel[] = [];

  // ✅ Map indexée par username ET par nom complet
  usersMap: Map<string, any> = new Map();

  isLoading    = false;
  isSubmitting = false;
  hasSearched  = false;
  error:          string | null = null;
  successMessage: string | null = null;
  showSearchPanel = false;

  filterForm!:  UntypedFormGroup;
  searchAgent  = '';

  // ✅ Statuts multiples — cases à cocher indépendantes du filterForm
  readonly TOUS_STATUTS = [
    { value: 'en_attente', label: 'En attente' },
    { value: 'retiree',    label: 'Retirée'    },
    { value: 'annulee',    label: 'Annulée'    },
  ];
  statutsSelectionnes: string[] = []; // vide = tous

  private destroyRef = inject(DestroyRef);

  constructor(
    private store: Store,
    private fb: UntypedFormBuilder,
  ) {}

  ngOnInit(): void {
    this.store.dispatch(resetCommandeError());
    const today = new Date().toISOString().split('T')[0];

    this.filterForm = this.fb.group({
      date_debut:       [today],
      date_fin:         [''],
      agence:           [''],
      typeequipe:       [''],
      // Filtres RH (sans allergie)
      service:          [''],
      poste:            [''],
      categoriesalarie: [''],
    });

    // ── Référentiels cantine ──────────────────────────────────
    this.store.dispatch(fetchagenceNoPaginateData());
    this.store.select(selectAllAgenceWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(a => this.agences = a ?? []);

    this.store.dispatch(fetchtypeequipeNoPaginateData());
    this.store.select(selectAllTypeequipeWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(t => this.typeEquipes = t ?? []);

    // ── Référentiels RH ───────────────────────────────────────
    this.store.dispatch(fetchdepartementNoPaginateData());
    this.store.select(selectAllDepartementWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(d => this.services = d ?? []);

    this.store.dispatch(fetchposteNoPaginateData());
    this.store.select(selectAllPosteWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(d => this.postes = d ?? []);

    this.store.dispatch(fetchcategoriesalarieNoPaginateData());
    this.store.select(selectAllCategoriesalarieWithoutPagination)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(d => this.categoriesalaries = d ?? []);

    // ── Users : indexés par username ET par nom complet ───────
    this.store.dispatch(fetchuserData({ page: 1 }));
    this.store.select(selectuserData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(users => {
        this.usersMap = new Map();
        (users ?? []).forEach(u => {
          // ✅ Index principal : username (= badge)
          if (u.username) this.usersMap.set(u.username, u);
          // Index secondaire : nom complet (fallback)
          const nomComplet = `${u.first_name || ''} ${u.last_name || ''}`.trim();
          if (nomComplet) this.usersMap.set(nomComplet, u);
          // Index tertiaire : nom + prénom du modèle user custom
          const nomCustom = `${u.nom || ''} ${u.prenom || ''}`.trim();
          if (nomCustom) this.usersMap.set(nomCustom, u);
        });
      });

    // ── Commandes ─────────────────────────────────────────────
    this.store.select(selectCommandesParAgencePeriode)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(c => this.commandes = c ?? []);

    this.store.select(selectCommandeIsLoading)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.isLoading = v);

    this.store.select(selectCommandeIsSubmitting)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.isSubmitting = v);

    this.store.select(selectCommandeError)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(e => this.error = e);

    this.store.select(selectCommandeSuccess)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(s => this.successMessage = s);
  }

  ngOnDestroy(): void {
    this.store.dispatch(resetCommandesParAgencePeriode());
  }

  // ══════════════════════════════════════════════════════════
  // ✅ HELPERS USER
  // user_nom dans CommandeModel = résultat de get_user_nom()
  // qui retourne first_name + last_name ou username.
  // On essaie d'abord user_nom comme clé, puis on cherche
  // dans les users dont le nom complet correspond.
  // ══════════════════════════════════════════════════════════

  private _getUserFromCommande(c: CommandeModel): any | null {
    if (!c.user_nom) return null;
    return this.usersMap.get(c.user_nom) ?? null;
  }

  /** Username de l'agent (= badge) */
  getUsernameFromCommande(c: CommandeModel): string {
    return this._getUserFromCommande(c)?.username ?? c.user_nom ?? '—';
  }

  /** Nom et prénom de l'agent depuis le modèle User custom */
  getNomPrenomFromCommande(c: CommandeModel): string {
    const user = this._getUserFromCommande(c);
    if (!user) return '—';
    const nom    = user.nom    || user.last_name  || '';
    const prenom = user.prenom || user.first_name || '';
    return `${nom} ${prenom}`.trim() || user.username || '—';
  }

  private _derniereLigne(lignes: any[]): any | null {
    if (!lignes || lignes.length === 0) return null;
    return lignes.reduce((prev: any, curr: any) =>
      (curr.date_debut || '') > (prev.date_debut || '') ? curr : prev
    );
  }

  getDernierService(c: CommandeModel): any | null {
    const user = this._getUserFromCommande(c);
    return user ? this._derniereLigne(user.user_services || []) : null;
  }

  getDernierPoste(c: CommandeModel): any | null {
    const user = this._getUserFromCommande(c);
    return user ? this._derniereLigne(user.user_postes || []) : null;
  }

  getDerniereCategorie(c: CommandeModel): any | null {
    const user = this._getUserFromCommande(c);
    return user ? this._derniereLigne(user.user_categoriesalaries || []) : null;
  }

  getServiceLibelle(id: number): string   { return this.services.find(s => s.id === id)?.libelle_service ?? '—'; }
  getPosteLibelle(id: number): string     { return this.postes.find(p => p.id === id)?.libelle ?? '—'; }
  getCategorieLibelle(id: number): string { return this.categoriesalaries.find(c => c.id === id)?.libelle ?? '—'; }

  // ══════════════════════════════════════════════════════════
  // RECHERCHE
  // ══════════════════════════════════════════════════════════

  toggleSearchPanel(): void { this.showSearchPanel = !this.showSearchPanel; }

  /** Appelé automatiquement par ng-select via [(ngModel)] — rien à faire ici
   *  car statutsSelectionnes est mis à jour par le two-way binding.
   *  Le getter commandesFiltrees réagit automatiquement. */
  onStatutChange(_?: any): void {}

  isStatutSelected(value: string): boolean {
    return this.statutsSelectionnes.includes(value);
  }

  rechercher(): void {
    const { date_debut, date_fin, agence, typeequipe } = this.filterForm.value;
    this.hasSearched = true;
    this.searchAgent = '';
    // ✅ On ne passe plus statut à l'API — filtre local dans commandesFiltrees
    this.store.dispatch(fetchCommandesParAgencePeriode({
      date_debut: date_debut || undefined,
      date_fin:   date_fin   || undefined,
      agence:     agence     ? +agence     : undefined,
      typeequipe: typeequipe ? +typeequipe : undefined,
    }));
  }

  resetFilters(): void {
    const today = new Date().toISOString().split('T')[0];
    this.filterForm.reset({
      date_debut: today, date_fin: '', agence: '', typeequipe: '',
      service: '', poste: '', categoriesalarie: '',
    });
    this.searchAgent         = '';
    this.statutsSelectionnes = [];  // ✅ reset statuts
    this.hasSearched         = false;
    this.showSearchPanel     = false;
    this.store.dispatch(resetCommandesParAgencePeriode());
  }

  hasActiveRhFilter(): boolean {
    const v = this.filterForm.value;
    return !!(v.service || v.poste || v.categoriesalarie);
  }

  get commandesFiltrees(): CommandeModel[] {
    let result = this.commandes;

    // ✅ Filtre multi-statuts local
    if (this.statutsSelectionnes.length > 0) {
      result = result.filter(c => this.statutsSelectionnes.includes(c.statut));
    }

    // Recherche rapide par username ou nom
    const search = this.searchAgent.trim().toLowerCase();
    if (search) {
      result = result.filter(c =>
        this.getUsernameFromCommande(c).toLowerCase().includes(search) ||
        this.getNomPrenomFromCommande(c).toLowerCase().includes(search) ||
        c.user_nom?.toLowerCase().includes(search)
      );
    }

    const { service, poste, categoriesalarie } = this.filterForm.value;
    if (service || poste || categoriesalarie) {
      result = result.filter(c => {
        const svc = this.getDernierService(c);
        const pst = this.getDernierPoste(c);
        const cat = this.getDerniereCategorie(c);

        const mService          = !service          || (svc && svc.service?.toString()          === service.toString());
        const mPoste            = !poste            || (pst && pst.poste?.toString()            === poste.toString());
        const mCategoriesalarie = !categoriesalarie || (cat && cat.categoriesalarie?.toString() === categoriesalarie.toString());

        return mService && mPoste && mCategoriesalarie;
      });
    }

    return result;
  }

  // ══════════════════════════════════════════════════════════
  // HELPERS AFFICHAGE
  // ══════════════════════════════════════════════════════════

  statutCss(statut: string): string {
    const map: Record<string, string> = {
      en_attente: 'bg-warning-subtle text-warning',
      annulee:    'bg-secondary-subtle text-secondary',
      retiree:    'bg-success-subtle text-success',
    };
    return map[statut] ?? 'bg-light';
  }

  statutLabel(statut: string): string {
    const map: Record<string, string> = {
      en_attente: 'En attente',
      annulee:    'Annulée',
      retiree:    'Retirée',
    };
    return map[statut] ?? statut;
  }

  formatDate(d: string): string {
    if (!d) return '';
    const date = d.includes('T') ? d.split('T')[0] : d;
    const [y, m, day] = date.split('-');
    return `${day}/${m}/${y}`;
  }

  getPlatNom(c: CommandeModel): string       { return c.plat_detail?.nom ?? '—'; }
  getAgenceNom(c: CommandeModel): string     { return c.menu_detail?.agence_nom ?? '—'; }
  getEquipeLibelle(c: CommandeModel): string { return c.menu_detail?.typeequipe_libelle ?? '—'; }
  getDateMenu(c: CommandeModel): string      { return this.formatDate(c.menu_detail?.date_menu ?? ''); }

  dismissAlert(): void { this.store.dispatch(resetCommandeError()); }

  // ══════════════════════════════════════════════════════════
  // ✅ EXPORT EXCEL (sans allergie, avec username + nom/prénom)
  // ══════════════════════════════════════════════════════════

  exportExcel(): void {
    const { date_debut, date_fin } = this.filterForm.value;

    const data = this.commandesFiltrees.map((c, i) => {
      const svc = this.getDernierService(c);
      const pst = this.getDernierPoste(c);
      const cat = this.getDerniereCategorie(c);

      return {
        'N°':            i + 1,
        'Date menu':     this.getDateMenu(c),
        'Agence':        this.getAgenceNom(c),
        'Équipe':        this.getEquipeLibelle(c),
        // ✅ Username + Nom & Prénom séparés
        'Username':      this.getUsernameFromCommande(c),
        'Nom & Prénom':  this.getNomPrenomFromCommande(c),
        'Plat':          this.getPlatNom(c),
        'Statut':        this.statutLabel(c.statut),
        // Données RH — dernière ligne (sans dates, sans allergie)
        'Service':       svc ? this.getServiceLibelle(svc.service)              : '—',
        'Poste':         pst ? this.getPosteLibelle(pst.poste)                  : '—',
        'Catégorie':     cat ? this.getCategorieLibelle(cat.categoriesalarie)   : '—',
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 5  }, { wch: 14 }, { wch: 20 }, { wch: 15 },
      { wch: 18 }, { wch: 28 },
      { wch: 30 }, { wch: 14 },
      { wch: 22 }, { wch: 22 }, { wch: 24 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Commandes');
    XLSX.writeFile(wb, `commandes-${date_debut ?? ''}-${date_fin ?? ''}.xlsx`);
  }

  // ══════════════════════════════════════════════════════════
  // ✅ EXPORT PDF
  // - Tableau 1 : commandes avec username + nom/prénom
  // - Tableau 2 : affectations RH sans dates (sauf date menu)
  // ══════════════════════════════════════════════════════════

  exportPdf(): void {
    const { date_debut, date_fin } = this.filterForm.value;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });

    const titre = `Commandes — ${date_debut ? this.formatDate(date_debut) : ''}${date_fin ? ' au ' + this.formatDate(date_fin) : ''}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(titre, 14, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Généré le : ${new Date().toLocaleDateString('fr-FR')} — ${this.commandesFiltrees.length} commande(s)`,
      14, 21
    );

    // ── Tableau 1 : Commandes ─────────────────────────────────
    // Colonnes : N° | Date menu | Agence | Équipe | Username | Nom & Prénom | Plat | Statut
    const head1 = [['N°', 'Date menu', 'Agence', 'Équipe', 'Username', 'Nom & Prénom', 'Plat', 'Statut']];
    const body1 = this.commandesFiltrees.map((c, i) => [
      i + 1,
      this.getDateMenu(c),           // ✅ date menu conservée
      this.getAgenceNom(c),
      this.getEquipeLibelle(c),
      this.getUsernameFromCommande(c),
      this.getNomPrenomFromCommande(c),
      this.getPlatNom(c),
      this.statutLabel(c.statut),
    ]);

    autoTable(doc, {
      head: head1, body: body1, startY: 26,
      styles:     { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [41, 98, 255], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 255] },
      columnStyles: {
        0: { cellWidth: 10  },
        1: { cellWidth: 22  },
        2: { cellWidth: 28  },
        3: { cellWidth: 18  },
        4: { cellWidth: 28  },
        5: { cellWidth: 35  },
        6: { cellWidth: 50  },
        7: { cellWidth: 20  },
      },
      margin: { left: 14, right: 14 },
    });

    // ── Tableau 2 : Affectations RH (sans dates de début/fin RH)
    const finalY1 = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Affectations RH des agents (dernière ligne)', 14, finalY1);

    // Colonnes : Username | Nom & Prénom | Service | Poste | Catégorie
    // ✅ Pas de date_debut service/poste/catégorie — uniquement date menu dans tableau 1
    const head2 = [['Username', 'Nom & Prénom', 'Service', 'Poste', 'Catégorie salarié']];
    const body2 = this.commandesFiltrees.map(c => {
      const svc = this.getDernierService(c);
      const pst = this.getDernierPoste(c);
      const cat = this.getDerniereCategorie(c);
      return [
        this.getUsernameFromCommande(c),
        this.getNomPrenomFromCommande(c),
        svc ? this.getServiceLibelle(svc.service)              : '—',
        pst ? this.getPosteLibelle(pst.poste)                  : '—',
        cat ? this.getCategorieLibelle(cat.categoriesalarie)   : '—',
      ];
    });

    autoTable(doc, {
      head: head2, body: body2, startY: finalY1 + 5,
      styles:     { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [39, 174, 96], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 255, 245] },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 40 },
        2: { cellWidth: 40 },
        3: { cellWidth: 40 },
        4: { cellWidth: 40 },
      },
      margin: { left: 14, right: 14 },
    });

    doc.save(`commandes-${date_debut ?? ''}-${date_fin ?? ''}.pdf`);
  }
}
