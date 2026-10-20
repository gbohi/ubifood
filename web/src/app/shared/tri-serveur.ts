// src/app/shared/tri-serveur.ts

/**
 * Tri côté serveur des listes paginées (paramètre DRF `?ordering=`).
 *
 * Un clic sur l'en-tête d'une colonne sélectionne ce champ (ordre croissant),
 * un nouveau clic sur la même colonne inverse le sens. Seuls les champs
 * autorisés par le ViewSet (ordering_fields) sont déclarés triables.
 *
 * Les clés de colonne utilisées dans le gabarit peuvent être associées à un
 * champ serveur différent (ex. 'agence_nom' → 'agence__nom_agence'),
 * ou à plusieurs champs séparés par des virgules (ex. 'nom' → 'nom,prenom').
 */
export class TriServeur {
  /** Colonne active (clé utilisée dans le gabarit), '' = tri par défaut du serveur */
  colonne = '';
  sens: 'asc' | 'desc' = 'asc';

  constructor(private readonly champs: Record<string, string>) {}

  /** La colonne peut-elle être triée côté serveur ? */
  estTriable(colonne: string): boolean {
    return colonne in this.champs;
  }

  /** Sélectionne / inverse le tri. Renvoie false si la colonne n'est pas triable. */
  basculer(colonne: string): boolean {
    if (!this.estTriable(colonne)) return false;
    if (this.colonne === colonne) {
      this.sens = this.sens === 'asc' ? 'desc' : 'asc';
    } else {
      this.colonne = colonne;
      this.sens = 'asc';
    }
    return true;
  }

  /** Valeur du paramètre `ordering` ('' = aucun tri explicite) */
  get ordering(): string {
    if (!this.colonne) return '';
    // Un champ peut en regrouper plusieurs ('nom,prenom') : le sens s'applique à chacun
    return this.champs[this.colonne]
      .split(',')
      .map(c => c.trim())
      .filter(Boolean)
      .map(c => (this.sens === 'desc' ? `-${c}` : c))
      .join(',');
  }

  estActif(colonne: string): boolean {
    return this.colonne === colonne;
  }

  /** Icône de sens pour la colonne active ('' sinon) */
  icone(colonne: string): string {
    if (this.colonne !== colonne) return '';
    return this.sens === 'asc' ? 'ri-arrow-up-s-fill' : 'ri-arrow-down-s-fill';
  }
}

/** Ajoute `&ordering=` à une URL de liste si un tri est actif. */
export function paramTri(ordering?: string): string {
  const o = (ordering ?? '').trim();
  return o ? `&ordering=${encodeURIComponent(o)}` : '';
}
