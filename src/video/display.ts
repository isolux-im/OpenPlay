import type { VideoContentFit } from 'expo-video';

/** Formats d'affichage, sur le modèle de VLC. */
export type VideoFitMode = 'best' | 'fill' | 'stretch' | '16:9' | '4:3' | 'original';

export const FIT_MODES: { key: VideoFitMode; label: string }[] = [
  { key: 'best', label: 'Ajuster à l’écran' },
  { key: 'fill', label: 'Remplir l’écran' },
  { key: 'stretch', label: 'Étirer' },
  { key: '16:9', label: '16:9' },
  { key: '4:3', label: '4:3' },
  { key: 'original', label: 'Taille d’origine' },
];

export function nextFitMode(mode: VideoFitMode): VideoFitMode {
  const i = FIT_MODES.findIndex((m) => m.key === mode);
  return FIT_MODES[(i + 1) % FIT_MODES.length].key;
}

export function fitLabel(mode: VideoFitMode): string {
  return FIT_MODES.find((m) => m.key === mode)?.label ?? FIT_MODES[0].label;
}

type Size = { width: number; height: number };

/**
 * Cadre de la vidéo dans l'écran (points) et mode de rendu natif. La surface vidéo reste à la
 * définition du fichier : seuls le cadre et la mise à l'échelle changent, jamais le décodage.
 */
export function videoFrame(mode: VideoFitMode, screen: Size, video: Size, pixelRatio: number): Size & { fit: VideoContentFit } {
  const full = { width: screen.width, height: screen.height };
  switch (mode) {
    case 'fill':
      return { ...full, fit: 'cover' };
    case 'stretch':
      return { ...full, fit: 'fill' };
    case '16:9':
    case '4:3': {
      const ratio = mode === '16:9' ? 16 / 9 : 4 / 3;
      const box = screen.width / screen.height > ratio ? { width: screen.height * ratio, height: screen.height } : { width: screen.width, height: screen.width / ratio };
      return { width: Math.round(box.width), height: Math.round(box.height), fit: 'fill' };
    }
    case 'original': {
      if (!video.width || !video.height || pixelRatio <= 0) return { ...full, fit: 'contain' };
      // Un pixel de la vidéo pour un pixel de l'écran, réduit seulement si la vidéo dépasse l'écran.
      const w = video.width / pixelRatio;
      const h = video.height / pixelRatio;
      const scale = Math.min(1, screen.width / w, screen.height / h);
      return { width: Math.round(w * scale), height: Math.round(h * scale), fit: 'contain' };
    }
    default:
      return { ...full, fit: 'contain' };
  }
}

/** Orientation adaptée à la vidéo (comme l'orientation automatique de VLC) ; null si carrée ou inconnue. */
export function preferredOrientation(video: Size): 'landscape' | 'portrait' | null {
  if (!video.width || !video.height) return null;
  if (video.width > video.height * 1.05) return 'landscape';
  if (video.height > video.width * 1.05) return 'portrait';
  return null;
}

/** Glissement vertical : toute la hauteur utile ≈ 70 % de l'écran pour passer de 0 à 100 %. */
export function swipeLevel(start: number, translationY: number, screenHeight: number): number {
  const travel = Math.max(1, screenHeight * 0.7);
  return Math.min(1, Math.max(0, start - translationY / travel));
}

/**
 * Glissement horizontal (comme VLC) : déplacement en secondes, progressif. Un glissement court
 * règle finement (10 à 20 s pour 10 % de la largeur) ; un glissement long parcourt la vidéo
 * (au plus 90 s + un quart de la durée, plafonné à 15 min, pour toute la largeur).
 */
export function seekSwipeDelta(translationX: number, screenWidth: number, durationSec: number): number {
  const f = Math.max(-1, Math.min(1, translationX / Math.max(1, screenWidth)));
  const span = Math.min(Math.max(durationSec, 0) * 0.25, 900);
  return Math.round(Math.sign(f) * (Math.abs(f) * 90 + f * f * span));
}

/** Volume ramené au cran le plus proche du volume système. */
export function volumeStep(level: number, steps: number): number {
  return steps > 0 ? Math.round(level * steps) / steps : level;
}
