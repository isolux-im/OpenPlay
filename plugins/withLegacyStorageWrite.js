// Android 9 et avant (API ≤ 28) : écrire un fichier téléchargé dans Music/ ou Movies/ exige WRITE_EXTERNAL_STORAGE.
// La permission est limitée à ces versions (maxSdkVersion 28) : rien ne change sur Android 10 et plus.
const { withAndroidManifest } = require('expo/config-plugins');

const WRITE = 'android.permission.WRITE_EXTERNAL_STORAGE';

module.exports = function withLegacyStorageWrite(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$ = { ...manifest.$, 'xmlns:tools': 'http://schemas.android.com/tools' };
    const perms = (manifest['uses-permission'] ?? []).filter((p) => p.$['android:name'] !== WRITE);
    perms.push({ $: { 'android:name': WRITE, 'android:maxSdkVersion': '28', 'tools:replace': 'android:maxSdkVersion' } });
    manifest['uses-permission'] = perms;
    return cfg;
  });
};
