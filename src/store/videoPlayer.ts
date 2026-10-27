import { create } from 'zustand';

type Session = {
  id: string;
  /** Liste d'où la vidéo a été lancée : sert aux boutons précédent / suivant. */
  list: string[];
  /** Ignorer la position enregistrée (« Recommencer »). */
  restart: boolean;
  /** Incrémenté à chaque ouverture : relancer la même vidéo recrée la session. */
  seq: number;
};

/**
 * Affichage de la session vidéo : plein écran (FULLSCREEN) ou mini-lecteur flottant dans OpenPlay (IN_APP_MINI).
 * Le PiP Android (SYSTEM_PIP) s'y superpose : `pip` vrai tant que la fenêtre système est affichée.
 * Une seule session, un seul lecteur natif, quel que soit l'affichage.
 */
export type VideoDisplay = 'fullscreen' | 'mini';

type State = {
  session: Session | null;
  display: VideoDisplay;
  pip: boolean;
  /**
   * Ouvre une vidéo. `keepDisplay` : l'enchaînement (épisode suivant, précédent / suivant) garde le mode en cours ;
   * une vidéo choisie dans la bibliothèque s'ouvre en plein écran.
   */
  open: (id: string, list?: string[], options?: { restart?: boolean; keepDisplay?: boolean }) => void;
  step: (delta: 1 | -1) => void;
  /** Mini-lecteur interne : la bibliothèque redevient visible, la lecture continue. */
  minimize: () => void;
  /** Retour au plein écran, sans recréer le lecteur. */
  expand: () => void;
  setPip: (pip: boolean) => void;
  close: () => void;
};

let seq = 0;

export const useVideoPlayer = create<State>()((set, get) => ({
  session: null,
  display: 'fullscreen',
  pip: false,
  open: (id, list = [id], options = {}) =>
    set((s) => ({
      session: { id, list: list.includes(id) ? list : [id], restart: !!options.restart, seq: ++seq },
      display: options.keepDisplay && s.session ? s.display : 'fullscreen',
    })),
  step: (delta) => {
    const s = get().session;
    if (!s) return;
    const i = s.list.indexOf(s.id) + delta;
    if (i < 0 || i >= s.list.length) return;
    set({ session: { ...s, id: s.list[i], restart: false, seq: ++seq } });
  },
  minimize: () => set((s) => (s.session ? { display: 'mini' } : {})),
  expand: () => set({ display: 'fullscreen' }),
  setPip: (pip) => set({ pip }),
  close: () => set({ session: null, display: 'fullscreen', pip: false }),
}));
