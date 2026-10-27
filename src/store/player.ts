import { AppState } from 'react-native';
import { create } from 'zustand';

import { recordDiagnostic } from '../diagnostics/crashReports';
import { loadArtwork, peekArtwork } from '../library/artwork';
import type { EngineItem, PlaybackEngine } from '../player/PlaybackEngine';
import { pauseVideoForMusic } from '../player/mediaFocus';
import { indexAfterMove, moveItem, nextRepeat, shouldRestart, shuffleAround } from '../player/queue';
import type { RepeatMode, Track } from '../types';
import { formatDuration } from '../library/text';
import { useSettings } from './settings';
import { useStats } from './stats';
import { useUi } from './ui';
import { usePlaybackPosition, usePlaybackSession } from './session';
import { useUser, type Session } from './user';

export type SleepTimer = { endsAt: number | null; atTrackEnd: boolean };

export type PlayerState = {
  queue: string[];
  /** Ordre d'origine, rétabli quand on désactive l'aléatoire. */
  originalQueue: string[];
  index: number;
  isPlaying: boolean;
  isBuffering: boolean;
  positionSec: number;
  durationSec: number;
  shuffle: boolean;
  repeat: RepeatMode;
  sourceLabel: string | null;
  sleep: SleepTimer;
  expanded: boolean;
  /** Le lecteur plein écran reste monté pendant son animation de fermeture. */
  playerMounted: boolean;

  playTracks: (ids: string[], startIndex?: number, options?: { shuffle?: boolean; label?: string | null }) => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (sec: number) => void;
  jumpTo: (index: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  playNext: (ids: string[]) => void;
  addToQueue: (ids: string[]) => void;
  removeAt: (index: number) => void;
  moveInQueue: (from: number, to: number) => void;
  clearUpcoming: () => void;
  setSleepTimer: (minutes: number | null, atTrackEnd?: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  onPlayerClosed: () => void;
  restoreSession: (session: Session, exists: (id: string) => boolean) => void;
  setRate: (rate: number) => void;
};

/**
 * Une écoute est validée après 30 s de lecture effective (sauts dans le morceau exclus),
 * ou la moitié de la durée pour un morceau de moins d'une minute ; une seule fois par lecture.
 */
export const PLAY_COUNT_THRESHOLD_SEC = 30;
/** Écart maximal entre deux mises à jour de position compté comme de la lecture continue. */
const MAX_LISTEN_STEP_SEC = 2.5;
/** Au-delà de ce nombre d'échecs consécutifs, on arrête plutôt que d'enchaîner les fichiers illisibles. */
const MAX_CONSECUTIVE_ERRORS = 3;
/** Position de lecture retenue toutes les 15 s (petite écriture) ; la file, seulement quand elle change. */
const SESSION_SAVE_INTERVAL_MS = 15_000;
/** Fichiers longs : position de reprise retenue chaque minute (et à la pause, au changement de piste). */
const RESUME_SAVE_INTERVAL_MS = 60_000;
/**
 * Au-delà, l'aléatoire recharge la file en un appel (lecteur neuf, même position) plutôt que de
 * retirer et réinsérer chaque morceau un par un dans le lecteur natif.
 */
const INCREMENTAL_REORDER_LIMIT = 30;
/** Fichiers longs (livres audio, cours, podcasts) : la position est retenue d'une écoute à l'autre. */
export const LONG_TRACK_SEC = 20 * 60;
/** Pas de reprise dans la première ni la dernière demi-minute. */
const RESUME_MARGIN_SEC = 30;
export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;

let engine: PlaybackEngine | null = null;
let resolveTrack: (id: string) => Track | undefined = () => undefined;
let unsubscribers: (() => void)[] = [];
let countedCurrent = false;
let listenedSec = 0;
let lastPositionSec = 0;
let consecutiveErrors = 0;
/**
 * Rechargement de file (aléatoire) : le changement de piste que le lecteur neuf annonce, de façon
 * asynchrone, n'est pas une nouvelle écoute. Valable 2 s au plus.
 */
let reloadUntil = 0;
/** Temps d'écoute pas encore versé au bilan (écrit par paquets, pas à chaque mise à jour). */
let pendingListenSec = 0;
const LISTEN_FLUSH_SEC = 120;
let lastSessionSave = 0;
let lastResumeSave = 0;
let now: () => number = () => Date.now();
/**
 * Intention de lecture : ce que l'utilisateur a demandé en dernier (lecture ou pause), qu'il soit
 * passé par l'application, la notification, l'écran de verrouillage ou un casque. Les commandes de
 * l'application la fixent ; l'état natif ne la modifie qu'en dehors de la fenêtre qui suit une
 * commande, où il peut encore décrire l'état d'avant (événement émis avant la commande, reçu après).
 */
let wantsPlay = false;
let lastCommandAt = 0;
const COMMAND_SETTLE_MS = 1500;

function command(play: boolean) {
  wantsPlay = play;
  lastCommandAt = Date.now();
}

/** La musique joue ou va jouer (chargement en cours) : sert à la priorité musique / vidéo. */
export function musicWantsToPlay(): boolean {
  return wantsPlay || usePlayer.getState().isPlaying;
}

/** Position où reprendre `id`, ou 0. */
function resumeFor(id: string | undefined): number {
  if (!id || !useSettings.getState().resumeLongTracks) return 0;
  const track = resolveTrack(id);
  const saved = useUser.getState().resumePositions[id];
  if (!track || track.durationSec < LONG_TRACK_SEC || !saved) return 0;
  return saved > RESUME_MARGIN_SEC && saved < track.durationSec - RESUME_MARGIN_SEC ? saved : 0;
}

/** Retient la position d'un fichier long ; l'oublie quand il a été écouté jusqu'au bout. */
function rememberPosition(id: string | undefined, positionSec: number) {
  if (!id || !useSettings.getState().resumeLongTracks) return;
  const track = resolveTrack(id);
  if (!track || track.durationSec < LONG_TRACK_SEC) return;
  if (positionSec >= track.durationSec - RESUME_MARGIN_SEC) useUser.getState().setResumePosition(id, null);
  else if (positionSec > RESUME_MARGIN_SEC) useUser.getState().setResumePosition(id, positionSec);
}

function flushListening() {
  if (pendingListenSec > 0) useStats.getState().addListening(now(), pendingListenSec);
  pendingListenSec = 0;
}

function announceResume(sec: number) {
  if (sec > 0) useUi.getState().showToast(`Reprise à ${formatDuration(sec)}`);
}

function toItem(t: Track): EngineItem {
  return { id: t.id, uri: t.uri, title: t.title, artist: t.artist, album: t.album };
}

function itemsFor(ids: string[]): EngineItem[] {
  return ids.map((id) => resolveTrack(id)).filter((t): t is Track => !!t).map(toItem);
}

export const usePlayer = create<PlayerState>()((set, get) => {
  function persistSession() {
    const s = get();
    lastSessionSave = now();
    usePlaybackPosition.getState().save(s.queue[s.index] ?? null, s.positionSec);
    usePlaybackSession.getState().save(
      s.queue.length
        ? {
            queue: s.queue,
            originalQueue: s.originalQueue,
            index: s.index,
            positionSec: s.positionSec,
            shuffle: s.shuffle,
            repeat: s.repeat,
            sourceLabel: s.sourceLabel,
          }
        : null,
    );
  }

  function announceNowPlaying() {
    const { queue, index } = get();
    const track = resolveTrack(queue[index]);
    if (!track || !engine) return;
    const item = toItem(track);
    engine.setNowPlaying(item, peekArtwork(track)?.uri ?? null);
    if (!peekArtwork(track)) {
      loadArtwork(track).then((info) => {
        const s = get();
        if (s.queue[s.index] === track.id && info.uri) engine?.setNowPlaying(item, info.uri);
      });
    }
  }

  /** Réordonne la file native autour de la piste courante, sans interrompre la lecture. */
  function rebuildAround(queue: string[], index: number, newQueue: string[], newIndex: number) {
    if (!engine) return;
    for (let i = queue.length - 1; i >= 0; i--) if (i !== index) engine.remove(i);
    newQueue.forEach((id, j) => {
      if (j === newIndex) return;
      const t = resolveTrack(id);
      if (t) engine?.insert(toItem(t), j);
    });
  }

  return {
    queue: [],
    originalQueue: [],
    index: -1,
    isPlaying: false,
    isBuffering: false,
    positionSec: 0,
    durationSec: 0,
    shuffle: false,
    repeat: 'off',
    sourceLabel: null,
    sleep: { endsAt: null, atTrackEnd: false },
    expanded: false,
    playerMounted: false,

    playTracks: (ids, startIndex, options = {}) => {
      const valid = ids.filter((id) => resolveTrack(id));
      if (!valid.length || !engine) return;
      const shuffle = options.shuffle ?? false;
      const requested = startIndex === undefined ? -1 : valid.indexOf(ids[startIndex]);
      // En aléatoire sans morceau choisi, la première piste est elle-même tirée au sort.
      const pivot = requested >= 0 ? requested : shuffle ? Math.floor(Math.random() * valid.length) : 0;
      const queue = shuffle ? shuffleAround(valid, pivot) : valid;
      const index = shuffle ? 0 : pivot;
      const previous = get();
      rememberPosition(previous.queue[previous.index], previous.positionSec);
      countedCurrent = false;
      listenedSec = 0;
      lastPositionSec = 0;
      const resumeAt = resumeFor(queue[index]);
      set({
        queue,
        originalQueue: valid,
        index,
        shuffle,
        positionSec: resumeAt,
        durationSec: resolveTrack(queue[index])?.durationSec ?? 0,
        sourceLabel: options.label ?? null,
        isPlaying: true,
      });
      command(true);
      pauseVideoForMusic();
      engine.load(itemsFor(queue), index, resumeAt, true);
      announceResume(resumeAt);
      announceNowPlaying();
      persistSession();
    },

    toggle: () => (get().isPlaying ? get().pause() : get().play()),
    play: () => {
      if (!get().queue.length) return;
      command(true);
      pauseVideoForMusic();
      engine?.play();
      set({ isPlaying: true });
    },
    pause: () => {
      command(false);
      rememberPosition(get().queue[get().index], get().positionSec);
      flushListening();
      engine?.pause();
      set({ isPlaying: false, isBuffering: false });
      persistSession();
    },
    next: () => {
      const { index, queue, repeat } = get();
      if (index < queue.length - 1 || repeat === 'all') engine?.next();
    },
    previous: () => {
      const { positionSec, index, repeat } = get();
      if (shouldRestart(positionSec, index, repeat)) get().seek(0);
      else engine?.previous();
    },
    seek: (sec) => {
      const s = Math.max(0, Math.min(sec, get().durationSec || sec));
      engine?.seekTo(s);
      set({ positionSec: s });
    },
    jumpTo: (i) => {
      if (i < 0 || i >= get().queue.length) return;
      command(true);
      pauseVideoForMusic();
      engine?.skipTo(i);
      engine?.play();
      set({ isPlaying: true });
    },
    setRate: (rate) => {
      useSettings.getState().update({ playbackRate: rate });
      engine?.setRate(rate);
    },

    toggleShuffle: () => {
      const { shuffle, queue, index, originalQueue } = get();
      if (!queue.length) {
        set({ shuffle: !shuffle });
        return;
      }
      const currentId = queue[index];
      const newQueue = shuffle ? originalQueue : shuffleAround(queue, index);
      const newIndex = Math.max(0, newQueue.indexOf(currentId));
      set({ shuffle: !shuffle, queue: newQueue, index: newIndex });
      if (queue.length <= INCREMENTAL_REORDER_LIMIT) rebuildAround(queue, index, newQueue, newIndex);
      else if (engine) {
        const { positionSec } = get();
        reloadUntil = Date.now() + 2000;
        engine.load(itemsFor(newQueue), newIndex, positionSec, wantsPlay);
        announceNowPlaying();
      }
      persistSession();
    },
    cycleRepeat: () => {
      const repeat = nextRepeat(get().repeat);
      engine?.setRepeat(repeat);
      set({ repeat });
      persistSession();
    },

    playNext: (ids) => {
      const { queue, index, originalQueue } = get();
      if (!queue.length) return get().playTracks(ids);
      const items = ids.filter((id) => resolveTrack(id));
      items.forEach((id, k) => engine?.insert(toItem(resolveTrack(id)!), index + 1 + k));
      const at = originalQueue.indexOf(queue[index]) + 1;
      set({
        queue: [...queue.slice(0, index + 1), ...items, ...queue.slice(index + 1)],
        originalQueue: [...originalQueue.slice(0, at), ...items, ...originalQueue.slice(at)],
      });
      persistSession();
    },
    addToQueue: (ids) => {
      const { queue, originalQueue } = get();
      if (!queue.length) return get().playTracks(ids);
      const items = ids.filter((id) => resolveTrack(id));
      items.forEach((id, k) => engine?.insert(toItem(resolveTrack(id)!), queue.length + k));
      set({ queue: [...queue, ...items], originalQueue: [...originalQueue, ...items] });
      persistSession();
    },
    removeAt: (i) => {
      const { queue, index, originalQueue } = get();
      if (i === index || i < 0 || i >= queue.length) return;
      engine?.remove(i);
      const id = queue[i];
      const o = originalQueue.indexOf(id);
      set({
        queue: queue.filter((_, k) => k !== i),
        originalQueue: o >= 0 ? originalQueue.filter((_, k) => k !== o) : originalQueue,
        index: i < index ? index - 1 : index,
      });
      persistSession();
    },
    moveInQueue: (from, to) => {
      const { queue, index } = get();
      if (from === index || to < 0 || to >= queue.length || from === to) return;
      const t = resolveTrack(queue[from]);
      if (!t) return;
      engine?.remove(from);
      engine?.insert(toItem(t), to);
      set({ queue: moveItem(queue, from, to), index: indexAfterMove(index, from, to) });
      persistSession();
    },
    clearUpcoming: () => {
      const { queue, index, originalQueue } = get();
      for (let i = queue.length - 1; i > index; i--) engine?.remove(i);
      const kept = queue.slice(0, index + 1);
      set({ queue: kept, originalQueue: originalQueue.filter((id) => kept.includes(id)) });
      persistSession();
    },

    setSleepTimer: (minutes, atTrackEnd = false) =>
      set({ sleep: { endsAt: minutes ? now() + minutes * 60_000 : null, atTrackEnd } }),
    setExpanded: (expanded) => set(expanded ? { expanded, playerMounted: true } : { expanded }),
    onPlayerClosed: () => set((s) => (s.expanded ? {} : { playerMounted: false })),

    restoreSession: (session, exists) => {
      if (!engine || get().queue.length) return;
      const queue = session.queue.filter(exists);
      if (!queue.length) return;
      const currentId = session.queue[session.index];
      const index = Math.max(0, queue.indexOf(currentId));
      const positionSec = queue[index] === currentId ? session.positionSec : 0;
      countedCurrent = true;
      command(false);
      set({
        queue,
        originalQueue: session.originalQueue.filter(exists),
        index,
        positionSec,
        durationSec: resolveTrack(queue[index])?.durationSec ?? 0,
        shuffle: session.shuffle,
        repeat: session.repeat,
        sourceLabel: session.sourceLabel,
        isPlaying: false,
      });
      engine.setRepeat(session.repeat);
      engine.load(itemsFor(queue), index, positionSec, false);
      announceNowPlaying();
    },
  };
});

/** Branche le moteur audio sur le store. À appeler une seule fois au démarrage. */
export function connectPlayer(
  e: PlaybackEngine,
  resolver: (id: string) => Track | undefined,
  options: { clock?: () => number } = {},
) {
  disconnectPlayer();
  engine = e;
  resolveTrack = resolver;
  e.setRate(useSettings.getState().playbackRate);
  if (options.clock) now = options.clock;
  const store = usePlayer;

  // Passage en arrière-plan : bilan et positions écrits tout de suite (les écritures sont espacées).
  const appState = AppState.addEventListener('change', (next) => {
    if (next === 'active') return;
    const cur = store.getState();
    flushListening();
    if (cur.queue.length) {
      usePlaybackPosition.getState().save(cur.queue[cur.index] ?? null, cur.positionSec);
      rememberPosition(cur.queue[cur.index], cur.positionSec);
    }
  });
  unsubscribers.push(() => appState.remove());

  unsubscribers.push(
    e.onStatus((s) => {
      const state = store.getState();
      if (Date.now() - lastCommandAt < COMMAND_SETTLE_MS) {
        // Juste après une commande, un état contraire est périmé. Après une pause, s'il dit « en lecture »,
        // la pause est réappliquée (sans effet si le son est déjà coupé) : rien ne relance la musique.
        if (!wantsPlay && s.playing) e.pause();
      } else if (s.playing) wantsPlay = true;
      else if (!s.isBuffering) wantsPlay = false; // pause depuis la notification, fin de file, perte du focus audio
      const playing = wantsPlay && (s.playing || s.isBuffering || Date.now() - lastCommandAt < COMMAND_SETTLE_MS);
      // En arrière-plan, la position affichée n'est rafraîchie que toutes les 10 s (moins de rendus) ;
      // le comptage des écoutes, lui, continue à chaque mise à jour.
      const background = AppState.currentState === 'background';
      if (!background || playing !== state.isPlaying || s.isBuffering !== state.isBuffering || Math.abs(s.positionSec - state.positionSec) >= 10) {
        store.setState({
          isPlaying: playing,
          isBuffering: s.isBuffering,
          positionSec: s.positionSec,
          durationSec: s.durationSec > 0 ? s.durationSec : state.durationSec,
        });
      }
      const currentId = state.queue[state.index];
      const step = s.positionSec - lastPositionSec;
      const duration = s.durationSec || state.durationSec;
      // Répétition d'un morceau : retour au début depuis la fin = nouvelle lecture.
      if (step < -5 && s.positionSec < 2 && duration > 0 && lastPositionSec >= duration - 3) {
        countedCurrent = false;
        listenedSec = 0;
      }
      if (s.playing && step > 0 && step <= MAX_LISTEN_STEP_SEC) {
        listenedSec += step;
        if (listenedSec >= 1) consecutiveErrors = 0;
        // Temps réel : à 2×, une seconde de morceau dure une demi-seconde.
        pendingListenSec += step / (useSettings.getState().playbackRate || 1);
        if (pendingListenSec >= LISTEN_FLUSH_SEC) flushListening();
      }
      lastPositionSec = s.positionSec;
      const threshold = Math.min(PLAY_COUNT_THRESHOLD_SEC, (duration || Infinity) / 2);
      if (currentId && !countedCurrent && listenedSec >= threshold) {
        countedCurrent = true;
        useUser.getState().recordPlay(currentId, now());
        useStats.getState().addPlay(currentId, now());
      }
      const { endsAt } = state.sleep;
      if (endsAt && now() >= endsAt) {
        store.setState({ sleep: { endsAt: null, atTrackEnd: false } });
        state.pause();
      }
      if (now() - lastSessionSave > SESSION_SAVE_INTERVAL_MS && state.queue.length) {
        lastSessionSave = now();
        usePlaybackPosition.getState().save(currentId ?? null, s.positionSec);
      }
      if (s.playing && now() - lastResumeSave > RESUME_SAVE_INTERVAL_MS) {
        lastResumeSave = now();
        rememberPosition(currentId, s.positionSec);
      }
    }),
    e.onTrackChanged((i) => {
      const state = store.getState();
      if (i < 0 || i >= state.queue.length) return;
      if (i === state.index && Date.now() < reloadUntil) {
        reloadUntil = 0;
        return;
      }
      if (i !== state.index) rememberPosition(state.queue[state.index], state.positionSec);
      flushListening();
      countedCurrent = false;
      listenedSec = 0;
      lastPositionSec = 0;
      const resumeAt = i !== state.index ? resumeFor(state.queue[i]) : 0;
      store.setState({ index: i, positionSec: resumeAt, durationSec: resolveTrack(state.queue[i])?.durationSec ?? 0 });
      usePlaybackPosition.getState().save(state.queue[i], resumeAt);
      if (resumeAt > 0) {
        e.seekTo(resumeAt);
        lastPositionSec = resumeAt;
        announceResume(resumeAt);
      }
      if (state.sleep.atTrackEnd) {
        store.setState({ sleep: { endsAt: null, atTrackEnd: false } });
        state.pause();
      }
      const track = resolveTrack(state.queue[i]);
      if (track) {
        const item = toItem(track);
        e.setNowPlaying(item, peekArtwork(track)?.uri ?? null);
        if (!peekArtwork(track)) loadArtwork(track).then((info) => info.uri && store.getState().queue[store.getState().index] === track.id && e.setNowPlaying(item, info.uri));
      }
    }),
    e.onError(({ index, message }) => {
      const state = store.getState();
      const at = index >= 0 && index < state.queue.length ? index : state.index;
      const track = resolveTrack(state.queue[at]);
      const title = track?.title ?? 'Ce morceau';
      recordDiagnostic('Fichier audio illisible', `${title} (${track?.mimeType ?? 'type inconnu'}) : ${message}`);
      consecutiveErrors += 1;
      const nextIndex = at < state.queue.length - 1 ? at + 1 : state.repeat === 'all' ? 0 : -1;
      // Après une pause ou un arrêt manuels, une erreur tardive ne relance jamais la lecture.
      if (wantsPlay && nextIndex >= 0 && nextIndex !== at && consecutiveErrors < MAX_CONSECUTIVE_ERRORS) {
        useUi.getState().showToast(`« ${title} » est illisible : morceau suivant`);
        store.setState({ index: nextIndex, positionSec: 0, durationSec: resolveTrack(state.queue[nextIndex])?.durationSec ?? 0, isPlaying: true });
        // Le moteur repart d'un lecteur neuf, positionné sur le morceau suivant.
        command(true);
        e.skipTo(nextIndex);
        e.play();
      } else {
        // On s'arrête : le lecteur neuf ne sera créé qu'à la prochaine demande de lecture (pas de boucle d'échecs).
        useUi.getState().showToast(`Lecture impossible : « ${title} » est absent ou illisible`);
        command(false);
        store.setState({ isPlaying: false, positionSec: 0 });
        consecutiveErrors = 0;
      }
      countedCurrent = false;
      listenedSec = 0;
      lastPositionSec = 0;
    }),
  );
}

export function disconnectPlayer() {
  flushListening();
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
  engine?.release();
  engine = null;
  countedCurrent = false;
  listenedSec = 0;
  lastPositionSec = 0;
  consecutiveErrors = 0;
  lastSessionSave = 0;
  lastResumeSave = 0;
  reloadUntil = 0;
  wantsPlay = false;
  lastCommandAt = 0;
  now = () => Date.now();
}

export function currentTrackId(s: Pick<PlayerState, 'queue' | 'index'>): string | null {
  return s.queue[s.index] ?? null;
}
