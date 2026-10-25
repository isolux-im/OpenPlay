import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Playlist, RepeatMode } from '../types';
import { persistStorage } from './storage';

export type HistoryEntry = { trackId: string; at: number };

export type Session = {
  queue: string[];
  originalQueue: string[];
  index: number;
  positionSec: number;
  shuffle: boolean;
  repeat: RepeatMode;
  sourceLabel: string | null;
};

export const HISTORY_LIMIT = 500;
export const RECENT_SEARCH_LIMIT = 10;

type UserState = {
  favorites: string[];
  playlists: Playlist[];
  history: HistoryEntry[];
  playCounts: Record<string, number>;
  /** Date (ms) de la dernière écoute validée par morceau : non limitée, contrairement à `history`. */
  lastPlayed: Record<string, number>;
  recentSearches: string[];
  lyrics: Record<string, string>;
  session: Session | null;

  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;

  createPlaylist: (name: string, trackIds?: string[]) => Playlist;
  renamePlaylist: (id: string, name: string, description?: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (id: string, trackIds: string[]) => void;
  removeFromPlaylist: (id: string, index: number) => void;
  movePlaylistTrack: (id: string, from: number, to: number) => void;
  setPlaylistTracks: (id: string, trackIds: string[]) => void;
  /** Oublie des morceaux supprimés de l'appareil (favoris, playlists, historique, paroles). */
  forgetTracks: (ids: string[]) => void;

  recordPlay: (trackId: string, at?: number) => void;
  clearHistory: () => void;
  addRecentSearch: (q: string) => void;
  clearRecentSearches: () => void;
  setLyrics: (trackId: string, text: string | null) => void;
  saveSession: (s: Session | null) => void;
};

/**
 * v2 : ajout de `lastPlayed`, reconstitué depuis l'historique existant (rien n'est supprimé).
 * Les morceaux comptés mais sortis de l'historique limité restent sans date connue.
 */
export function migrateUser(persisted: unknown, version: number): Record<string, unknown> {
  const s = { ...((persisted ?? {}) as Record<string, unknown>) };
  if (version < 2) {
    const lastPlayed: Record<string, number> = {};
    for (const h of (s.history as HistoryEntry[] | undefined) ?? []) {
      if (h && typeof h.at === 'number' && (lastPlayed[h.trackId] ?? 0) < h.at) lastPlayed[h.trackId] = h.at;
    }
    s.lastPlayed = lastPlayed;
  }
  return s;
}

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

function updatePlaylist(list: Playlist[], id: string, f: (p: Playlist) => Partial<Playlist>): Playlist[] {
  return list.map((p) => (p.id === id ? { ...p, ...f(p), updatedAt: Date.now() } : p));
}

export const useUser = create<UserState>()(
  persist(
    (set, get) => ({
      favorites: [],
      playlists: [],
      history: [],
      playCounts: {},
      lastPlayed: {},
      recentSearches: [],
      lyrics: {},
      session: null,

      toggleFavorite: (id) =>
        set((s) => ({ favorites: s.favorites.includes(id) ? s.favorites.filter((x) => x !== id) : [id, ...s.favorites] })),
      isFavorite: (id) => get().favorites.includes(id),

      createPlaylist: (name, trackIds = []) => {
        const now = Date.now();
        const p: Playlist = { id: newId('pl'), name: name.trim() || 'Nouvelle playlist', description: '', trackIds, createdAt: now, updatedAt: now };
        set((s) => ({ playlists: [p, ...s.playlists] }));
        return p;
      },
      renamePlaylist: (id, name, description) =>
        set((s) => ({
          playlists: updatePlaylist(s.playlists, id, (p) => ({ name: name.trim() || p.name, description: description ?? p.description })),
        })),
      deletePlaylist: (id) => set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),
      addToPlaylist: (id, trackIds) =>
        set((s) => ({ playlists: updatePlaylist(s.playlists, id, (p) => ({ trackIds: [...p.trackIds, ...trackIds] })) })),
      removeFromPlaylist: (id, index) =>
        set((s) => ({ playlists: updatePlaylist(s.playlists, id, (p) => ({ trackIds: p.trackIds.filter((_, i) => i !== index) })) })),
      movePlaylistTrack: (id, from, to) =>
        set((s) => ({
          playlists: updatePlaylist(s.playlists, id, (p) => {
            if (to < 0 || to >= p.trackIds.length) return {};
            const ids = [...p.trackIds];
            const [x] = ids.splice(from, 1);
            ids.splice(to, 0, x);
            return { trackIds: ids };
          }),
        })),
      setPlaylistTracks: (id, trackIds) => set((s) => ({ playlists: updatePlaylist(s.playlists, id, () => ({ trackIds })) })),
      forgetTracks: (ids) =>
        set((s) => {
          const gone = new Set(ids);
          const playCounts = { ...s.playCounts };
          const lastPlayed = { ...s.lastPlayed };
          const lyrics = { ...s.lyrics };
          for (const id of ids) {
            delete playCounts[id];
            delete lastPlayed[id];
            delete lyrics[id];
          }
          return {
            favorites: s.favorites.filter((id) => !gone.has(id)),
            playlists: s.playlists.map((p) => (p.trackIds.some((id) => gone.has(id)) ? { ...p, trackIds: p.trackIds.filter((id) => !gone.has(id)), updatedAt: Date.now() } : p)),
            history: s.history.filter((h) => !gone.has(h.trackId)),
            playCounts,
            lastPlayed,
            lyrics,
          };
        }),

      recordPlay: (trackId, at = Date.now()) =>
        set((s) => ({
          history: [{ trackId, at }, ...s.history].slice(0, HISTORY_LIMIT),
          playCounts: { ...s.playCounts, [trackId]: (s.playCounts[trackId] ?? 0) + 1 },
          lastPlayed: { ...s.lastPlayed, [trackId]: Math.max(at, s.lastPlayed[trackId] ?? 0) },
        })),
      clearHistory: () => set({ history: [], playCounts: {}, lastPlayed: {} }),
      addRecentSearch: (q) => {
        const v = q.trim();
        if (!v) return;
        set((s) => ({ recentSearches: [v, ...s.recentSearches.filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, RECENT_SEARCH_LIMIT) }));
      },
      clearRecentSearches: () => set({ recentSearches: [] }),
      setLyrics: (trackId, text) =>
        set((s) => {
          const lyrics = { ...s.lyrics };
          if (text) lyrics[trackId] = text;
          else delete lyrics[trackId];
          return { lyrics };
        }),
      saveSession: (session) => set({ session }),
    }),
    {
      name: 'openplay.user.v1',
      storage: persistStorage,
      version: 2,
      migrate: (persisted, version) => migrateUser(persisted, version) as UserState,
      partialize: ({ favorites, playlists, history, playCounts, lastPlayed, recentSearches, lyrics, session }) => ({
        favorites,
        playlists,
        history,
        playCounts,
        lastPlayed,
        recentSearches,
        lyrics,
        session,
      }),
    },
  ),
);
