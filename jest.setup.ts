// Polices (Inter, Ionicons) : pas de chargement réel d'assets sous Jest.
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  loadAsync: () => Promise.resolve(),
  isLoaded: () => true,
  isLoading: () => false,
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Le module natif expo-audio n'existe pas sous Jest ; les tests utilisent le moteur simulé.
jest.mock('expo-audio', () => ({
  createAudioPlaylist: jest.fn(),
  setAudioModeAsync: () => Promise.resolve(),
  requestNotificationPermissionsAsync: () => Promise.resolve({ granted: true }),
}));

// Reanimated 4 et Worklets : modules natifs remplacés par leurs simulations officielles.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// La simulation officielle de Reanimated 4.7 échoue sous Jest (setCSSEventHandler) :
// simulation minimale, sans animation, suffisante pour rendre les écrans.
jest.mock('react-native-reanimated', () => {
  const RN = jest.requireActual('react-native');
  const chain: object = new Proxy(function () {}, { get: () => () => chain, apply: () => chain });
  const Animated = {
    View: RN.View,
    Text: RN.Text,
    Image: RN.Image,
    ScrollView: RN.ScrollView,
    FlatList: RN.FlatList,
    createAnimatedComponent: <T,>(c: T) => c,
  };
  const interpolate = (v: number, input: number[], output: number[]) => {
    if (v <= input[0]) return output[0];
    if (v >= input[input.length - 1]) return output[output.length - 1];
    const t = (v - input[0]) / (input[1] - input[0]);
    return output[0] + t * (output[1] - output[0]);
  };
  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    useSharedValue: (initial: unknown) => {
      const sv = {
        value: initial,
        get: () => sv.value,
        set: (v: unknown) => {
          sv.value = v;
        },
      };
      return sv;
    },
    useAnimatedStyle: (f: () => object) => f(),
    useAnimatedScrollHandler: () => () => {},
    useEvent: () => () => {},
    useHandler: () => ({ context: {}, doDependenciesDiffer: false, useWeb: false }),
    useAnimatedRef: () => ({ current: null }),
    withTiming: (v: unknown, _c?: unknown, cb?: (done: boolean) => void) => {
      cb?.(true);
      return v;
    },
    withSpring: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
    withSequence: (...v: unknown[]) => v[v.length - 1],
    cancelAnimation: () => {},
    runOnJS: (f: unknown) => f,
    interpolate,
    Easing: { in: (e: unknown) => e, out: (e: unknown) => e, cubic: () => 0, linear: () => 0 },
    FadeIn: chain,
    FadeInDown: chain,
    FadeOutDown: chain,
    FadeOut: chain,
    ZoomIn: chain,
    ZoomOut: chain,
  };
});
require('react-native-gesture-handler/jestSetup');
