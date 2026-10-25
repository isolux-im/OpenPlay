import {
  AI_LYRICS_TAG,
  PROVIDERS,
  TranscriptionError,
  buildFields,
  errorForStatus,
  formatLrcTime,
  isAiLyrics,
  responseToLyrics,
  segmentsToLrc,
  transcribeTrack,
} from '../lyrics/transcription';
import { parseLyrics } from '../player/lrc';

const track = { uri: 'content://media/external/audio/media/7', title: 'Aube', path: '/storage/emulated/0/Music/Aube.mp3', sizeBytes: 5_000_000, mimeType: 'audio/mpeg' };

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const verbose = {
  text: 'Bonjour le monde. Deuxième ligne.',
  segments: [
    { start: 1.234, end: 3, text: ' Bonjour   le monde. ' },
    { start: 65.5, end: 70, text: 'Deuxième ligne.' },
    { start: 80, end: 81, text: '   ' },
  ],
};

describe('conversion en paroles', () => {
  it('formate les horodatages LRC', () => {
    expect(formatLrcTime(0)).toBe('00:00.00');
    expect(formatLrcTime(65.5)).toBe('01:05.50');
    expect(formatLrcTime(-3)).toBe('00:00.00');
  });

  it('produit un .lrc synchronisé lisible par le lecteur', () => {
    const lrc = segmentsToLrc(verbose.segments);
    expect(lrc).toBe(`${AI_LYRICS_TAG}\n[00:01.23]Bonjour le monde.\n[01:05.50]Deuxième ligne.`);
    const parsed = parseLyrics(lrc);
    expect(parsed.synced).toBe(true);
    expect(parsed.lines.map((l) => l.text)).toEqual(['Bonjour le monde.', 'Deuxième ligne.']);
    expect(isAiLyrics(lrc)).toBe(true);
    expect(isAiLyrics('[00:01]A')).toBe(false);
  });

  it('se rabat sur le texte simple sans segments', () => {
    const out = responseToLyrics({ text: '  Seulement du texte ' });
    expect(out).toBe(`${AI_LYRICS_TAG}\nSeulement du texte`);
    expect(parseLyrics(out)).toEqual({ synced: false, lines: [{ timeSec: null, text: 'Seulement du texte' }] });
  });

  it('signale une transcription vide', () => {
    expect(() => responseToLyrics({ text: ' ', segments: [] })).toThrow(TranscriptionError);
    expect(() => responseToLyrics(null)).toThrow('Aucune parole');
  });

  it('traduit les codes HTTP en messages clairs', () => {
    expect(errorForStatus(401).code).toBe('auth');
    expect(errorForStatus(413).code).toBe('too-large');
    expect(errorForStatus(429).code).toBe('quota');
    expect(errorForStatus(500, 'panne').message).toContain('panne');
  });
});

describe('transcribeTrack', () => {
  it('envoie le fichier au format attendu et renvoie un .lrc', async () => {
    const { impl, calls } = fakeFetch(200, verbose);
    const out = await transcribeTrack({ track, provider: 'groq', apiKey: 'gsk_test', language: 'fr', fetchImpl: impl });
    expect(out.split('\n')[1]).toBe('[00:01.23]Bonjour le monde.');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(PROVIDERS.groq.endpoint);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer gsk_test');
    expect(calls[0].init.body).toBeInstanceOf(FormData);
    const parts = Object.fromEntries(buildFields(track, 'groq', 'fr'));
    expect(parts.model).toBe('whisper-large-v3');
    expect(parts.response_format).toBe('verbose_json');
    expect(parts['timestamp_granularities[]']).toBe('segment');
    expect(parts.language).toBe('fr');
    expect(parts.file).toEqual({ uri: track.uri, name: 'Aube.mp3', type: 'audio/mpeg' });
  });

  it("n'envoie pas de langue en détection automatique et utilise le modèle OpenAI", async () => {
    const { impl, calls } = fakeFetch(200, verbose);
    await transcribeTrack({ track, provider: 'openai', apiKey: 'sk', language: 'auto', fetchImpl: impl });
    const parts = Object.fromEntries(buildFields(track, 'openai', 'auto'));
    expect(calls[0].url).toBe(PROVIDERS.openai.endpoint);
    expect(parts.model).toBe('whisper-1');
    expect(parts.language).toBeUndefined();
  });

  it('refuse sans clé ou avec un fichier trop lourd, sans appel réseau', async () => {
    const { impl, calls } = fakeFetch(200, verbose);
    await expect(transcribeTrack({ track, provider: 'groq', apiKey: null, language: 'auto', fetchImpl: impl })).rejects.toMatchObject({ code: 'no-key' });
    await expect(
      transcribeTrack({ track: { ...track, sizeBytes: 40 * 1024 * 1024 }, provider: 'groq', apiKey: 'k', language: 'auto', fetchImpl: impl }),
    ).rejects.toMatchObject({ code: 'too-large' });
    expect(calls).toHaveLength(0);
  });

  it('remonte le message d’erreur du service', async () => {
    const { impl } = fakeFetch(401, { error: { message: 'Invalid API Key' } });
    await expect(transcribeTrack({ track, provider: 'groq', apiKey: 'bad', language: 'auto', fetchImpl: impl })).rejects.toMatchObject({ code: 'auth' });
  });

  it('distingue panne réseau et annulation', async () => {
    const network = (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    await expect(transcribeTrack({ track, provider: 'groq', apiKey: 'k', language: 'auto', fetchImpl: network })).rejects.toMatchObject({ code: 'network' });
    const aborted = (async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }) as unknown as typeof fetch;
    await expect(transcribeTrack({ track, provider: 'groq', apiKey: 'k', language: 'auto', fetchImpl: aborted })).rejects.toMatchObject({ code: 'cancelled' });
  });
});
