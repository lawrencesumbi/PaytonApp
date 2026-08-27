import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { Animated, SafeAreaView, StyleSheet, View } from 'react-native';

export default function WelcomeScreen() {
  const router = useRouter();
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    // 1. Sugdan ang Animation sa Logo
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      })
    ]).start();

    // 2. Ang Logic sa Routing
    const checkNavigation = async () => {
      try {
        // A. KINAHANGLANON: Check kung deep link ba ang nag-open sa app (gikan sa Gmail)
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && initialUrl.includes('reset-password')) {
          // Kung link sa reset password ang gi-click, AYAW na mo-redirect, pasagdi ang reset-password screen
          return;
        }

        // B. Normal Flow kung normal ra nga pag-open sa App
        const userToken = await AsyncStorage.getItem('user_token');
        const hasVisitedBefore = await AsyncStorage.getItem('has_visited_before');

        if (userToken) {
          router.replace('/(auth)/login'); // O kung asa man ang imong main route
        } else if (hasVisitedBefore === 'true') {
          router.replace('/(auth)/login');
        } else {
          router.replace('/(auth)/getting-started');
        }
      } catch (error) {
        router.replace('/(auth)/getting-started');
      }
    };

    // Paabuton mahuman ang 2 seconds una i-execute ang navigation logic
    const timer = setTimeout(() => {
      checkNavigation();
    }, 2000); 

    return () => clearTimeout(timer);
  }, [fadeAnim, scaleAnim, router]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.contentContainer}>
        <Animated.Image 
          source={require('../assets/images/logo-light1.png')} 
          style={[
            styles.logo, 
            { 
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }]
            }
          ]}
          resizeMode="contain"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fdfdfd', justifyContent: 'space-between' },
  contentContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  logo: { width: 150, height: 150, marginBottom: 25 },
});