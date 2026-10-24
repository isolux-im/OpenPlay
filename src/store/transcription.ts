import { create } from 'zustand';

import { getApiKey } from '../lyrics/apiKeys';
import { TranscriptionError, transcribeTrack } from '../lyrics/transcription';
import type { Track } from '../types';
import { useSettings } from './settings';
import { useUser } from './user';

type Job = { status: 'running' } | { status: 'error'; message: string };

type TranscriptionState = {
  jobs: Record<string, Job>;
  start: (track: Track) => Promise<boolean>;
  cancel: (trackId: string) => void;
  clearError: (trackId: string) => void;
};

const controllers = new Map<string, AbortController>();

/** Transcriptions en cours, indépendantes de l'écran affiché (on peut quitter les paroles). */
export const useTranscription = create<TranscriptionState>()((set) => ({
  jobs: {},

  start: async (track) => {
    if (controllers.has(track.id)) return false;
    const controller = new AbortController();
    controllers.set(track.id, controller);
    set((s) => ({ jobs: { ...s.jobs, [track.id]: { status: 'running' } } }));
    const { aiProvider, aiLanguage } = useSettings.getState();
    try {
      const lyrics = await transcribeTrack({
        track,
        provider: aiProvider,
        apiKey: await getApiKey(aiProvider),
        language: aiLanguage,
        signal: controller.signal,
      });
      useUser.getState().setLyrics(track.id, lyrics);
      set((s) => {
        const jobs = { ...s.jobs };
        delete jobs[track.id];
        return { jobs };
      });
      return true;
    } catch (e) {
      const message = e instanceof TranscriptionError ? e.message : 'Transcription impossible.';
      set((s) => {
        const jobs = { ...s.jobs };
        if (e instanceof TranscriptionError && e.code === 'cancelled') delete jobs[track.id];
        else jobs[track.id] = { status: 'error', message };
        return { jobs };
      });
      return false;
    } finally {
      controllers.delete(track.id);
    }
  },

  cancel: (trackId) => controllers.get(trackId)?.abort(),

  clearError: (trackId) =>
    set((s) => {
      const jobs = { ...s.jobs };
      delete jobs[trackId];
      return { jobs };
    }),
}));
