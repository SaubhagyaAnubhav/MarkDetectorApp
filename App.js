/**
 * App.js — Root component
 *
 * Sets up React Navigation with two screens:
 *   1. Camera  — live feed + marker detection
 *   2. Results — 20 extracted marker images (300×300px each)
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import CameraScreen from './src/screens/CameraScreen';
import ResultsScreen from './src/screens/ResultsScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        initialRouteName="Camera"
        screenOptions={{
          headerStyle: { backgroundColor: '#111' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#000' },
        }}
      >
        <Stack.Screen
          name="Camera"
          component={CameraScreen}
          options={{ title: 'Marker Detector', headerShown: true }}
        />
        <Stack.Screen
          name="Results"
          component={ResultsScreen}
          options={{ title: 'Detected Markers', headerShown: true }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
