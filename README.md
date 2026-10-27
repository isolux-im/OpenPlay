# OpenPlay — Écouter, autrement.

Lecteur musical Android **hors ligne**, inspiré de l'ergonomie d'Apple Music, développé avec
**Expo (SDK 58), React Native et TypeScript**. L'ancienne version Kotlin/Compose est conservée sur la
branche `archive/kotlin-native`.

## Fonctions

**Navigation** : cinq onglets (Accueil, Bibliothèque, Playlists, Recherche, Paramètres), une pile d'écrans
par onglet (la barre reste visible sur les fiches album/artiste), mini-lecteur flottant au-dessus de la barre,
lecteur plein écran qui s'ouvre depuis le mini-lecteur et se ferme d'un glissement vers le bas.

| Écran | Contenu |
|---|---|
| Accueil | Reprendre la lecture, Mix pour vous (titres phares, genre favori, à redécouvrir, aléatoire), écoutés récemment, favoris, ajoutés récemment, playlists, albums |
| Bibliothèque | Favoris, Titres (tri titre/artiste/album/date), Artistes, Albums, Genres, Dossiers, Historique ; fiches album et artiste |
| Playlists | Création, renommage, suppression, ajout de morceaux, réordonnancement par glisser-déposer ; playlists automatiques (favoris, plus écoutés, ajoutés récemment, à redécouvrir) |
| Recherche | Recherche instantanée sans accents ni casse (morceaux, artistes, albums, playlists), meilleur résultat, recherches récentes, genres |
| Paramètres | Thème clair/sombre/système, couleur d'accent, lecteur coloré, analyse et durée minimale, reprise au lancement, haptique, minuterie, historique |
| Lecteur | Pochette, fond aux couleurs de la pochette, barre de progression interactive, aléatoire, répétition (tout / un), favoris, paroles .lrc synchronisées, file d'attente modifiable, minuterie de sommeil |

**Lecture** : file native ExoPlayer (expo-audio `AudioPlaylist`) qui continue en arrière-plan, avec
notification, commandes de l'écran de verrouillage et boutons Bluetooth (lecture, pause, suivant, précédent).
La dernière session (file, position, aléatoire, répétition) est restaurée au lancement.
Un seul lecteur MP3 existe à la fois : changer de liste libère réellement l'ancien (pause puis `release()`),
et la musique met la vidéo en pause (et inversement). **Pause** (mini-lecteur, lecteur plein écran, accueil,
notification, écran verrouillé, casque) coupe le son en gardant morceau, position et file ; rien ne relance
la lecture ensuite, ni un état natif arrivé en retard, ni une erreur de fichier. Il n'y a pas de bouton
« Stop » distinct : l'arrêt de la minuterie de sommeil applique cette même pause (morceau et position conservés).

**Métadonnées** : module natif local `modules/openplay-media` (Kotlin) qui lit MediaStore : titre, artiste,
artiste de l'album, album, genre, numéro de piste/disque, année, dossier ; pochettes extraites vers le cache
(vignette système, puis image intégrée au fichier) et couleurs dominantes calculées avec AndroidX Palette.

### Paroles par IA (Internet)

Dans le lecteur › Paroles, **Transcrire avec l'IA** envoie le fichier audio à un service de transcription
Whisper (Groq ou OpenAI, au choix dans Paramètres › Paroles par IA) et enregistre des paroles `.lrc`
synchronisées, marquées « transcription automatique — à vérifier ».

- Clé API personnelle saisie dans les Paramètres, chiffrée sur le téléphone (expo-secure-store) ; aucune clé
  n'est intégrée à l'application (dépôt et APK publics).
- Limite : 25 Mo par fichier (offre de base des deux services). Coût facturé sur le compte de l'utilisateur.
- Qualité variable : bonne en français parlé clair, plus faible sur le chant avec instruments ; les langues peu
  représentées (fon, goun…) sont mal reconnues.

### Limites connues

- **Paroles** : fichier `.lrc` du même nom que le morceau, lu s'il est accessible (sur Android 13+, l'accès
  direct aux fichiers non audio est généralement refusé), ou importé depuis le lecteur. Les paroles intégrées
  aux étiquettes ID3 ne sont pas lues.
- **Volume** : pas de curseur de volume dans le lecteur (boutons physiques du téléphone).
- Le bouton « précédent » de la notification recule toujours d'une piste (comportement d'expo-audio) ;
  dans l'application, il revient au début du morceau après 3 s.

## Obtenir l'APK (GitHub Actions)

Le workflow **Android APK** (`.github/workflows/android-apk.yml`) :

1. Job `check` : TypeScript, ESLint, tests Jest.
2. Job `apk` : `expo prebuild` génère `android/`, puis `./gradlew assembleRelease` (arm64-v8a).
3. Sur `main` : Release GitHub `build-N` avec `OpenPlay.apk` ; lien direct vers la dernière version :
   https://github.com/isolux-im/OpenPlay/releases/latest/download/OpenPlay.apk
   Sur une pull request : artefact **OpenPlay-apk**.

L'APK est signé avec la **clé de débogage** d'Expo : installable pour des tests, pas publiable sur le Play Store.

## Développer

Prérequis : Node 22.

```bash
npm ci
npm run check        # tsc + ESLint + Jest
npm run prebuild     # génère android/ (non versionné)
npx expo export --platform web   # aperçu web (bibliothèque de démonstration, moteur audio simulé)
```

Dans l'environnement cloud de Claude Code, le SDK Android et les services Expo sont inaccessibles :
`EXPO_OFFLINE=1 npx expo install <paquet>`, compilation de l'APK par GitHub Actions, validation visuelle
par l'export web et Playwright.

## Architecture

```
modules/openplay-media/      module natif Kotlin (MediaStore, pochettes, couleurs, .lrc voisins)
src/
  App.tsx                    polices, thème, démarrage (bibliothèque, moteur, session)
  navigation/                onglets, piles, barre d'onglets + mini-lecteur
  screens/                   Accueil, Bibliothèque (+ sous-écrans), Playlists, Recherche, Paramètres, détails
  player/                    moteur (expo-audio / simulé), file, paroles .lrc, lecteur plein écran
  store/                     zustand : bibliothèque, lecteur, données utilisateur et réglages (persistés)
  library/                   conversion MediaStore, index, recherche, sélecteurs, pochettes
  components/ ui/            composants réutilisables, thème clair/sombre, typographie Inter, icônes
```
