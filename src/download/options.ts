/**
 * Formats et qualités réalisables (cahier des charges § 4, 5, 6) : seules les options vraiment disponibles
 * sont actives ; les autres restent visibles, désactivées, avec leur raison. Aucune qualité n'est simulée.
 *
 * État actuel d'OpenPlay : copie directe du fichier source seulement. Aucun encodeur MP3 ni moteur de
 * conversion vidéo n'est intégré (audit : Android ne fournit pas d'encodeur MP3 ; Media3 Transformer ne
 * produit pas de MP3 et n'est pas embarqué) — les débits et résolutions de conversion sont donc désactivés.
 */

export type TargetFormat = 'mp3' | 'mp4';
export type Method = 'DIRECT' | 'LOCAL_CONVERSION';

/** Type réel reconnu à partir des premiers octets du fichier (pas de l'extension ni de l'en-tête annoncé). */
export type Sniffed = 'mp3' | 'mp4' | 'm4a' | 'mov' | 'webm' | 'ogg' | 'flac' | 'wav' | 'aac' | 'html' | 'unknown';

/** Résultat de l'analyse réseau sur l'appareil (requête de quelques octets, redirections vérifiées). */
export type Probe = {
  finalUrl: string;
  status: number;
  contentType: string | null;
  /** Octets, -1 si le serveur ne communique pas de longueur exploitable. */
  size: number;
  fileName: string | null;
  sniff: Sniffed;
  redirects: number;
  /** Le serveur accepte les requêtes partielles : pause et reprise possibles. */
  resumable?: boolean;
  /** Lues dans le fichier distant quand c'est possible (sinon null). */
  durationMs: number | null;
  width: number | null;
  height: number | null;
  title: string | null;
  artist: string | null;
};

export type QualityOption = {
  key: string;
  label: string;
  /** Positionnement (« Standard », « HD »…) ou précision sur la source. */
  detail: string;
  enabled: boolean;
  method: Method | null;
  /** Raison affichée quand l'option est désactivée. */
  reason?: string;
  estimatedBytes?: number;
};

export const MP3_BITRATES: [number, string][] = [
  [64, 'Très léger'],
  [96, 'Économique'],
  [128, 'Standard'],
  [192, 'Bon compromis'],
  [256, 'Élevé'],
  [320, 'Débit maximal proposé'],
];

export const MP4_RESOLUTIONS: [number, string][] = [
  [240, 'Très basse définition'],
  [360, 'Économie de données'],
  [480, 'Définition standard'],
  [720, 'HD'],
  [1080, 'Full HD'],
  [1440, 'QHD'],
  [2160, '4K UHD'],
];

const FORMAT_NAME: Record<Sniffed, string> = {
  mp3: 'MP3',
  mp4: 'MP4',
  m4a: 'M4A (AAC)',
  mov: 'MOV',
  webm: 'WebM / MKV',
  ogg: 'Ogg',
  flac: 'FLAC',
  wav: 'WAV',
  aac: 'AAC',
  html: 'page web',
  unknown: 'format inconnu',
};

export function formatName(s: Sniffed): string {
  return FORMAT_NAME[s];
}

/** Hauteur affichée (« 1080p ») d'une vidéo, en tenant compte de l'orientation (portrait : le petit côté). */
export function videoClass(width: number | null, height: number | null): number | null {
  if (!width || !height) return null;
  return Math.min(width, height);
}

/** Débit moyen estimé en kb/s (taille et durée connues), sinon null. */
export function averageKbps(size: number, durationMs: number | null): number | null {
  if (size <= 0 || !durationMs || durationMs < 1000) return null;
  return Math.round((size * 8) / (durationMs / 1000) / 1000);
}

const NO_MP3_ENCODER = 'aucun encodeur MP3 n’est intégré à OpenPlay';
const NO_VIDEO_CONVERSION = 'la conversion vidéo locale n’est pas intégrée à OpenPlay';

export function resolveOptions(probe: Probe, format: TargetFormat): QualityOption[] {
  const size = probe.size > 0 ? probe.size : undefined;
  if (format === 'mp3') {
    if (probe.sniff === 'mp3') {
      const kbps = averageKbps(probe.size, probe.durationMs);
      return [
        {
          key: 'original',
          label: 'Originale',
          detail: kbps ? `Fichier MP3 source, environ ${kbps} kb/s, sans réencodage` : 'Fichier MP3 source, sans réencodage',
          enabled: true,
          method: 'DIRECT',
          estimatedBytes: size,
        },
        ...MP3_BITRATES.map(([rate, detail]) => ({
          key: `mp3-${rate}`,
          label: `${rate} kb/s`,
          detail,
          enabled: false,
          method: null,
          reason: `MP3 ${rate} kb/s indisponible : ${NO_MP3_ENCODER} (le fichier source est conservé tel quel avec « Originale »).`,
        })),
      ];
    }
    const why =
      probe.sniff === 'mp4' || probe.sniff === 'mov' || probe.sniff === 'webm'
        ? `extraction audio vers MP3 indisponible : ${NO_MP3_ENCODER}.`
        : `le fichier est en ${formatName(probe.sniff)}, pas en MP3 ; ${NO_MP3_ENCODER}.`;
    return [
      { key: 'original', label: 'Originale', detail: 'Fichier MP3 source', enabled: false, method: null, reason: `MP3 indisponible : ${why}` },
      ...MP3_BITRATES.map(([rate, detail]) => ({ key: `mp3-${rate}`, label: `${rate} kb/s`, detail, enabled: false, method: null, reason: `MP3 ${rate} kb/s indisponible : ${why}` })),
    ];
  }

  // MP4
  if (probe.sniff !== 'mp4') {
    const why =
      probe.sniff === 'm4a' || probe.sniff === 'mp3' || probe.sniff === 'aac' || probe.sniff === 'ogg' || probe.sniff === 'flac' || probe.sniff === 'wav'
        ? 'le fichier ne contient que du son, pas de vidéo.'
        : `le fichier est en ${formatName(probe.sniff)}, pas en MP4 ; ${NO_VIDEO_CONVERSION}.`;
    return [
      { key: 'original', label: 'Originale', detail: 'Qualité source', enabled: false, method: null, reason: `MP4 indisponible : ${why}` },
      ...MP4_RESOLUTIONS.map(([h, detail]) => ({ key: `mp4-${h}`, label: `${h}p`, detail, enabled: false, method: null, reason: `${h}p indisponible : ${why}` })),
    ];
  }
  const source = videoClass(probe.width, probe.height);
  return [
    {
      key: 'original',
      label: 'Originale',
      detail: source ? `Qualité source (${source}p), copie directe sans réencodage` : 'Qualité source, copie directe sans réencodage',
      enabled: true,
      method: 'DIRECT',
      estimatedBytes: size,
    },
    ...MP4_RESOLUTIONS.map(([h, detail]): QualityOption => {
      if (source && h === source) return { key: `mp4-${h}`, label: `${h}p`, detail: `${detail} · définition de la source`, enabled: true, method: 'DIRECT', estimatedBytes: size };
      if (source && h > source) return { key: `mp4-${h}`, label: `${h}p`, detail, enabled: false, method: null, reason: `${h}p indisponible : la source accessible est en ${source}p ; agrandir l’image n’ajouterait aucun détail.` };
      if (!source) return { key: `mp4-${h}`, label: `${h}p`, detail, enabled: false, method: null, reason: `${h}p indisponible : définition de la source inconnue et ${NO_VIDEO_CONVERSION}.` };
      return { key: `mp4-${h}`, label: `${h}p`, detail, enabled: false, method: null, reason: `${h}p indisponible : ${NO_VIDEO_CONVERSION} (réduction depuis ${source}p).` };
    }),
  ];
}

/** Format proposé d'emblée : celui du fichier quand il est directement disponible. */
export function preferredFormat(probe: Probe): TargetFormat {
  return probe.sniff === 'mp3' ? 'mp3' : 'mp4';
}

export function hasAnyOption(probe: Probe): boolean {
  return resolveOptions(probe, 'mp3').some((o) => o.enabled) || resolveOptions(probe, 'mp4').some((o) => o.enabled);
}
