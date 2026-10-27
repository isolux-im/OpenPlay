This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## OpenPlay project rules

- Android-only offline music player; UI text is in French. Design reference: Apple Music (large titles, rounded artwork, floating mini-player, full-screen player with artwork colours) — original identity, no Apple assets.
- Navigation: React Navigation 7 — bottom tabs (custom `TabBar` with the mini-player) and one native stack per tab registering the shared detail screens (`src/navigation/RootNavigator.tsx`). Screens use `ScrollScreen` / `ListScreen` (large collapsing title) from `src/components/Screen.tsx`.
- Playback goes through `PlaybackEngine` (`src/player/PlaybackEngine.ts`): `ExpoPlaylistEngine` (expo-audio `AudioPlaylist`, background + lock screen + Bluetooth) on Android, `SimulatedEngine` on web/tests. The native queue order must always equal `usePlayer().queue` (covered by `playerStore.test.ts`).
- expo-audio 58: `AudioPlaylist.destroy()` only clears the lock-screen controls — the ExoPlayer keeps playing until `release()`. Replacing the native player always goes through `ExpoPlaylistEngine.dispose()` (pause, destroy, release); covered by `singlePlayback.test.ts`. Play/pause intent lives in `store/player.ts` (`wantsPlay`); UI controls call the store, never the engine.
- Metadata/artwork come from the local module `modules/openplay-media` (Kotlin, compiled only in CI). Without it (web, Jest) the demo library is used.
- State: zustand stores in `src/store/` (settings and user data persisted with AsyncStorage). Reanimated shared values use `.get()` / `.set()` (React Compiler lint rules). Avoid `Date.now()` during render (`useNow`).
- Tests: Jest + React Native Testing Library 14 (`render`, `renderHook`, `act`, `fireEvent` are async — always `await`). Reanimated is replaced by a minimal double in `jest.setup.ts`.
- The APK is built by GitHub Actions (`.github/workflows/android-apk.yml`), not EAS.
- In the Claude Code cloud environment, docs.expo.dev, api.expo.dev and the Android SDK are blocked: read API shapes from `node_modules/<pkg>/build/*.d.ts`, use `EXPO_OFFLINE=1 npx expo install <package>`, and validate visually with `npx expo export --platform web` + Playwright.

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
