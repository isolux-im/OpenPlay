import { registerRootComponent } from 'expo';

import App from './src/App';

// registerRootComponent appelle AppRegistry.registerComponent('main', () => App)
// et prépare l'environnement, que l'app tourne dans Expo Go ou dans un build natif.
registerRootComponent(App);
