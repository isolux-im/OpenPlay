import { OpenPlayMedia, type ExitReason } from '../../modules/openplay-media';

const REASONS: Record<ExitReason['reason'], string> = {
  crash: 'Plantage (Java/Kotlin ou JavaScript)',
  'crash-native': 'Plantage natif',
  anr: "Application bloquée (ANR)",
  'low-memory': 'Arrêt par manque de mémoire',
  'init-failure': "Échec d'initialisation",
};

/**
 * Consigne un incident dans le journal local (sans données personnelles au-delà du nom du morceau
 * éventuellement concerné). Sans module natif (web, tests), l'incident part dans la console.
 */
export function recordDiagnostic(kind: string, details: string) {
  try {
    if (OpenPlayMedia?.recordDiagnostic) OpenPlayMedia.recordDiagnostic(kind, details);
    else console.warn(`[OpenPlay] ${kind}: ${details}`);
  } catch {
    // Le journal ne doit jamais provoquer lui-même d'erreur.
  }
}

type ErrorUtilsLike = {
  getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

let installed = false;

/** Note les erreurs JavaScript fatales avant le traitement normal de React Native (qui ferme l'application). */
export function installJsErrorRecorder() {
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (installed || !errorUtils) return;
  installed = true;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    if (isFatal) recordDiagnostic('Erreur JavaScript fatale', describeError(error));
    previous(error, isFatal);
  });
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}\n${error.stack ?? ''}`.trim();
  return String(error);
}

export type CrashReport = { count: number; text: string };

/** Rapport lisible : fins anormales vues par Android puis journal local. */
export async function loadCrashReport(): Promise<CrashReport | null> {
  if (!OpenPlayMedia?.getCrashReportsAsync) return null;
  const { log, exits } = await OpenPlayMedia.getCrashReportsAsync();
  const entries = log ? log.split('\n=====\n').filter(Boolean) : [];
  const lines: string[] = [];
  if (exits.length) {
    lines.push('— Fins anormales enregistrées par Android —');
    for (const e of exits) {
      lines.push(`${new Date(e.timestamp).toISOString()} · ${REASONS[e.reason]}${e.description ? ` · ${e.description}` : ''}`);
      if (e.trace) lines.push(e.trace.slice(0, 4000));
    }
    lines.push('');
  }
  if (entries.length) {
    lines.push('— Journal OpenPlay —');
    lines.push(entries.join('\n\n'));
  }
  return { count: exits.length + entries.length, text: lines.join('\n') };
}

export async function clearCrashReport() {
  await OpenPlayMedia?.clearCrashReportsAsync?.();
}
