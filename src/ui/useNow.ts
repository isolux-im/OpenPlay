import { useEffect, useState } from 'react';

/** Horloge rafraîchie périodiquement : évite d'appeler Date.now() pendant le rendu. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
