import { createNavigationContainerRef, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { AnyStackParams, SharedStackParams, TabParams } from './types';

export const navigationRef = createNavigationContainerRef<TabParams>();

export type AppNavigation = NativeStackNavigationProp<AnyStackParams>;

export function useAppNavigation(): AppNavigation {
  return useNavigation<AppNavigation>();
}

/** Ouvre un écran dans la pile de l'onglet actif (depuis un menu ou le lecteur plein écran). */
export function navigateInCurrentTab<K extends keyof SharedStackParams>(screen: K, params: SharedStackParams[K]) {
  if (!navigationRef.isReady()) return;
  const state = navigationRef.getRootState();
  const tab = (state?.routes[state.index ?? 0]?.name ?? 'VideosTab') as keyof TabParams;
  // Les piles partagent le même jeu d'écrans : la navigation imbriquée est sûre pour chaque onglet.
  (navigationRef.navigate as (name: string, p: object) => void)(tab, { screen, params });
}

/** Bascule vers un autre onglet (raccourcis Rechercher, Paramètres…). */
export function goToTab(tab: 'VideosTab' | 'MusicTab' | 'SearchTab' | 'SettingsTab') {
  if (!navigationRef.isReady()) return;
  (navigationRef.navigate as (name: string) => void)(tab);
}
