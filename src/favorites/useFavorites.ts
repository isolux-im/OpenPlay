import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { loadFavorites, saveFavorites, toggleFavorite } from './favoritesStore';

export function useFavorites() {
  const [ids, setIds] = useState<string[]>([]);
  const idsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadFavorites()
      .then((loaded) => {
        if (cancelled) return;
        idsRef.current = loaded;
        setIds(loaded);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback((id: string) => {
    const updated = toggleFavorite(idsRef.current, id);
    idsRef.current = updated;
    setIds(updated);
    saveFavorites(updated).catch(() => {});
  }, []);

  const set = useMemo(() => new Set(ids), [ids]);
  const isFavorite = useCallback((id: string) => set.has(id), [set]);

  return { ids, isFavorite, toggle };
}
