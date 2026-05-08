import { registerRootComponent } from 'expo';
import { enableScreens } from 'react-native-screens';

import App from './App';

// Enable native screens for better navigation performance
enableScreens();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
