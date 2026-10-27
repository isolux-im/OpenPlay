# OpenPlay — Écouter, autrement.

Lecteur musical Android **hors ligne**, inspiré de l'ergonomie d'Apple Music, développé avec
**Expo (SDK 58), React Native et TypeScript**. L'ancienne version Kotlin/Compose est conservée sur la
branche `archive/kotlin-native`.

## Fonctions

**Autorisations** : au premier lancement, Android demande aussitôt l'accès au stockage (musique et audio, puis
photos et vidéos) ; un écran explique pourquoi et permet de redemander. Refusé, l'accès reste proposé dans les
onglets Vidéo et Musique.

**Navigation** : quatre onglets, à la manière de VLC — Vidéos, Audios, Recherche, Paramètres —, une pile d'écrans
par onglet (la barre reste visible sur les fiches album/artiste), mini-lecteur flottant au-dessus de la barre,
lecteur plein écran qui s'ouvre depuis le mini-lecteur et se ferme d'un glissement vers le bas.

| Écran | Contenu |
|---|---|
| Vidéos | Même organisation que Musique : recherche, tuiles Récentes, Favoris, Playlists, Toutes, Continuer, Bilan ; « Continuer à regarder » ; Parcourir (Toutes les vidéos, Séries, Playlists vidéo, Dossiers) ; lecteur vidéo et mini-lecteur. Vidéos classées automatiquement par nom (ordre alphabétique, 2 avant 10), sans « Trier par » |
| Audios | Mix pour vous (titres phares, genre favori, à redécouvrir, aléatoire), Récents, Favoris, Playlists, Titres (tri titre/artiste/album/date), Artistes, Albums, Genres, Dossiers, À découvrir, Bilan d'écoute ; fiches album et artiste |
| Musique › Playlists | Création, renommage, suppression, ajout de morceaux, réordonnancement par glisser-déposer ; playlists automatiques (favoris, plus écoutés, ajoutés récemment, à redécouvrir) |
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

**Séries vidéo** : reconnues d'après le nom (`S01E02`, `1x02`, `Saison 1 Épisode 2`, `S02_Episode_02`, `S01E01E02`…)
ou les dossiers (`Ma Serie/Saison 1/Episode 01.mp4`, `Ma Serie/S01/01.mp4`), triées numériquement, épisodes
spéciaux (saison 0) à part. Un fichier ambigu ou rangé dans un dossier générique (Download, Movies, DCIM…) reste
une vidéo isolée. À la fin naturelle d'un épisode, le suivant disponible démarre dans le même lecteur après un
compte à rebours de 10 s (copies du même épisode sautées, numéros absents signalés, arrêt après le dernier) ;
réglages « Séries : enchaîner les épisodes » et « Continuer à la saison suivante ».

**Mini-lecteur vidéo** : le bouton « Mini-lecteur » du lecteur réduit la vidéo dans une petite fenêtre déplaçable,
à l'intérieur d'OpenPlay (lecture / pause, plein écran, fermer) : la bibliothèque reste utilisable. La touche Retour
du téléphone en plein écran quitte OpenPlay et passe en fenêtre flottante Android (PiP) ; au retour, le lecteur est
restauré tel quel. Sans PiP (réglage désactivé, appareil non compatible), le Retour ouvre le mini-lecteur. Un seul
lecteur natif pour les trois affichages ; l'enchaînement des épisodes continue en mini-lecteur.

**Playlists vidéo** : Vidéo › Playlists. Chaque playlist range des séries entières (elles suivent
leurs nouveaux épisodes) et des vidéos isolées ; ajout par le menu « ⋮ » / appui long d'une série ou d'une vidéo,
réorganisation (Monter, Descendre, Retirer), lecture de toute la liste dans l'ordre.

**Fichiers** (musique et vidéos, menu « ⋮ » / appui long) : renommer le fichier (extension conservée), copier ou
déplacer vers un dossier existant ou nouveau (racines autorisées par Android : Music, Podcasts… pour l'audio ;
Movies, DCIM, Pictures pour la vidéo), et supprimer une vidéo ou une série. Ce sont les vrais fichiers de
l'appareil : Android demande l'autorisation (Android 11+ pour renommer et déplacer, Android 10+ pour copier).
Après un renommage ou un déplacement, favoris, playlists, historique et positions de reprise sont conservés.
« Nouveau dossier… » en tête de Musique › Dossiers et de Vidéos › Dossiers : crée un dossier **vide** (Android 11+),
retenu par OpenPlay (Android n'indexe pas les dossiers vides) ; « Ajouter des fichiers » le remplit quand on veut,
« Supprimer le dossier » l'efface tant qu'il est vide.

**Tri** : alphabétique « naturel » partout (« Film 2 » avant « Film 10 ») ; vidéos et films par nom par défaut ;
séries par ordre alphabétique, saisons et épisodes par ordre croissant (épisodes spéciaux à la fin).

**Gestes** : toucher un morceau ou une vidéo lance la lecture ; l'appui long le sélectionne ; « ⋮ » ouvre son menu
(en liste comme en grille). Albums, playlists et séries gardent leur menu à l'appui long.

**Sélection** (unique ou multiple) : appui long sur un élément, bouton « Sélectionner » en haut des listes de
morceaux et de vidéos, ou « Sélectionner » dans le menu d'un élément. Toucher coche ou décoche (aucune lecture), « Tout sélectionner » ;
la barre du bas propose Playlist, Copier, Déplacer, Renommer (un seul élément) et Supprimer. Retour ou « ✕ »
termine la sélection, qui prend aussi fin en quittant l'écran.

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
  screens/                   Vidéo, Musique (+ sous-écrans, Playlists), Recherche, Paramètres, détails
  player/                    moteur (expo-audio / simulé), file, paroles .lrc, lecteur plein écran
  store/                     zustand : bibliothèque, lecteur, données utilisateur et réglages (persistés)
  library/                   conversion MediaStore, index, recherche, sélecteurs, pochettes
  components/ ui/            composants réutilisables, thème clair/sombre, typographie Inter, icônes
```
