# OpenPlay — Écouter, autrement.

Lecteur audio Android local (Kotlin, Jetpack Compose, Media3/ExoPlayer). Sans publicité, sans Lyrics AI dans cette version.

## Compiler l'APK de débogage avec GitHub Actions
1. Créer un dépôt GitHub vide, puis y déposer **tout le contenu** de ce dossier (y compris le dossier caché `.github`).
2. Onglet **Actions** → workflow **Build APK** → **Run workflow** (il se lance aussi à chaque push sur `main`).
3. Une fois terminé (vert), ouvrir l'exécution et télécharger l'artefact **OpenPlay-debug-apk** (ZIP contenant `app-debug.apk`).
4. Si le workflow échoue : ouvrir l'étape en erreur et copier le message pour correction.

## Compiler en local
Prérequis : JDK 17, Android SDK 34, Gradle 8.7 : `gradle assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk`.

## Installer
Copier l'APK sur le téléphone, autoriser « Sources inconnues » pour l'application utilisée, puis l'ouvrir. Accepter l'accès à la musique et les notifications.

## État
Code non compilé ni testé au moment de la livraison. Toutes les fonctions sont à considérer NON TESTÉES tant qu'un APK n'a pas été construit et essayé sur appareil.
Non inclus : albums/artistes/dossiers, égaliseur, Lyrics AI. Effet « verre » approximé par une surface translucide.
