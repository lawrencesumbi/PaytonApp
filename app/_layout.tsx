import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const isRecoveringPassword = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentRoute = segments.join('/');

      // 1. Kung nakasulod na sa reset-password route, i-flag dayon nato
      if (currentRoute.includes('reset-password')) {
        isRecoveringPassword.current = true;
      }

      // 2. Pag-catch sa PASSWORD_RECOVERY event gikan sa Supabase
      if (event === 'PASSWORD_RECOVERY') {
        isRecoveringPassword.current = true;
        router.replace('/(auth)/reset-password');
        return;
      }

      // 3. Paundangon ang bisan unsang auto-redirect kung recovery mode
      if (isRecoveringPassword.current || currentRoute.includes('reset-password')) {
        return;
      }

      // 4. Inig Human ug Sign Out (pananglitan human mag-reset sa password)
      if (event === 'SIGNED_OUT') {
        isRecoveringPassword.current = false;
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [segments]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F7F9F8' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
      </Stack>
    </>
  );
}