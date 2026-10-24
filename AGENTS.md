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

- Android-only local audio player. UI text is in French.
- Navigation is a simple tab state in `src/App.tsx` (no Expo Router yet). Introduce Expo Router only when screens need deep links or a stack.
- Audio playback goes through the `PlaybackEngine` interface (`src/player/PlaybackEngine.ts`); screens never import `expo-audio` directly.
- Keep queue and parsing logic pure and covered by Jest (`src/__tests__/`). React Native Testing Library 14: `render`, `renderHook`, `act` and `fireEvent` are async — always `await` them.
- The APK is built by GitHub Actions (`.github/workflows/android-apk.yml`), not EAS.
- In the Claude Code cloud environment, docs.expo.dev, api.expo.dev and the Android SDK are blocked: read API shapes from `node_modules/<pkg>/build/*.d.ts`, and use `EXPO_OFFLINE=1 npx expo install <package>`.

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
