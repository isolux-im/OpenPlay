import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { useSettings, type AccentKey } from '../store/settings';

export const ACCENTS: Record<AccentKey, { label: string; light: string; dark: string }> = {
  coral: { label: 'Corail', light: '#F2385A', dark: '#FF4F6D' },
  violet: { label: 'Violet', light: '#7A4DFF', dark: '#9B7BFF' },
  ocean: { label: 'Océan', light: '#0A84FF', dark: '#3D9BFF' },
  emerald: { label: 'Émeraude', light: '#0FA968', dark: '#2BD38A' },
  amber: { label: 'Ambre', light: '#E58A00', dark: '#FFB020' },
};

const light = {
  background: '#FFFFFF',
  groupedBackground: '#F2F2F7',
  card: '#FFFFFF',
  elevated: '#F4F4F6',
  text: '#0B0B0D',
  secondaryText: 'rgba(60,60,67,0.62)',
  tertiaryText: 'rgba(60,60,67,0.36)',
  separator: 'rgba(60,60,67,0.16)',
  fill: 'rgba(118,118,128,0.12)',
  chrome: 'rgba(249,249,251,0.92)',
  shadow: '#000000',
  danger: '#FF3B30',
};

export type Colors = typeof light & { accent: string; accentSoft: string };

const dark: typeof light = {
  background: '#000000',
  groupedBackground: '#000000',
  card: '#1C1C1E',
  elevated: '#1C1C1E',
  text: '#FFFFFF',
  secondaryText: 'rgba(235,235,245,0.62)',
  tertiaryText: 'rgba(235,235,245,0.32)',
  separator: 'rgba(84,84,88,0.55)',
  fill: 'rgba(118,118,128,0.26)',
  chrome: 'rgba(24,24,26,0.92)',
  shadow: '#000000',
  danger: '#FF453A',
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
  return { dark: isDark, colors: { ...base, accent: accentColor, accentSoft: withAlpha(accentColor, isDark ? 0.2 : 0.12) } };
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
export const radius = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 };
/** Marge horizontale des écrans (identique partout pour l'alignement). */
export const GUTTER = 20;
/** Hauteur réservée en bas des listes pour la barre d'onglets et le mini-lecteur. */
export const BOTTOM_INSET = 160;
