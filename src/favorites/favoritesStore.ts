import AsyncStorage from '@react-native-async-storage/async-storage';

export const FAVORITES_KEY = 'openplay.favorites.v1';

export type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

/** Tolère une valeur absente ou corrompue : on repart alors d'une liste vide. */
export function parseFavorites(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((v): v is string => typeof v === 'string'))];
  } catch {
    return [];
  }
}

export function toggleFavorite(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

export async function loadFavorites(storage: KeyValueStorage = AsyncStorage): Promise<string[]> {
  return parseFavorites(await storage.getItem(FAVORITES_KEY));
}

export async function saveFavorites(ids: string[], storage: KeyValueStorage = AsyncStorage): Promise<void> {
  await storage.setItem(FAVORITES_KEY, JSON.stringify(ids));
}
