export type MiniSwipe = 'next' | 'previous' | 'open' | null;

/** Distances (px) et vitesses (px/s) à partir desquelles un glissement du mini-lecteur compte. */
export const SWIPE_DISTANCE = 60;
export const SWIPE_VELOCITY = 700;
export const SWIPE_UP_DISTANCE = 40;

/**
 * Glisser vers la gauche : morceau suivant ; vers la droite : précédent ; vers le haut : ouvrir
 * le lecteur. Le sens dominant l'emporte ; un geste trop court ne fait rien.
 */
export function miniSwipeAction(tx: number, ty: number, vx: number, vy: number): MiniSwipe {
  if (Math.abs(tx) >= Math.abs(ty)) {
    if (tx <= -SWIPE_DISTANCE || (tx < 0 && vx <= -SWIPE_VELOCITY)) return 'next';
    if (tx >= SWIPE_DISTANCE || (tx > 0 && vx >= SWIPE_VELOCITY)) return 'previous';
    return null;
  }
  return ty <= -SWIPE_UP_DISTANCE || (ty < 0 && vy <= -SWIPE_VELOCITY) ? 'open' : null;
}
