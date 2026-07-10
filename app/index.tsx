import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { Animated, SafeAreaView, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage'; // <--- I-install ug i-import ni

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

    // 2. Ang Logic sa Routing sulod sa Timer
    const checkNavigation = async () => {
      try {
        // I-check kung duna na ba'y token/session ang user (kung naka-login ba)
        const userToken = await AsyncStorage.getItem('user_token');
        // I-check kung nakasulod na ba siya sa app sukad sa una
        const hasVisitedBefore = await AsyncStorage.getItem('has_visited_before');

        if (userToken) {
          // Kung naka-login na, diritso sa Main Dashboard
          router.replace('/(main)/dashboard'); // <--- Usba ni sa saktong route sa imong dashboard
        } else if (hasVisitedBefore === 'true') {
          // Kung nakabisita na pero wala naka-login, diritso sa Login Screen
          router.replace('/(auth)/login'); // <--- Usba ni sa saktong route sa imong login screen
        } else {
          // Kung presko pa jud kaayo, adto sa Getting Started
          router.replace('/(auth)/getting-started');
        }
      } catch (error) {
        // Kung naay error sa AsyncStorage, i-fallback lang sa getting-started para luwas
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