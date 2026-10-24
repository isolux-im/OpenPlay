// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['android/*', 'ios/*', 'dist/*', 'coverage/*'],
  },
  {
    // Les simulations Jest se déclarent avec require() à l'intérieur de jest.mock.
    files: ['jest.setup.ts', 'src/__tests__/**'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
