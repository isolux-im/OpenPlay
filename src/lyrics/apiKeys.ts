import * as SecureStore from 'expo-secure-store';

import type { ProviderId } from './transcription';

const keyName = (p: ProviderId) => `openplay.apikey.${p}`;

/** Clés API chiffrées par le système (Android Keystore), jamais synchronisées ni affichées. */
export async function getApiKey(p: ProviderId): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(keyName(p));
  } catch {
    return null;
  }
}

export async function setApiKey(p: ProviderId, value: string): Promise<void> {
  await SecureStore.setItemAsync(keyName(p), value.trim());
}

export async function deleteApiKey(p: ProviderId): Promise<void> {
  await SecureStore.deleteItemAsync(keyName(p));
}
