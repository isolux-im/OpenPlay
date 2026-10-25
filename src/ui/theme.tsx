import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { useSettings, type AccentKey } from '../store/settings';

/** Graphite (neutre) par défaut ; les autres teintes restent proposées dans les réglages. */
export const ACCENTS: Record<AccentKey, { label: string; light: string; dark: string }> = {
  graphite: { label: 'Graphite', light: '#1C1C1E', dark: '#F2F2F7' },
  coral: { label: 'Corail', light: '#F2385A', dark: '#FF4F6D' },
  violet: { label: 'Violet', light: '#7A4DFF', dark: '#9B7BFF' },
  ocean: { label: 'Océan', light: '#0A84FF', dark: '#3D9BFF' },
  emerald: { label: 'Émeraude', light: '#0FA968', dark: '#2BD38A' },
  amber: { label: 'Ambre', light: '#E58A00', dark: '#FFB020' },
};

// Palette provisoire neutre (gris, blanc, noir) : une seule source pour les deux modes.
const light = {
  background: '#F7F7F8',
  groupedBackground: '#F2F2F4',
  card: '#FFFFFF',
  elevated: '#EEEEF0',
  text: '#111113',
  secondaryText: 'rgba(60,60,67,0.62)',
  tertiaryText: 'rgba(60,60,67,0.34)',
  separator: 'rgba(60,60,67,0.12)',
  fill: 'rgba(118,118,128,0.10)',
  chrome: 'rgba(247,247,248,0.86)',
  /** Menus contextuels vitrés : voile gris posé sur le flou. */
  glass: 'rgba(236,236,238,0.72)',
  glassBorder: 'rgba(255,255,255,0.65)',
  glassSeparator: 'rgba(60,60,67,0.14)',
  shadow: '#000000',
  danger: '#E5484D',
};

export type Colors = typeof light & { accent: string; accentSoft: string; onAccent: string };

const dark: typeof light = {
  background: '#0B0B0C',
  groupedBackground: '#0B0B0C',
  card: '#18181A',
  elevated: '#222225',
  text: '#F5F5F7',
  secondaryText: 'rgba(235,235,245,0.60)',
  tertiaryText: 'rgba(235,235,245,0.30)',
  separator: 'rgba(84,84,88,0.45)',
  fill: 'rgba(118,118,128,0.22)',
  chrome: 'rgba(16,16,18,0.86)',
  glass: 'rgba(52,52,56,0.70)',
  glassBorder: 'rgba(255,255,255,0.14)',
  glassSeparator: 'rgba(235,235,245,0.12)',
  shadow: '#000000',
  danger: '#FF6369',
};

export type Theme = { dark: boolean; colors: Colors };

const ThemeContext = createContext<Theme | null>(null);

function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

export function buildTheme(isDark: boolean, accent: AccentKey): Theme {
  const base = isDark ? dark : light;
  const accentColor = ACCENTS[accent][isDark ? 'dark' : 'light'];
  // Texte posé sur la couleur d'accent (boutons pleins) : noir sur le graphite clair du mode sombre.
  const onAccent = accent === 'graphite' && isDark ? '#111113' : '#FFFFFF';
  return { dark: isDark, colors: { ...base, accent: accentColor, accentSoft: withAlpha(accentColor, isDark ? 0.2 : 0.1), onAccent } };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const mode = useSettings((s) => s.theme);
  const accent = useSettings((s) => s.accent);
  const isDark = mode === 'system' ? scheme === 'dark' : mode === 'dark';
  const theme = useMemo(() => buildTheme(isDark, accent), [isDark, accent]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error('useTheme doit être utilisé sous <ThemeProvider>.');
  return t;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
/** Marge horizontale des écrans (identique partout pour l'alignement). */
export const GUTTER = 20;
/** Hauteur réservée en bas des listes pour la barre d'onglets et le mini-lecteur. */
export const BOTTOM_INSET = 160;
