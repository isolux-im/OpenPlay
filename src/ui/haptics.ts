import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { useSettings } from '../store/settings';

export function tap(kind: 'light' | 'selection' | 'success' = 'light') {
  if (Platform.OS === 'web' || !useSettings.getState().haptics) return;
  const p =
    kind === 'selection'
      ? Haptics.selectionAsync()
      : kind === 'success'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  p.catch(() => {});
}
