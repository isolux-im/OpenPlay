import { useColorScheme } from 'react-native';

const light = {
  background: '#FFFFFF',
  surface: '#F2F4F7',
  text: '#111827',
  muted: '#6B7280',
  accent: '#2563EB',
  onAccent: '#FFFFFF',
  border: '#E5E7EB',
};

export type Palette = typeof light;

const dark: Palette = {
  background: '#0B0F14',
  surface: '#161B22',
  text: '#F3F4F6',
  muted: '#9CA3AF',
  accent: '#60A5FA',
  onAccent: '#0B0F14',
  border: '#1F2937',
};

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}
