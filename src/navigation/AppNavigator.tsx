import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HomeScreen from '@/screens/HomeScreen';
import NearbyScreen from '@/screens/NearbyScreen';
import ChatScreen from '@/screens/ChatScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import WelcomeScreen from '@/screens/onboarding/WelcomeScreen';
import ConsentsScreen from '@/screens/onboarding/ConsentsScreen';
import PermissionsScreen from '@/screens/onboarding/PermissionsScreen';
import ProfileFormScreen from '@/screens/onboarding/ProfileFormScreen';
import PreferencesFormScreen from '@/screens/onboarding/PreferencesFormScreen';
import FinishScreen from '@/screens/onboarding/FinishScreen';
import LegalScreen from '@/screens/legal/LegalScreen';
import TermsScreen from '@/screens/legal/TermsScreen';
import EditProfileScreen from '@/screens/EditProfileScreen';
import PhotoManagerScreen from '@/screens/PhotoManagerScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs(){
  return (
    <Tab.Navigator>
      <Tab.Screen name="Swipe" component={require('@/screens/SwipeScreen').default} />
      <Tab.Screen name="Nearby" component={NearbyScreen} />
      <Tab.Screen name="Question" component={require('@/screens/QuestionScreen').default} />
      <Tab.Screen name="RandomChat" component={require('@/screens/RandomChatScreen').default} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function OnboardingStack(){
  return (
    <Stack.Navigator>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Consents" component={ConsentsScreen} />
      <Stack.Screen name="Permissions" component={PermissionsScreen} />
      <Stack.Screen name="ProfileForm" component={ProfileFormScreen} />
      <Stack.Screen name="PreferencesForm" component={PreferencesFormScreen} />
      <Stack.Screen name="Finish" component={FinishScreen} />
      <Stack.Screen name="Legal" component={LegalScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="PhotoManager" component={PhotoManagerScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator(){
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    (async () => {
      const flag = await AsyncStorage.getItem('onboarded');
      setOnboarded(!!flag);
      setReady(true);
    })();
  }, []);

  if (!ready) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown:false }}>
        {!onboarded ? (
          <Stack.Screen name="Onboarding" component={OnboardingStack} />
        ) : (
          <Stack.Screen name="MainTabs" component={MainTabs} />
        )}
        <Stack.Screen name="Legal" component={LegalScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="PhotoManager" component={PhotoManagerScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
