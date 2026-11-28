import 'react-native-gesture-handler'
import { Platform } from 'react-native'

if (Platform.OS !== 'web') {
  require('./polyfill')
}

import 'expo-router/entry'
