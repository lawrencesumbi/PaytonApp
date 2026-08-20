import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from 'react';
import { supabase } from '../lib/supabase'; // I-adjust lang ang path kon kinahanglan

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Kuhaa ang current path
      const currentRoute = segments.join('/');
      const isResetPasswordScreen = currentRoute.includes('reset-password');

      // 1. Kung PASSWORD_RECOVERY event, ibalhin diretso sa reset-password
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/reset-password');
        return;
      }

      // 2. KINAHANGLANON: Kon naa na ang user sa reset-password screen,
      // paundangon ang redirection aron makatype sa bag-ong password!
      if (isResetPasswordScreen) {
        return;
      }

      // 3. Normal Authentication Navigation Guard (Optional handle)
      // Kon mag-sign-in ang user ug wala sa reset screen:
      if (event === 'SIGNED_IN' && session) {
        // Pwede nimo pasagdan kon ang index.tsx/login.tsx na ang nag-handle sa routing
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