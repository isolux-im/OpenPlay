import { NetError, kindForStatus, parseRetryAfter, readJson, request } from '../net/http';

const json = (status: number, body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
  ({ ok: status >= 200 && status < 300, status, headers: { get: (k: string) => headers[k] ?? null }, json: async () => body }) as unknown as Response;

const fetchReturning = (res: Response) => (async () => res) as unknown as typeof fetch;

describe('requêtes réseau', () => {
  it('classe les statuts HTTP', () => {
    expect(kindForStatus(400)).toBe('bad-request');
    expect(kindForStatus(401)).toBe('auth');
    expect(kindForStatus(403)).toBe('auth');
    expect(kindForStatus(404)).toBe('not-found');
    expect(kindForStatus(429)).toBe('rate-limit');
    expect(kindForStatus(503)).toBe('server');
  });

  it('lit Retry-After en secondes ou en date HTTP', () => {
    expect(parseRetryAfter('120')).toBe(120);
    expect(parseRetryAfter('Sun, 25 Oct 2026 08:00:30 GMT', Date.parse('Sun, 25 Oct 2026 08:00:00 GMT'))).toBe(30);
    expect(parseRetryAfter(null)).toBeNull();
  });

  it('respecte un 429 et son délai', async () => {
    const err = await request('https://x.test/a', { service: 'LRCLIB', timeoutMs: 1000, fetchImpl: fetchReturning(json(429, {}, { 'Retry-After': '40' })) }).catch((e) => e);
    expect(err).toBeInstanceOf(NetError);
    expect(err).toMatchObject({ kind: 'rate-limit', status: 429, retryAfterSec: 40 });
    expect(err.message).toContain('40 s');
    expect(err.retryable).toBe(true);
  });

  it('laisse passer les statuts gérés par l’appelant', async () => {
    const res = await request('https://x.test/a', { service: 'LRCLIB', timeoutMs: 1000, acceptStatuses: [404], fetchImpl: fetchReturning(json(404, {})) });
    expect(res.status).toBe(404);
  });

  it('remonte le détail d’une erreur serveur, sans relance', async () => {
    let calls = 0;
    const impl = (async () => {
      calls += 1;
      return json(500, { error: { message: 'panne' } });
    }) as unknown as typeof fetch;
    const err = await request('https://x.test/a', { service: 'Groq', timeoutMs: 1000, fetchImpl: impl }).catch((e) => e);
    expect(err).toMatchObject({ kind: 'server', status: 500, detail: 'panne' });
    expect(calls).toBe(1);
  });

  it('borne la durée d’une requête', async () => {
    const hanging = ((_u: string, init: RequestInit) =>
      new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
    const err = await request('https://x.test/a', { service: 'LRCLIB', timeoutMs: 20, fetchImpl: hanging }).catch((e) => e);
    expect(err).toMatchObject({ kind: 'timeout' });
  });

  it('distingue absence de réseau, DNS et TLS grâce au diagnostic', async () => {
    const failing = (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    for (const kind of ['offline', 'dns', 'tls'] as const) {
      const err = await request('https://x.test/a', { service: 'LRCLIB', timeoutMs: 1000, fetchImpl: failing, diagnoseImpl: async () => ({ kind, detail: 'd' }) }).catch((e) => e);
      expect(err.kind).toBe(kind);
    }
  });

  it('refuse d’analyser une page HTML comme du JSON', async () => {
    await expect(readJson(json(200, {}, { 'Content-Type': 'text/html' }), 'LRCLIB')).rejects.toMatchObject({ kind: 'bad-response' });
  });
});
