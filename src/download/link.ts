/**
 * Télécharger par lien : validation et classement d'une URL, avant toute requête réseau.
 *
 * Quatre vérifications distinctes (cahier des charges § 3) : reconnaissance de la source (ici), droit d'accès,
 * disponibilité d'un fichier téléchargeable et possibilité de conversion (après l'analyse réseau, `options.ts`).
 * Un lien de plateforme reconnu (YouTube, TikTok, Instagram, Facebook) n'autorise jamais à lui seul un
 * téléchargement ni une extraction audio.
 */

export type Platform = 'youtube' | 'tiktok' | 'instagram' | 'facebook';

export type LinkCheck =
  | { ok: true; url: string; host: string; platform: Platform | null; extension: string | null }
  | { ok: false; reason: LinkRefusal; message: string };

export type LinkRefusal = 'empty' | 'invalid' | 'scheme' | 'credentials' | 'port' | 'private-host' | 'too-long';

export const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
};

const PLATFORM_HOSTS: [Platform, string[]][] = [
  ['youtube', ['youtube.com', 'youtu.be', 'youtube-nocookie.com']],
  ['tiktok', ['tiktok.com']],
  ['instagram', ['instagram.com', 'instagr.am']],
  ['facebook', ['facebook.com', 'fb.watch', 'fb.com']],
];

const MAX_URL_LENGTH = 4096;

/** Extrait le premier lien http(s) d'un texte partagé (« Regarde ça https://… »). */
export function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"'«»]+/i);
  return match ? match[0].replace(/[),.;!?]+$/, '') : null;
}

function platformOf(host: string): Platform | null {
  for (const [platform, domains] of PLATFORM_HOSTS) {
    if (domains.some((d) => host === d || host.endsWith(`.${d}`))) return platform;
  }
  return null;
}

/** Adresse IPv4 littérale réservée (boucle locale, réseau privé, lien local, métadonnées cloud…). */
function privateIPv4(host: string): boolean | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([m[1], m[2], m[3], m[4]].some((x) => Number(x) > 255)) return true;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // partage d'adresses opérateur
    (a === 169 && b === 254) || // lien local, métadonnées cloud
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/**
 * Hôte interne refusé (protection SSRF) : noms locaux, adresses IP privées ou réservées, IPv6 locale.
 * Les noms de domaine publics sont vérifiés à nouveau sur l'appareil, après résolution DNS et à chaque redirection.
 */
export function isPrivateHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa') || host.endsWith('.lan')) return true;
  if (host === 'metadata.google.internal') return true;
  const v4 = privateIPv4(host);
  if (v4 !== null) return v4;
  // Formes numériques déguisées (« 2130706433 », « 0x7f.1 ») : refusées plutôt qu'interprétées.
  if (/^(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+))*$/i.test(host)) return true;
  if (host.includes(':')) {
    if (host === '::' || host === '::1') return true;
    if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host) || /^ff/.test(host)) return true;
    const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return privateIPv4(mapped[1]) ?? true;
  }
  return false;
}

/** Valide et normalise une URL saisie, collée ou partagée. Seul https est accepté (pas de transfert en clair). */
export function checkLink(input: string): LinkCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: 'empty', message: 'Collez ou saisissez un lien.' };
  if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: 'too-long', message: 'Lien trop long.' };
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, reason: 'invalid', message: 'Ce texte n’est pas un lien valide.' };
  }
  if (url.protocol === 'http:') return { ok: false, reason: 'scheme', message: 'Lien non sécurisé (http) : seuls les liens https sont acceptés.' };
  if (url.protocol !== 'https:') return { ok: false, reason: 'scheme', message: 'Seuls les liens https sont acceptés.' };
  if (url.username || url.password) return { ok: false, reason: 'credentials', message: 'Lien refusé : il contient un identifiant ou un mot de passe.' };
  if (url.port && url.port !== '443') return { ok: false, reason: 'port', message: 'Lien refusé : port réseau non standard.' };
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || isPrivateHost(host)) return { ok: false, reason: 'private-host', message: 'Lien refusé : adresse locale ou interne.' };
  url.hash = '';
  const last = decodeURIComponent(url.pathname.split('/').pop() ?? '');
  const ext = last.includes('.') ? last.split('.').pop()!.toLowerCase() : null;
  return { ok: true, url: url.toString(), host, platform: platformOf(host), extension: ext && /^[a-z0-9]{2,5}$/.test(ext) ? ext : null };
}

const SECRET_PARAMS = /^(token|access_token|auth|key|api_key|apikey|sig|signature|secret|password|pass|session|sid|x-amz-.*|x-goog-.*|expires|policy|key-pair-id|hmac|hdnts|jwt)$/i;

/** URL affichable et journalisable : valeurs des paramètres sensibles masquées. */
export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) if (SECRET_PARAMS.test(key)) url.searchParams.set(key, '…');
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return value.slice(0, 80);
  }
}

/** Nom de fichier sûr (caractères interdits retirés, longueur bornée), sans extension. */
export function safeBaseName(name: string, fallback: string): string {
  const cleaned = name
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
    .trim();
  return cleaned || fallback;
}
