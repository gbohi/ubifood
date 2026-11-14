/** Message d'erreur lisible d'une réponse DRF */
export function erreurApi(e: any, defaut: string): string {
  const d = e?.error;
  if (typeof d === 'string') return d;
  return d?.detail || d?.numero?.[0] || d?.numero || d?.lignes?.[0] || d?.lignes
    || (d && typeof d === 'object' ? (Object.values(d).flat()[0] as string) : null) || defaut;
}
