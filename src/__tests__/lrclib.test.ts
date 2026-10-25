import { useOnlineLyrics } from '../store/onlineLyrics';
import type { Track } from '../types';
import { cleanTitle, fetchLyrics, isGoodMatch, pickBest, resetLrclibBackoff, type LrclibRecord } from '../lyrics/lrclib';

const track = { title: 'Agolo', artist: 'Angélique Kidjo', album: 'Aye', durationSec: 271 };
const rec = (over: Partial<LrclibRecord> = {}): LrclibRecord => ({
  id: 1,
  trackName: 'Agolo',
  artistName: 'Angelique Kidjo',
  albumName: 'Aye',
  duration: 272,
  instrumental: false,
  plainLyrics: 'Agolo',
  syncedLyrics: '[00:12.00]Agolo',
  ...over,
});

const res = (status: number, body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
  ({ ok: status >= 200 && status < 300, status, headers: { get: (k: string) => headers[k] ?? null }, json: async () => body }) as unknown as Response;

function fakeFetch(routes: Record<string, Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;
    return routes[path] ?? res(500, {});
  }) as unknown as typeof fetch;
  return { impl, calls };
}

beforeEach(() => resetLrclibBackoff());

describe('LRCLIB', () => {
  it('nettoie les titres', () => {
    expect(cleanTitle('Bohemian Rhapsody (Remastered 2011)')).toBe('bohemian rhapsody');
    expect(cleanTitle('Song - Live')).toBe('song');
    expect(cleanTitle('Track feat. Someone')).toBe('track');
  });

  it('n’accepte pas aveuglément un titre similaire', () => {
    expect(isGoodMatch(track, rec())).toBe(true);
    expect(isGoodMatch(track, rec({ artistName: 'Autre artiste' }))).toBe(false);
    expect(isGoodMatch(track, rec({ trackName: 'Agolo Remix Party' }))).toBe(false);
    expect(isGoodMatch(track, rec({ duration: 300 }))).toBe(false);
    expect(isGoodMatch({ ...track, artist: 'Angélique Kidjo feat. X' }, rec())).toBe(true);
  });

  it('préfère les paroles synchronisées puis la durée la plus proche', () => {
    const best = pickBest(track, [rec({ id: 2, syncedLyrics: null }), rec({ id: 3, duration: 270 }), rec({ id: 4, duration: 271 })]);
    expect(best?.id).toBe(4);
  });

  it('interroge /api/get avec des paramètres encodés et un User-Agent OpenPlay', async () => {
    const { impl, calls } = fakeFetch({ '/api/get': res(200, rec()) });
    const out = await fetchLyrics(track, { fetchImpl: impl });
    expect(out).toEqual({ kind: 'synced', text: '[00:12.00]Agolo', recordId: 1 });
    expect(calls[0].url).toBe('https://lrclib.net/api/get?track_name=Agolo&artist_name=Ang%C3%A9lique%20Kidjo&album_name=Aye&duration=271');
    expect((calls[0].init.headers as Record<string, string>)['User-Agent']).toMatch(/^OpenPlay\//);
  });

  it('se rabat sur /api/search puis sur les paroles simples', async () => {
    const { impl, calls } = fakeFetch({ '/api/get': res(404, { message: 'not found' }), '/api/search': res(200, [rec({ id: 9, syncedLyrics: null, plainLyrics: 'Texte' })]) });
    expect(await fetchLyrics(track, { fetchImpl: impl })).toEqual({ kind: 'plain', text: 'Texte', recordId: 9 });
    expect(calls).toHaveLength(2);
  });

  it('signale les morceaux instrumentaux et l’absence de résultat, sans inventer', async () => {
    const instr = fakeFetch({ '/api/get': res(200, rec({ instrumental: true, plainLyrics: null, syncedLyrics: null })) });
    expect((await fetchLyrics(track, { fetchImpl: instr.impl })).kind).toBe('instrumental');
    const none = fakeFetch({ '/api/get': res(404, {}), '/api/search': res(200, [rec({ artistName: 'Quelqu’un d’autre' })]) });
    expect(await fetchLyrics(track, { fetchImpl: none.impl })).toEqual({ kind: 'none' });
  });

  it('ne cherche pas sans artiste connu', async () => {
    const { impl, calls } = fakeFetch({});
    expect(await fetchLyrics({ ...track, artist: 'Artiste inconnu' }, { fetchImpl: impl })).toEqual({ kind: 'none' });
    expect(calls).toHaveLength(0);
  });

  it('respecte Retry-After après un 429 sans renvoyer de requête', async () => {
    let clock = 1_000_000;
    const { impl, calls } = fakeFetch({ '/api/get': res(429, {}, { 'Retry-After': '30' }) });
    await expect(fetchLyrics(track, { fetchImpl: impl, now: () => clock })).rejects.toMatchObject({ kind: 'rate-limit' });
    clock += 10_000;
    await expect(fetchLyrics(track, { fetchImpl: impl, now: () => clock })).rejects.toMatchObject({ kind: 'rate-limit', retryAfterSec: 20 });
    expect(calls).toHaveLength(1);
  });

  it('refuse une réponse qui n’est pas du JSON', async () => {
    const { impl } = fakeFetch({ '/api/get': res(200, '<html>', { 'Content-Type': 'text/html' }) });
    await expect(fetchLyrics(track, { fetchImpl: impl })).rejects.toMatchObject({ kind: 'bad-response' });
  });
});

describe('recherche en ligne pendant la lecture', () => {
  const t = { ...track, id: 't1' } as unknown as Track;
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    useOnlineLyrics.setState({ entries: {} });
  });

  it('abandonne la requête d’un morceau quitté et relance à la réouverture', async () => {
    let calls = 0;
    globalThis.fetch = ((_u: string, init: RequestInit) => {
      calls += 1;
      return new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    }) as unknown as typeof fetch;
    useOnlineLyrics.getState().request(t);
    expect(useOnlineLyrics.getState().entries.t1).toEqual({ status: 'loading' });
    useOnlineLyrics.getState().cancel('t1');
    expect(useOnlineLyrics.getState().entries.t1).toBeUndefined();
    useOnlineLyrics.getState().request(t);
    expect(useOnlineLyrics.getState().entries.t1).toEqual({ status: 'loading' });
    await Promise.resolve();
    expect(calls).toBe(2);
    useOnlineLyrics.getState().cancel('t1');
  });

  it('ne relance pas seule une recherche en erreur', async () => {
    globalThis.fetch = (async () => res(503, {})) as unknown as typeof fetch;
    useOnlineLyrics.getState().request(t);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(useOnlineLyrics.getState().entries.t1).toMatchObject({ status: 'error', retryable: true });
    useOnlineLyrics.getState().request(t);
    expect(useOnlineLyrics.getState().entries.t1).toMatchObject({ status: 'error' });
  });
});
