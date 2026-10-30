/** Tailles et débits lisibles (« 52,4 Mo », « 2,1 Mo/s »). */
export function formatBytes(bytes: number): string {
  if (!(bytes > 0)) return '—';
  if (bytes >= 1e9) return `${(bytes / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Go`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
  return `${Math.max(1, Math.round(bytes / 1e3))} Ko`;
}

export function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

/** Temps restant, seulement s'il est réellement calculable (taille connue, débit mesuré). */
export function remaining(done: number, total: number, perSec: number): string | null {
  if (!(total > 0) || !(perSec > 0) || done >= total) return null;
  const sec = Math.ceil((total - done) / perSec);
  if (sec < 60) return `${sec} s restantes`;
  const min = Math.round(sec / 60);
  return min < 60 ? `${min} min restantes` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} restantes`;
}

export function formatMs(ms: number | null): string | null {
  if (!ms || ms < 1000) return null;
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
