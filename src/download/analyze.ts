import { downloadBackend, errorMessage, httpMessage, LinkError, type DownloadBackend } from './backend';
import { checkLink, PLATFORM_LABEL, safeBaseName, type Platform } from './link';
import { formatName, hasAnyOption, type Probe, type TargetFormat } from './options';

export type Analysis =
  | { kind: 'invalid'; message: string }
  | { kind: 'platform'; platform: Platform; url: string }
  | { kind: 'error'; code: string; message: string }
  | { kind: 'http'; status: number; message: string }
  /** Page web ou contenu sans fichier multimédia direct reconnu. */
  | { kind: 'page'; host: string; message: string }
  | { kind: 'direct'; host: string; probe: Probe; title: string };

/** Où vont les fichiers téléchargés : les dossiers que lisent déjà Audios et Vidéos. */
export const DESTINATION: Record<TargetFormat, { relativePath: string; mimeType: string; ext: string; library: string }> = {
  mp3: { relativePath: 'Music/OpenPlay', mimeType: 'audio/mpeg', ext: 'mp3', library: 'Audios' },
  mp4: { relativePath: 'Movies/OpenPlay', mimeType: 'video/mp4', ext: 'mp4', library: 'Vidéos' },
};

/**
 * Analyse d'un lien : validation locale, puis (fichier direct seulement) lecture de quelques octets sur l'appareil.
 * Un lien YouTube, TikTok, Instagram ou Facebook est reconnu sans aucune requête : pas de récupération non autorisée.
 */
export async function analyzeLink(input: string, backend: DownloadBackend = downloadBackend()): Promise<Analysis> {
  const check = checkLink(input);
  if (!check.ok) return { kind: 'invalid', message: check.message };
  if (check.platform) return { kind: 'platform', platform: check.platform, url: check.url };
  let probe: Probe;
  try {
    probe = await backend.probe(check.url);
  } catch (e) {
    const code = e instanceof LinkError ? e.code : 'ERR_LINK_NETWORK';
    return { kind: 'error', code, message: errorMessage(code) };
  }
  if (probe.status < 200 || probe.status >= 300) return { kind: 'http', status: probe.status, message: httpMessage(probe.status) };
  const host = (() => {
    try {
      return new URL(probe.finalUrl).hostname;
    } catch {
      return check.host;
    }
  })();
  if (probe.sniff === 'html') return { kind: 'page', host, message: 'Ce lien ouvre une page web ; aucun fichier audio ou vidéo direct autorisé n’a été identifié.' };
  if (probe.sniff === 'unknown') return { kind: 'page', host, message: 'Le contenu de ce lien n’est pas un fichier audio ou vidéo reconnu.' };
  if (!hasAnyOption(probe)) {
    return { kind: 'page', host, message: `Fichier ${formatName(probe.sniff)} : ni MP3 ni MP4 réalisable sur cet appareil (aucune conversion locale intégrée).` };
  }
  const title = safeBaseName(probe.title ?? probe.fileName ?? '', host);
  return { kind: 'direct', host, probe, title };
}

/** Nom du fichier enregistré (extension du format réel). */
export function fileNameFor(title: string, format: TargetFormat): string {
  return `${safeBaseName(title, 'Téléchargement')}.${DESTINATION[format].ext}`;
}

/** Nom libre (« Titre (2).mp4 », « Titre (3).mp4 »…) quand le nom est déjà pris dans le dossier. */
export async function freeFileName(title: string, format: TargetFormat, backend: DownloadBackend = downloadBackend()): Promise<string> {
  const { relativePath } = DESTINATION[format];
  const kind = format === 'mp4' ? 'video' : 'audio';
  const base = safeBaseName(title, 'Téléchargement');
  for (let i = 2; i < 100; i++) {
    const name = `${base} (${i}).${DESTINATION[format].ext}`;
    if (!(await backend.exists(kind, relativePath, name))) return name;
  }
  return `${base} (${Date.now()}).${DESTINATION[format].ext}`;
}

export function platformLabel(p: Platform): string {
  return PLATFORM_LABEL[p];
}

/** Conseils officiels par plateforme : jamais de faux bouton de téléchargement. */
export const PLATFORM_ADVICE: Record<Platform, string> = {
  youtube:
    'Les règles de YouTube interdisent le téléchargement, l’enregistrement hors ligne et l’extraction audio sans autorisation écrite. OpenPlay ne récupère donc rien depuis YouTube et ne propose aucune conversion YouTube → MP3. Pour vos propres vidéos, utilisez l’export officiel de YouTube Studio (ou Google Takeout), puis ajoutez le fichier à votre téléphone.',
  tiktok:
    'TikTok permet d’enregistrer une vidéo seulement si son créateur l’autorise (« Enregistrer la vidéo » dans le menu Partager de l’application TikTok). Une fois la vidéo enregistrée sur le téléphone, elle apparaît automatiquement dans Vidéos.',
  instagram:
    'Instagram ne propose pas de téléchargement direct des publications des autres comptes. Pour vos propres contenus, utilisez « Télécharger vos informations » dans les paramètres Instagram, puis ajoutez les fichiers à votre téléphone.',
  facebook:
    'Facebook ne propose pas de téléchargement direct des vidéos des autres comptes. Pour vos propres contenus, utilisez « Télécharger vos informations » dans les paramètres Facebook, puis ajoutez les fichiers à votre téléphone.',
};
