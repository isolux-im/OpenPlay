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

type State = {
  session: Session | null;
  open: (id: string, list?: string[], options?: { restart?: boolean }) => void;
  step: (delta: 1 | -1) => void;
  close: () => void;
};

let seq = 0;

export const useVideoPlayer = create<State>()((set, get) => ({
  session: null,
  open: (id, list = [id], options = {}) => set({ session: { id, list: list.includes(id) ? list : [id], restart: !!options.restart, seq: ++seq } }),
  step: (delta) => {
    const s = get().session;
    if (!s) return;
    const i = s.list.indexOf(s.id) + delta;
    if (i < 0 || i >= s.list.length) return;
    set({ session: { ...s, id: s.list[i], restart: false, seq: ++seq } });
  },
  close: () => set({ session: null }),
}));
