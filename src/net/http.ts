import { OpenPlayMedia } from '../../modules/openplay-media';

/** Situations réseau distinguées (cahier des charges, § 2.2). */
export type NetErrorKind =
  | 'offline'
  | 'no-internet'
  | 'dns'
  | 'tls'
  | 'timeout'
  | 'unreachable'
  | 'upload'
  | 'bad-request'
  | 'auth'
  | 'not-found'
  | 'too-large'
  | 'rate-limit'
  | 'server'
  | 'bad-response'
  | 'cancelled';

export class NetError extends Error {
  constructor(
    public kind: NetErrorKind,
    message: string,
    public status: number | null = null,
    /** Délai demandé par le service (en-tête Retry-After), en secondes. */
    public retryAfterSec: number | null = null,
    /** Détail technique pour le journal de diagnostic (jamais de clé API). */
    public detail: string | null = null,
  ) {
    super(message);
  }

  /** Une nouvelle tentative a un sens (contrairement à une clé refusée ou une requête invalide). */
  get retryable(): boolean {
    return !['auth', 'bad-request', 'not-found', 'too-large', 'cancelled'].includes(this.kind);
  }
}

export function messageFor(kind: NetErrorKind, service: string, status: number | null = null, retryAfterSec: number | null = null): string {
  switch (kind) {
    case 'offline':
      return "Pas de connexion. Activez le Wi-Fi ou les données mobiles.";
    case 'no-internet':
      return "Le téléphone est connecté à un réseau, mais Android n'y détecte pas d'accès à Internet (forfait épuisé, portail Wi-Fi, données désactivées pour l'appli ?).";
    case 'dns':
      return `L'adresse de ${service} n'a pas pu être résolue (DNS). Essayez un autre réseau ou désactivez le « DNS privé » d'Android.`;
    case 'tls':
      return `Connexion sécurisée à ${service} refusée (TLS). Vérifiez la date et l'heure du téléphone ou un filtrage du réseau.`;
    case 'timeout':
      return `${service} ne répond pas à temps. Réessayez, de préférence avec une meilleure connexion.`;
    case 'unreachable':
      return `${service} est injoignable depuis ce réseau pour le moment.`;
    case 'upload':
      return `${service} est joignable, mais l'envoi a été interrompu (connexion instable ou fichier illisible).`;
    case 'bad-request':
      return `${service} a refusé la requête${status ? ` (${status})` : ''}.`;
    case 'auth':
      return `${service} a refusé l'accès (clé absente, invalide ou sans droits).`;
    case 'not-found':
      return `Ressource introuvable sur ${service} (404).`;
    case 'too-large':
      return `Fichier trop volumineux pour ${service}.`;
    case 'rate-limit':
      return `Trop de requêtes vers ${service}.${retryAfterSec ? ` Réessayez dans ${formatWait(retryAfterSec)}.` : ' Réessayez plus tard.'}`;
    case 'server':
      return `${service} rencontre un problème${status ? ` (erreur ${status})` : ''}. Réessayez plus tard.`;
    case 'bad-response':
      return `Réponse inattendue de ${service}.`;
    case 'cancelled':
      return 'Opération annulée.';
  }
}

function formatWait(sec: number): string {
  return sec < 90 ? `${Math.ceil(sec)} s` : `${Math.ceil(sec / 60)} min`;
}

export function kindForStatus(status: number): NetErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not-found';
  if (status === 413) return 'too-large';
  if (status === 429) return 'rate-limit';
  if (status >= 500) return 'server';
  return 'bad-request';
}

/** En-tête Retry-After : nombre de secondes ou date HTTP. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const sec = Number(value);
  if (Number.isFinite(sec)) return Math.max(0, sec);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, (at - now) / 1000) : null;
}

export type Diagnosis = { kind: NetErrorKind; detail: string };

/**
 * Après un échec de connexion (fetch ne dit que « Network request failed »), interroge Android :
 * réseau actif et validé ? Le service répond-il à une requête de test (DNS, TLS, délai) ?
 */
export async function diagnose(url: string, sentBody: boolean): Promise<Diagnosis> {
  if (!OpenPlayMedia?.diagnoseNetworkAsync) {
    const online = (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine;
    return { kind: online === false ? 'offline' : 'unreachable', detail: 'diagnostic natif indisponible' };
  }
  let origin = url;
  try {
    origin = `${new URL(url).origin}/`;
  } catch {
    // URL déjà validée par fetch : on garde l'adresse telle quelle.
  }
  try {
    const { network, probe } = await OpenPlayMedia.diagnoseNetworkAsync(origin, 8000);
    const detail = `réseau=${network.transport} connecté=${network.connected} validé=${network.validated} · test=${probe.ok ? `HTTP ${probe.status}` : `${probe.error} (${probe.message})`} en ${Math.round(probe.ms)} ms`;
    if (probe.ok) return { kind: sentBody ? 'upload' : 'unreachable', detail };
    if (network.connected === false || network.transport === 'none') return { kind: 'offline', detail };
    if (network.validated === false) return { kind: 'no-internet', detail };
    switch (probe.error) {
      case 'dns':
        return { kind: 'dns', detail };
      case 'tls':
        return { kind: 'tls', detail };
      case 'timeout':
        return { kind: 'timeout', detail };
      default:
        return { kind: 'unreachable', detail };
    }
  } catch (e) {
    return { kind: 'unreachable', detail: `diagnostic en échec : ${String(e)}` };
  }
}

export type RequestOptions = RequestInit & {
  /** Nom affiché dans les messages (« LRCLIB », « Groq »…). */
  service: string;
  /** Délai maximal de la requête complète, en millisecondes. */
  timeoutMs: number;
  /** Statuts traités par l'appelant au lieu d'une erreur (ex. 404 = « aucune parole » pour LRCLIB). */
  acceptStatuses?: number[];
  fetchImpl?: typeof fetch;
  diagnoseImpl?: typeof diagnose;
};

/** fetch avec délai borné, annulation propagée et erreurs classées. Ne relance jamais seul. */
export async function request(url: string, { service, timeoutMs, acceptStatuses = [], fetchImpl = fetch, diagnoseImpl = diagnose, signal, ...init }: RequestOptions): Promise<Response> {
  if (signal?.aborted) throw new NetError('cancelled', messageFor('cancelled', service));
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (signal?.aborted) throw new NetError('cancelled', messageFor('cancelled', service));
    if (timedOut) throw new NetError('timeout', messageFor('timeout', service), null, null, `délai de ${timeoutMs} ms dépassé`);
    const { kind, detail } = await diagnoseImpl(url, init.body != null);
    throw new NetError(kind, messageFor(kind, service), null, null, `${String((e as Error)?.message ?? e)} · ${detail}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  if (res.ok || acceptStatuses.includes(res.status)) return res;
  const kind = kindForStatus(res.status);
  const retryAfter = kind === 'rate-limit' ? parseRetryAfter(res.headers?.get?.('Retry-After') ?? null) : null;
  let detail: string | null = null;
  try {
    const body = (await res.json()) as { error?: { message?: string } | string; message?: string };
    detail = (typeof body?.error === 'string' ? body.error : body?.error?.message) ?? body?.message ?? null;
  } catch {
    detail = null;
  }
  throw new NetError(kind, messageFor(kind, service, res.status, retryAfter), res.status, retryAfter, detail);
}

/** Vérifie le type de contenu avant de lire du JSON (une page d'erreur HTML ne doit pas être analysée). */
export async function readJson<T>(res: Response, service: string): Promise<T> {
  const type = res.headers?.get?.('Content-Type') ?? '';
  if (type && !type.includes('json')) throw new NetError('bad-response', messageFor('bad-response', service), res.status, null, `Content-Type: ${type}`);
  try {
    return (await res.json()) as T;
  } catch (e) {
    throw new NetError('bad-response', messageFor('bad-response', service), res.status, null, String(e));
  }
}
