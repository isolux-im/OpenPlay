# OpenPlay — Écouter, autrement.

Lecteur audio Android local, développé avec **Expo (SDK 58), React Native et TypeScript**.
L'ancienne version Kotlin/Compose est conservée sur la branche `archive/kotlin-native`.

## Fonctions de cette version

- Bibliothèque des fichiers audio du téléphone (permission `READ_MEDIA_AUDIO`).
- Lecture, pause, piste suivante, piste précédente (retour au début après 3 s), enchaînement automatique.
- Favoris enregistrés sur l'appareil.
- Thème clair/sombre selon le système.

**Pas encore inclus** : lecture en arrière-plan, notification et commandes de l'écran de verrouillage
(étape suivante, voir plus bas), listes de lecture, aléatoire/répétition, minuterie.

**Limite connue** : expo-media-library ne fournit pas les étiquettes ID3. Le titre et l'artiste sont
déduits du nom de fichier (format `Artiste - Titre.mp3`) ; sinon le nom de fichier sert de titre.

## Obtenir l'APK (GitHub Actions)

Le workflow **Android APK** (`.github/workflows/android-apk.yml`) se lance à chaque push sur `main`,
sur chaque pull request, ou manuellement (onglet **Actions** → **Android APK** → **Run workflow**,
possible une fois le workflow présent sur `main`).

1. Job `check` : TypeScript, ESLint, tests Jest.
2. Job `apk` : `expo prebuild` génère le dossier `android/`, puis `./gradlew assembleRelease`.
3. Télécharger l'APK :
   - après un push sur `main` (ou un lancement manuel sur `main`) : lien direct vers la dernière version,
     https://github.com/isolux-im/OpenPlay/releases/latest/download/OpenPlay.apk
     (chaque build crée une Release `build-N` ; le dépôt étant public, ce lien est accessible à tous) ;
   - sur une pull request : artefact **OpenPlay-apk** de l'exécution (ZIP contenant `app-release.apk`).

L'APK est compilé en `release` (le code JavaScript y est intégré) et signé avec la **clé de débogage**
d'Expo : installable pour des tests, mais pas publiable sur le Play Store. Il ne cible que les
processeurs `arm64-v8a` (quasi tous les téléphones récents).

## Installer sur le téléphone

Copier l'APK, autoriser l'installation depuis la source utilisée, puis l'ouvrir et accepter l'accès
à la musique. Si l'ancienne version Kotlin est installée, la désinstaller d'abord (signatures différentes).

## Développer

Prérequis : Node 22.

```bash
npm ci
npm run check        # tsc + ESLint + Jest
npm run prebuild     # génère android/ (non versionné)
```

Le dossier `android/` est régénéré à chaque build : toute configuration native passe par `app.json`
et les config plugins. Dans l'environnement cloud de Claude Code, le SDK Android et les services Expo
(api.expo.dev) sont inaccessibles : utiliser `EXPO_OFFLINE=1 npx expo install <paquet>` et laisser la
compilation de l'APK à GitHub Actions.

## Architecture

```
src/
  App.tsx                  écrans (onglets Bibliothèque / Favoris) et barre de lecture
  library/                 lecture de la bibliothèque (expo-media-library) et analyse des noms de fichier
  player/queue.ts          logique de file pure (testée)
  player/PlaybackEngine.ts interface du moteur audio + implémentation expo-audio
  player/usePlayer.ts      état de lecture exposé à l'interface
  favorites/               favoris (AsyncStorage)
  ui/                      composants
```

## Étape suivante : arrière-plan et commandes multimédias

Seule `ExpoAudioEngine` (`src/player/PlaybackEngine.ts`) et `app.json` seront modifiés :
`enableBackgroundPlayback: true` dans le plugin expo-audio, `shouldPlayInBackground: true`,
puis `setActiveForLockScreen(true, métadonnées)` pour la notification et l'écran de verrouillage
(sans quoi Android coupe la lecture en arrière-plan après environ 3 minutes, d'après la documentation
expo-audio). À valider sur appareil réel. Si les commandes « suivant/précédent » de la notification ne
suffisent pas, l'option suivante est un module Expo natif reprenant le `PlaybackService` Media3 de la
version Kotlin.
