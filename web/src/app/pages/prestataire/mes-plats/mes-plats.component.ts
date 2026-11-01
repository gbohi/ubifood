// Mes plats (maquette « espace-presta-2-plats-menus », partie gauche) :
// cartes avec photos, filtres par type, fiche création / modification
// (photos ≤ 3, nom, type, description, mentions, agences ; prix du contrat en lecture seule).
import { Component, DestroyRef, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import { of, switchMap } from 'rxjs';
import {
  AgencePresta, ContextePresta, EspacePrestataireService, PlatPresta,
  messageErreur, montantFr, noteFr, urlMedia,
} from 'src/app/core/services/espace-prestataire/espace-prestataire.service';

const MAX_PHOTOS = 3;
const TYPES_IMAGES = ['image/jpeg', 'image/png', 'image/webp'];

interface Fiche {
  id: number | null;
  nom: string;
  type_plat: number | null;
  description: string;
  mentions: string[];
  agences: Set<number>;
  images: PlatPresta['images'];
  supprimees: Set<number>;
  nouvelles: { fichier: File; apercu: string }[];
  modifie_par?: string;
  updated_at?: string;
}

@Component({
  selector: 'app-mes-plats',
  templateUrl: './mes-plats.component.html',
})
export class MesPlatsComponent implements OnInit {
  private api = inject(EspacePrestataireService);
  private toastr = inject(ToastrService);
  private destroyRef = inject(DestroyRef);

  contexte: ContextePresta | null = null;
  plats: PlatPresta[] = [];
  types: { id: number; libelle: string }[] = [];
  chargement = true;
  erreur: string | null = null;

  // Filtres (liste non paginée : filtrage dans la page)
  filtreType: number | null = null;
  recherche = '';
  sansPhoto = false;

  // Fiche
  fiche: Fiche | null = null;
  nouvelleMention = '';
  envoi = false;
  erreurFiche: string | null = null;
  @ViewChild('ficheModal') ficheModal?: ModalDirective;
  @ViewChild('fichierInput') fichierInput?: ElementRef<HTMLInputElement>;

  // Suppression
  aSupprimer: PlatPresta | null = null;
  @ViewChild('supprModal') supprModal?: ModalDirective;

  readonly urlMedia = urlMedia;
  readonly noteFr = noteFr;
  readonly montantFr = montantFr;
  readonly maxPhotos = MAX_PHOTOS;
  readonly mentionsSuggerees = ['Piment à part', 'Arachide', 'Poisson', 'Gluten', 'Lait', 'Œuf', 'Végétarien'];

  ngOnInit(): void {
    this.api.contexte().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: c => this.contexte = c, error: () => {} });
    this.api.typesPlats().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: t => this.types = t ?? [], error: () => {} });
    this.charger();
  }

  charger(): void {
    this.api.plats().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => { this.plats = r.plats ?? []; this.chargement = false; this.erreur = null; },
      error: e => { this.erreur = messageErreur(e, 'Vos plats n\'ont pas pu être chargés.'); this.chargement = false; },
    });
  }

  get agences(): AgencePresta[] {
    return this.contexte?.agences ?? [];
  }

  get prix(): number | null {
    return this.contexte?.tarif?.montant ?? this.plats.find(p => p.prix != null)?.prix ?? null;
  }

  // ── Filtres ────────────────────────────────────────────────
  get typesPresents(): { id: number; libelle: string; nb: number }[] {
    const m = new Map<number, { id: number; libelle: string; nb: number }>();
    for (const p of this.plats) {
      const t = m.get(p.type_plat) ?? { id: p.type_plat, libelle: p.type_plat_libelle, nb: 0 };
      t.nb++;
      m.set(p.type_plat, t);
    }
    return [...m.values()].sort((a, b) => b.nb - a.nb);
  }

  get nbSansPhoto(): number {
    return this.plats.filter(p => !p.images?.length).length;
  }

  get platsAffiches(): PlatPresta[] {
    const q = this.recherche.trim().toLowerCase();
    return this.plats.filter(p =>
      (this.filtreType == null || p.type_plat === this.filtreType)
      && (!this.sansPhoto || !p.images?.length)
      && (!q || p.nom.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)));
  }

  photo(p: PlatPresta): string | null {
    const img = p.images?.find(i => i.is_principale) ?? p.images?.[0];
    return img ? urlMedia(img.url ?? img.image) : null;
  }

  // ── Fiche ──────────────────────────────────────────────────
  ouvrir(p: PlatPresta | null): void {
    this.erreurFiche = null;
    this.nouvelleMention = '';
    this.fiche = p ? {
      id: p.id, nom: p.nom, type_plat: p.type_plat, description: p.description ?? '',
      mentions: [...(p.mentions ?? [])], agences: new Set(p.agences ?? []),
      images: [...(p.images ?? [])], supprimees: new Set(), nouvelles: [],
      modifie_par: p.modifie_par, updated_at: p.updated_at,
    } : {
      id: null, nom: '', type_plat: this.types[0]?.id ?? null, description: '', mentions: [],
      agences: new Set(this.agences.map(a => a.id)), images: [], supprimees: new Set(), nouvelles: [],
    };
    if (this.fichierInput?.nativeElement) this.fichierInput.nativeElement.value = '';
    this.ficheModal?.show();
  }

  get photosRestantes(): number {
    const f = this.fiche;
    if (!f) return 0;
    return MAX_PHOTOS - f.images.filter(i => !f.supprimees.has(i.id)).length - f.nouvelles.length;
  }

  choisirPhotos(event: Event): void {
    const f = this.fiche;
    const input = event.target as HTMLInputElement;
    if (!f) return;
    this.erreurFiche = null;
    for (const fichier of Array.from(input.files ?? [])) {
      if (this.photosRestantes <= 0) { this.erreurFiche = '3 photos au plus par plat.'; break; }
      if (!TYPES_IMAGES.includes(fichier.type)) { this.erreurFiche = 'Choisissez des images JPG, PNG ou WebP.'; continue; }
      if (fichier.size > 5 * 1024 * 1024) { this.erreurFiche = 'Image trop volumineuse (5 Mo maximum).'; continue; }
      const entree = { fichier, apercu: '' };
      f.nouvelles.push(entree);
      const lecteur = new FileReader();
      lecteur.onload = () => entree.apercu = lecteur.result as string;
      lecteur.readAsDataURL(fichier);
    }
    input.value = '';
  }

  deposer(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer?.files?.length) {
      this.choisirPhotos({ target: { files: event.dataTransfer.files, value: '' } } as any);
    }
  }

  retirerNouvelle(i: number): void {
    this.fiche?.nouvelles.splice(i, 1);
  }

  basculerSuppressionImage(id: number): void {
    const s = this.fiche?.supprimees;
    if (!s) return;
    s.has(id) ? s.delete(id) : s.add(id);
  }

  definirPrincipale(imageId: number): void {
    const f = this.fiche;
    if (!f?.id) return;
    this.api.imagePrincipale(f.id, imageId).subscribe({
      next: p => { f.images = [...p.images]; this.majPlat(p); this.toastr.success('Photo principale changée.'); },
      error: e => this.erreurFiche = messageErreur(e),
    });
  }

  ajouterMention(texte?: string): void {
    const f = this.fiche;
    const m = (texte ?? this.nouvelleMention).trim().slice(0, 40);
    if (!f || !m) return;
    if (f.mentions.length >= 10) { this.erreurFiche = '10 mentions au plus.'; return; }
    if (!f.mentions.some(x => x.toLowerCase() === m.toLowerCase())) f.mentions.push(m);
    this.nouvelleMention = '';
  }

  retirerMention(i: number): void {
    this.fiche?.mentions.splice(i, 1);
  }

  basculerAgence(id: number): void {
    const a = this.fiche?.agences;
    if (!a) return;
    a.has(id) ? a.delete(id) : a.add(id);
  }

  /**
   * Champs en JSON (listes vides comprises), puis les nouvelles photos en
   * multipart dans un second appel (un envoi multipart ne sait pas vider une liste).
   */
  enregistrer(): void {
    const f = this.fiche;
    if (!f || this.envoi) return;
    if (!f.nom.trim()) { this.erreurFiche = 'Le nom du plat est obligatoire.'; return; }
    if (!f.type_plat) { this.erreurFiche = 'Choisissez le type de plat.'; return; }
    if (!f.agences.size) { this.erreurFiche = 'Choisissez au moins une agence où le plat est proposé.'; return; }
    this.envoi = true;
    this.erreurFiche = null;
    const champs = new FormData();
    const json: any = {
      nom: f.nom.trim(), type_plat: f.type_plat, description: f.description.trim(),
      mentions: f.mentions, agences: [...f.agences],
    };
    if (f.id && f.supprimees.size) json.images_to_delete = [...f.supprimees];
    const creation = !f.id;
    this.api.enregistrerPlat(f.id, json).pipe(
      switchMap(plat => {
        // Plat enregistré : si les photos sont refusées, un nouvel essai le modifie
        f.id = plat.id;
        f.supprimees.clear();
        f.images = [...plat.images];
        this.majPlat(plat);
        if (!f.nouvelles.length) return of(plat);
        f.nouvelles.forEach(n => champs.append('new_images', n.fichier));
        return this.api.enregistrerPlat(plat.id, champs);
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: plat => {
        this.envoi = false;
        this.majPlat(plat);
        this.toastr.success(!creation ? 'Plat enregistré : les modifications sont visibles immédiatement.' : 'Plat créé.');
        this.ficheModal?.hide();
      },
      error: e => {
        this.envoi = false;
        this.erreurFiche = messageErreur(e, 'Enregistrement impossible.');
      },
    });
  }

  private majPlat(p: PlatPresta): void {
    const i = this.plats.findIndex(x => x.id === p.id);
    if (i >= 0) this.plats[i] = p; else this.plats = [p, ...this.plats];
    this.plats = [...this.plats];
  }

  // ── Suppression ────────────────────────────────────────────
  demanderSuppression(p: PlatPresta): void {
    this.aSupprimer = p;
    this.supprModal?.show();
  }

  supprimer(): void {
    const p = this.aSupprimer;
    if (!p || this.envoi) return;
    this.envoi = true;
    this.api.supprimerPlat(p.id).subscribe({
      next: () => {
        this.envoi = false;
        this.plats = this.plats.filter(x => x.id !== p.id);
        this.supprModal?.hide();
        this.toastr.success(`Plat « ${p.nom} » supprimé.`);
      },
      error: e => { this.envoi = false; this.supprModal?.hide(); this.toastr.error(messageErreur(e), 'Suppression impossible'); },
    });
  }

  dateCourte(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
}
