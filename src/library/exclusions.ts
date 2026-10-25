import type { Track } from '../types';

/** Un dossier exclu masque aussi ses sous-dossiers (« Music/WhatsApp » masque « Music/WhatsApp/Notes »). */
export function isExcludedFolder(folder: string, excluded: readonly string[]): boolean {
  return excluded.some((ex) => folder === ex || folder.startsWith(`${ex}/`));
}

export function withoutExcluded(tracks: Track[], excluded: readonly string[]): Track[] {
  return excluded.length ? tracks.filter((t) => !isExcludedFolder(t.folder, excluded)) : tracks;
}

/** Tous les dossiers détectés (exclus compris), avec leur nombre de morceaux, triés par chemin. */
export function folderSummary(tracks: Track[]): { path: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of tracks) counts.set(t.folder, (counts.get(t.folder) ?? 0) + 1);
  return [...counts.entries()].map(([path, count]) => ({ path, count })).sort((a, b) => a.path.localeCompare(b.path, 'fr'));
}
