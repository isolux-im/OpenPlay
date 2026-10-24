import {
  FAVORITES_KEY,
  loadFavorites,
  parseFavorites,
  saveFavorites,
  toggleFavorite,
  type KeyValueStorage,
} from '../favorites/favoritesStore';

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: async (k) => data[k] ?? null,
    setItem: async (k, v) => {
      data[k] = v;
    },
  };
}

describe('favoris', () => {
  it('ajoute puis retire un identifiant', () => {
    expect(toggleFavorite([], 'a')).toEqual(['a']);
    expect(toggleFavorite(['a', 'b'], 'a')).toEqual(['b']);
  });

  it.each([null, '', 'pas du json', '{"a":1}', '42'])('tolère une valeur stockée invalide : %p', (raw) => {
    expect(parseFavorites(raw)).toEqual([]);
  });

  it('ignore les entrées non textuelles et les doublons', () => {
    expect(parseFavorites('["a", 1, "b", "a", null]')).toEqual(['a', 'b']);
  });

  it('persiste et relit la liste', async () => {
    const storage = memoryStorage();
    await saveFavorites(['x', 'y'], storage);
    expect(storage.data[FAVORITES_KEY]).toBe('["x","y"]');
    expect(await loadFavorites(storage)).toEqual(['x', 'y']);
  });
});
