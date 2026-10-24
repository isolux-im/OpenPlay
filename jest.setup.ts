jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Le module natif expo-audio n'existe pas sous Jest : un lecteur factice suffit aux tests
// qui ne remplacent pas eux-mêmes le moteur de lecture.
jest.mock('expo-audio', () => ({
  createAudioPlayer: () => ({
    replace: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(() => Promise.resolve()),
    remove: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  }),
  setAudioModeAsync: () => Promise.resolve(),
}));
