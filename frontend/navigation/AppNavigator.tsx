import { createStackNavigator } from '@react-navigation/stack';
import React from 'react';
import { useAuth } from '../context/AuthContext';
import LoadingScreen from '../screens/LoadingScreen';
import AuthStack from './AuthStack';
import MainStack from './MainStack';

import CallScreen from '../screens/main/CallScreen';

const Stack = createStackNavigator();

const AppNavigator: React.FC = () => {
  const { state } = useAuth();
  const { isAuthenticated, isInitializing } = state.auth;

  // Show loading screen while checking for persisted session on app startup
  if (isInitializing) {
    return <LoadingScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <Stack.Screen name="MainStack" component={MainStack} />
      ) : (
        <Stack.Screen name="AuthStack" component={AuthStack} />
      )}
    </Stack.Navigator>
  );
};

export default AppNavigator;

