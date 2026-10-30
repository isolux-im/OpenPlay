// « Partager vers OpenPlay » : un lien partagé depuis une autre application (texte) ouvre
// Recherche › Télécharger par lien, prérempli. Aucun téléchargement n'est lancé sans confirmation.
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const SEND = 'android.intent.action.SEND';

module.exports = function withShareIntent(config) {
  return withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    const filters = activity['intent-filter'] ?? [];
    const present = filters.some((f) => (f.action ?? []).some((a) => a.$['android:name'] === SEND));
    if (!present) {
      filters.push({
        action: [{ $: { 'android:name': SEND } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:mimeType': 'text/plain' } }],
      });
    }
    activity['intent-filter'] = filters;
    return cfg;
  });
};
