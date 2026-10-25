/**
 * Coordination musique / vidéo : une seule lecture à la fois. Quand l'une démarre, l'autre se met
 * en pause en gardant sa file et sa position ; rien ne reprend automatiquement.
 */
let pauseVideo: (() => void) | null = null;

export function registerVideoPauser(fn: (() => void) | null) {
  pauseVideo = fn;
}

/** Appelé au démarrage de la musique. */
export function pauseVideoForMusic() {
  pauseVideo?.();
}
