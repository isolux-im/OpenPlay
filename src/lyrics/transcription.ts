import type { Track } from '../types';

export type ProviderId = 'groq' | 'openai';

export type Provider = {
  label: string;
  endpoint: string;
  model: string;
  /** Taille maximale acceptée par le fournisseur (offre de base). */
  maxBytes: number;
  keyUrl: string;
};

const MB = 1024 * 1024;

/** Deux fournisseurs au format d'API identique (point d'entrée « audio/transcriptions »). */
export const PROVIDERS: Record<ProviderId, Provider> = {
  groq: {
    label: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
    model: 'whisper-large-v3',
    maxBytes: 25 * MB,
    keyUrl: 'https://console.groq.com/keys',
  },
  openai: {
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/audio/transcriptions',
    model: 'whisper-1',
    maxBytes: 25 * MB,
    keyUrl: 'https://platform.openai.com/api-keys',
  },
};

/** Langues proposées (codes ISO 639-1). « auto » laisse le modèle détecter la langue. */
export const LANGUAGES = [
  { code: 'auto', label: 'Auto' },
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'Anglais' },
  { code: 'es', label: 'Espagnol' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

/** Étiquette LRC standard [re:] (logiciel auteur) : marque les paroles produites par l'IA. */
export const AI_LYRICS_TAG = '[re:OpenPlay IA]';

export type TranscriptionErrorCode = 'no-key' | 'too-large' | 'auth' | 'quota' | 'network' | 'server' | 'empty' | 'cancelled';

export class TranscriptionError extends Error {
  constructor(
    public code: TranscriptionErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type Segment = { start: number; end?: number; text: string };

export function formatLrcTime(sec: number): string {
  const total = Math.max(0, Math.round(sec * 100));
  const m = Math.floor(total / 6000);
  const s = Math.floor((total % 6000) / 100);
  const cs = total % 100;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function segmentsToLrc(segments: Segment[]): string {
  const lines = segments
    .map((s) => ({ start: s.start, text: s.text.replace(/\s+/g, ' ').trim() }))
    .filter((s) => s.text && Number.isFinite(s.start))
    .map((s) => `[${formatLrcTime(s.start)}]${s.text}`);
  return [AI_LYRICS_TAG, ...lines].join('\n');
}

/** Réponse « verbose_json » : segments horodatés → .lrc synchronisé ; sinon texte simple. */
export function responseToLyrics(json: unknown): string {
  const data = (json ?? {}) as { segments?: unknown; text?: unknown };
  if (Array.isArray(data.segments)) {
    const segments = data.segments.filter(
      (s): s is Segment => !!s && typeof (s as Segment).start === 'number' && typeof (s as Segment).text === 'string',
    );
    if (segments.some((s) => s.text.trim())) return segmentsToLrc(segments);
  }
  if (typeof data.text === 'string' && data.text.trim()) return `${AI_LYRICS_TAG}\n${data.text.trim()}`;
  throw new TranscriptionError('empty', 'Aucune parole détectée dans ce morceau.');
}

export function errorForStatus(status: number, detail?: string): TranscriptionError {
  if (status === 401 || status === 403) return new TranscriptionError('auth', 'Clé API refusée. Vérifiez-la dans Paramètres › Paroles par IA.');
  if (status === 413) return new TranscriptionError('too-large', 'Fichier trop volumineux pour le service de transcription.');
  if (status === 429) return new TranscriptionError('quota', 'Quota ou limite de requêtes atteint. Réessayez plus tard.');
  return new TranscriptionError('server', `Erreur du service de transcription (${status})${detail ? ` : ${detail}` : ''}.`);
}

export function isAiLyrics(text: string | undefined): boolean {
  return !!text && text.startsWith(AI_LYRICS_TAG);
}

export type FormFile = { uri: string; name: string; type: string };
export type FormField = [name: string, value: string | FormFile];

/** Champs de la requête « audio/transcriptions » (format commun à Groq et OpenAI). */
export function buildFields(track: TranscribeOptions['track'], provider: ProviderId, language: LanguageCode): FormField[] {
  const name = track.path?.split('/').pop() || `${track.title}.mp3`;
  const fields: FormField[] = [
    ['file', { uri: track.uri, name, type: track.mimeType || 'audio/mpeg' }],
    ['model', PROVIDERS[provider].model],
    ['response_format', 'verbose_json'],
    ['timestamp_granularities[]', 'segment'],
    ['temperature', '0'],
  ];
  if (language !== 'auto') fields.push(['language', language]);
  return fields;
}

function toFormData(fields: FormField[]): FormData {
  const form = new FormData();
  // React Native accepte un objet { uri, name, type } comme fichier ; les types DOM ne le décrivent pas.
  for (const [name, value] of fields) form.append(name, typeof value === 'string' ? value : (value as unknown as Blob));
  return form;
}

export type TranscribeOptions = {
  track: Pick<Track, 'uri' | 'title' | 'path' | 'sizeBytes' | 'mimeType'>;
  provider: ProviderId;
  apiKey: string | null;
  language: LanguageCode;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

export async function transcribeTrack({ track, provider, apiKey, language, signal, fetchImpl = fetch }: TranscribeOptions): Promise<string> {
  const p = PROVIDERS[provider];
  if (!apiKey) throw new TranscriptionError('no-key', 'Ajoutez votre clé API dans Paramètres › Paroles par IA.');
  if (track.sizeBytes > p.maxBytes) {
    throw new TranscriptionError('too-large', `Fichier de ${Math.round(track.sizeBytes / MB)} Mo : la limite du service est de ${Math.round(p.maxBytes / MB)} Mo.`);
  }

  const form = toFormData(buildFields(track, provider, language));

  let res: Response;
  try {
    res = await fetchImpl(p.endpoint, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw new TranscriptionError('cancelled', 'Transcription annulée.');
    throw new TranscriptionError('network', 'Connexion impossible. Vérifiez votre accès à Internet.');
  }
  if (!res.ok) {
    let detail: string | undefined;
    try {
      detail = ((await res.json()) as { error?: { message?: string } })?.error?.message;
    } catch {
      detail = undefined;
    }
    throw errorForStatus(res.status, detail);
  }
  return responseToLyrics(await res.json());
}
