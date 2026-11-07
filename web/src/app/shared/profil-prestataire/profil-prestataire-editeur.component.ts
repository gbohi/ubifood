// src/app/shared/profil-prestataire/profil-prestataire-editeur.component.ts
//
// Profil public d'un prestataire (parcours de commande des employés) : logo,
// photo de couverture, nom affiché, description courte (120 caractères),
// cuisine et mots-clés, avec l'aperçu de la carte telle que la voient les
// employés. Utilisé par l'espace prestataire (« Mon profil prestataire ») et
// par Paramètres → Prestataires (administrateurs). Le parent enregistre
// avec formData() (multipart, mêmes champs pour les deux routes).

import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { environment } from 'src/environments/environment';

export interface ProfilEditable {
  libelle?: string;
  nom_affiche?: string; description_courte?: string; cuisine?: string; tags?: string[];
  logo_url?: string | null; photo_couverture_url?: string | null;
  note?: number | null; nb_avis?: number; nouveau?: boolean; photos_plats?: string[];
}

const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const TAILLE_MAX = 5 * 1024 * 1024;

@Component({
  selector: 'app-profil-prestataire-editeur',
  templateUrl: './profil-prestataire-editeur.component.html',
})
export class ProfilPrestataireEditeurComponent implements OnChanges {
  @Input() profil: ProfilEditable | null = null;
  /** Nom de la fiche (libellé), affiché quand le nom public est vide */
  @Input() libelle = '';
  /** Désactive les champs (lecture seule) */
  @Input() lectureSeule = false;

  readonly max = 120;
  nomAffiche = '';
  description = '';
  cuisine = '';
  tags: string[] = [];
  nouveauTag = '';

  logo: File | null = null;
  apercuLogo: string | null = null;
  supprimerLogo = false;
  couverture: File | null = null;
  apercuCouverture: string | null = null;
  supprimerCouverture = false;
  erreurImage: string | null = null;

  private initial = '';

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['profil']) this.reinitialiser();
  }

  reinitialiser(): void {
    const p = this.profil ?? {};
    this.nomAffiche = p.nom_affiche ?? '';
    this.description = p.description_courte ?? '';
    this.cuisine = p.cuisine ?? '';
    this.tags = [...(p.tags ?? [])];
    this.nouveauTag = '';
    this.logo = this.couverture = null;
    this.apercuLogo = this.apercuCouverture = null;
    this.supprimerLogo = this.supprimerCouverture = false;
    this.erreurImage = null;
    this.initial = this.signature();
  }

  private signature(): string {
    return JSON.stringify([this.nomAffiche.trim(), this.description.trim(), this.cuisine.trim(), this.tags]);
  }

  get modifie(): boolean {
    return this.signature() !== this.initial || !!this.logo || !!this.couverture
      || this.supprimerLogo || this.supprimerCouverture;
  }

  get valide(): boolean {
    return this.description.trim().length <= this.max && this.tags.length <= 8;
  }

  // ── Images ──────────────────────────────────────────────────
  private url(chemin?: string | null): string | null {
    if (!chemin) return null;
    return chemin.startsWith('http') || chemin.startsWith('data:') ? chemin : `${environment.apiUrl}${chemin}`;
  }

  get logoAffiche(): string | null {
    return this.apercuLogo ?? (this.supprimerLogo ? null : this.url(this.profil?.logo_url));
  }

  get couvertureAffichee(): string | null {
    return this.apercuCouverture ?? (this.supprimerCouverture ? null : this.url(this.profil?.photo_couverture_url));
  }

  /** Couverture de secours : photos des plats */
  get photosPlats(): string[] {
    return (this.profil?.photos_plats ?? []).slice(0, 3).map(p => this.url(p)!).filter(Boolean);
  }

  choisirImage(ev: Event, champ: 'logo' | 'couverture'): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    input.value = '';
    this.erreurImage = null;
    if (!f) return;
    if (!TYPES.includes(f.type)) {
      this.erreurImage = 'Image PNG, JPEG ou WebP attendue.';
      return;
    }
    if (f.size > TAILLE_MAX) {
      this.erreurImage = `${champ === 'logo' ? 'Logo' : 'Photo de couverture'} trop volumineux (5 Mo maximum).`;
      return;
    }
    const lecteur = new FileReader();
    if (champ === 'logo') { this.logo = f; this.supprimerLogo = false; }
    else { this.couverture = f; this.supprimerCouverture = false; }
    lecteur.onload = () => {
      if (champ === 'logo' && this.logo === f) this.apercuLogo = lecteur.result as string;
      if (champ === 'couverture' && this.couverture === f) this.apercuCouverture = lecteur.result as string;
    };
    lecteur.readAsDataURL(f);
  }

  retirer(champ: 'logo' | 'couverture'): void {
    if (champ === 'logo') {
      this.logo = null; this.apercuLogo = null; this.supprimerLogo = !!this.profil?.logo_url;
    } else {
      this.couverture = null; this.apercuCouverture = null; this.supprimerCouverture = !!this.profil?.photo_couverture_url;
    }
  }

  // ── Mots-clés ───────────────────────────────────────────────
  ajouterTag(ev?: Event): void {
    ev?.preventDefault();
    const t = this.nouveauTag.replace(/,/g, ' ').trim().slice(0, 30);
    if (t && this.tags.length < 8 && !this.tags.some(x => x.toLowerCase() === t.toLowerCase())) this.tags = [...this.tags, t];
    this.nouveauTag = '';
  }

  retirerTag(t: string): void {
    this.tags = this.tags.filter(x => x !== t);
  }

  // ── Aperçu ──────────────────────────────────────────────────
  get nomPublic(): string {
    return this.nomAffiche.trim() || this.libelle || this.profil?.libelle || 'Votre nom';
  }

  get initiales(): string {
    const mots = this.nomPublic.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/)
      .filter(m => m.length > 1 && !/^(le|la|les|de|du|des|chez)$/i.test(m));
    return (mots.length >= 2 ? mots[0][0] + mots[1][0] : (mots[0] ?? '?').slice(0, 2)).toUpperCase();
  }

  get note(): string {
    const n = this.profil?.note;
    return n == null ? '' : n.toFixed(1).replace('.', ',');
  }

  /** Données multipart (prestataire/profil/ ou prestataires/<id>/) */
  formData(): FormData {
    const d = new FormData();
    d.append('nom_affiche', this.nomAffiche.trim());
    d.append('description_courte', this.description.trim());
    d.append('cuisine', this.cuisine.trim());
    d.append('tags', JSON.stringify(this.tags));
    if (this.logo) d.append('logo', this.logo);
    if (this.couverture) d.append('photo_couverture', this.couverture);
    if (this.supprimerLogo && !this.logo) d.append('supprimer_logo', 'true');
    if (this.supprimerCouverture && !this.couverture) d.append('supprimer_photo_couverture', 'true');
    return d;
  }
}
