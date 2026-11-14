// Outils communs aux écrans des jeux (employé et administration)
import { environment } from 'src/environments/environment';

export const API_JEUX = `${environment.apiUrl}/api/api`;

export function messageErreur(err: any, defaut = 'Action impossible.'): string {
  const m = err?.error;
  if (typeof m === 'string') return m;
  const v = m && typeof m === 'object' ? (m.detail ?? Object.values(m)[0]) : null;
  return Array.isArray(v) ? String(v[0]) : String(v ?? defaut);
}

export function dateHeure(iso: string | null | undefined, annee = false): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', ...(annee ? { year: 'numeric' } : {}), hour: '2-digit', minute: '2-digit' })
    .replace(' ', ' à ');
}

export function fcfa(n: number | null | undefined): string {
  return `${Math.round(n ?? 0).toLocaleString('fr-FR').replace(/ | /g, ' ')} F`;
}

export function rangFr(n: number): string { return n === 1 ? '1er' : `${n}e`; }

export function etatLot(g: { statut_lot: string; lot_remis_le?: string | null }): string {
  if (g.statut_lot === 'remis') return `Lot retiré le ${dateHeure(g.lot_remis_le)}`;
  if (g.statut_lot === 'credite') return 'Crédité sur le compte repas';
  return 'À retirer auprès de votre gestionnaire';
}

/** Valeur d'un input datetime-local depuis une date ISO, et inversement */
export function versLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function versIso(local: string): string { return local ? new Date(local).toISOString() : ''; }
