import { Ionicons } from '@expo/vector-icons';
import * as NavigationBar from 'expo-navigation-bar';
import { Tabs, useRouter, useSegments } from 'expo-router';
import React, { useEffect } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import FloatingNav from '../../components/FloatingNav';

export default function PersonalLayout() {
  const router = useRouter();
  const segments = useSegments() as string[];
  const isChatScreen = segments.includes('chat');
  const isScanScreen = segments.includes('scan');
  const shouldHideAiButton = isChatScreen || isScanScreen;

  // Hides the Android system nav bar (back/home/recents) so it doesn't sit
  // underneath — or get overlapped by — the floating nav. Android-only:
  // iOS doesn't expose a public API for hiding the home indicator outside
  // of full-screen video/game contexts, so there's no equivalent call here.
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    NavigationBar.setVisibilityAsync('hidden');
    // 'overlay-swipe' lets the user swipe from the edge to reveal the bar
    // temporarily (it auto-hides again) rather than locking it away with
    // no way back in — 'inset-swipe' or 'immersive' also disable the
    // floating nav's touch handling until dismissed, which overlay-swipe
    // avoids.
    NavigationBar.setBehaviorAsync('overlay-swipe');
  }, []);

  return (
    <View style={styles.container}>
      <Tabs
        tabBar={() => null}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen name="home" />
        <Tabs.Screen name="budget" />
        <Tabs.Screen name="scan" />
        {/* Renamed from "split" — that route name collided with
            app/(spenderTabs)/split.tsx, since Expo Router route groups
            don't add to the URL. Both files were resolving to the same
            "/split" path, and the spender one was winning, so this
            screen was never actually reachable. */}
        <Tabs.Screen name="personal-split" />
        <Tabs.Screen name="profile" />

        {/* HIDDEN ROUTES */}
        <Tabs.Screen name="chat" options={{ href: null }} />
        <Tabs.Screen name="transaction" options={{ href: null }} />
        <Tabs.Screen name="statistics" options={{ href: null }} />
        <Tabs.Screen name="reminders" options={{ href: null }} />
        <Tabs.Screen name="friends" options={{ href: null }} />
        <Tabs.Screen name="category-dashboard" options={{ href: null }} />
      </Tabs>

      <FloatingNav />

      {!shouldHideAiButton && (
        <TouchableOpacity style={styles.floatingAiButton} onPress={() => router.push('/chat')} activeOpacity={0.8}>
          <Ionicons name="chatbubble-ellipses" size={26} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  // Repositioned to sit just above FloatingNav (which replaces the old
  // bottom tab bar this offset used to be measured against).
  floatingAiButton: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 128 : 108,
    right: 20,
    backgroundColor: '#005B60',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    zIndex: 998,
  },
});