import { useCallback, useEffect, useState } from 'react';

import type { Track } from '../types';
import { getAudioPermission, loadAudioTracks, requestAudioPermission, type PermissionState } from './mediaLibrary';

export function useLibrary() {
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTracks(await loadAudioTracks());
    } catch {
      setError('Impossible de lire la bibliothèque audio.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getAudioPermission()
      .then((p) => {
        setPermission(p);
        if (p === 'granted') refresh();
      })
      .catch(() => setPermission('undetermined'));
  }, [refresh]);

  const requestPermission = useCallback(async () => {
    const p = await requestAudioPermission();
    setPermission(p);
    if (p === 'granted') await refresh();
  }, [refresh]);

  return { permission, tracks, loading, error, refresh, requestPermission };
}
