 import { Feather, FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

// Custom Multi-Color Google Icon
const GoogleIcon = ({ size = 24 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      fill="#4285F4"
    />
    <Path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <Path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <Path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </Svg>
);

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Animation value for logo zoom
  const logoScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Create continuous zoom in/out animation
    const zoomAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(logoScale, {
          toValue: 1.1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );
    
    zoomAnimation.start();
    
    return () => zoomAnimation.stop();
  }, [logoScale]);

  useEffect(() => {
    const handleDeepLink = async (url: string) => {
      const normalizedUrl = url.replace('#', '?');
      const parsedUrl = Linking.parse(normalizedUrl);
      const { access_token, refresh_token } = parsedUrl.queryParams || {};

      if (access_token && refresh_token) {
        setLoading(true);
        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: access_token as string,
            refresh_token: refresh_token as string,
          });

          if (sessionError) throw sessionError;
          if (sessionData?.user) await handleProfileRouting(sessionData.user.id);
        } catch (err: any) {
          Alert.alert("Session Error", err.message || "Could not re-establish session.");
        } finally {
          setLoading(false);
        }
      }
    };

    const subscription = Linking.addEventListener('url', (event) => handleDeepLink(event.url));
    Linking.getInitialURL().then((url) => { if (url) handleDeepLink(url); });
    return () => subscription.remove();
  }, []);

  const handleProfileRouting = async (userId: string) => {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (profileError || !profile) {
      Alert.alert("Error", "Could not fetch user profile details.");
      return;
    }

    if (!profile.role) router.replace('/role-selection');
    else if (profile.role === 'Personal') router.replace('/(personalTabs)/home');
    else if (profile.role === 'Spender') router.replace('/(spenderTabs)/home');
    else if (profile.role === 'Sponsor') router.replace('/(sponsorTabs)/home');
    else Alert.alert("Error", "Unknown user role detected.");
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Missing Fields", "Please enter both your email and password.");
      return;
    }
    setLoading(true);
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError || !authData?.user) {
      Alert.alert("Authentication Failed", authError?.message || "User data missing.");
      setLoading(false);
      return;
    }
    await handleProfileRouting(authData.user.id);
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const redirectTo = Linking.createURL('/login');
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
      if (error) throw error;
      if (data?.url) {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (res.type === 'success' && res.url) { /* Handle callback logic here */ }
      }
    } catch (e: any) { Alert.alert("Error", e.message); } finally { setLoading(false); }
  };

  const handleFacebookLogin = async () => {
    setLoading(true);
    try {
      const redirectTo = Linking.createURL('/login');
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'facebook', options: { redirectTo, skipBrowserRedirect: true } });
      if (error) throw error;
      if (data?.url) {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (res.type === 'success' && res.url) { /* Handle callback logic here */ }
      }
    } catch (e: any) { Alert.alert("Error", e.message); } finally { setLoading(false); }
  };

  const handleForgotPassword = async () => {
    if (!email) { Alert.alert("Email Required", "Please enter your email."); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: Linking.createURL('reset-password') });
    setLoading(false);
    if (error) Alert.alert("Reset Failed", error.message);
    else Alert.alert("Email Sent", "Check your inbox for the reset link.");
  };

  return (
    <LinearGradient colors={['#ffffff', '#f0f5f1']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
          <ScrollView contentContainerStyle={styles.scrollContainer} bounces={false}>
            <View style={styles.innerContainer}>
              {/* Animated Logo with zoom effect */}
              <Animated.View style={[
                styles.gradientLogoContainer,
                {
                  transform: [{ scale: logoScale }]
                }
              ]}>
                <Image source={require('../../assets/images/logo-light1.png')} style={styles.logoImage} resizeMode="contain" />
              </Animated.View>
              
              <View style={styles.signInHeader}>
                <Text style={styles.titleText}>Sign In</Text>
                <Text style={styles.subtitle}>Access your account securely.</Text>
              </View>

              {/* White Card - More vertical and bigger */}
              <View style={styles.card}>
                <View style={styles.form}>
                  <View style={styles.inputWrapper}>
                    <Feather name="mail" color="#64748B" size={16} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="Email Address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
                  </View>

                  <View style={styles.inputWrapper}>
                    <Feather name="lock" color="#64748B" size={16} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                      <Feather name={showPassword ? 'eye-off' : 'eye'} color="#94A3B8" size={16} />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotWrapper}>
                    <Text style={styles.forgot}>Forgot Password?</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} disabled={loading}>
                    {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Sign In</Text>}
                  </TouchableOpacity>
                </View>

                <View style={styles.dividerContainer}>
                  <View style={styles.dividerLine} /><Text style={styles.dividerText}>or continue with</Text><View style={styles.dividerLine} />
                </View>

                <View style={styles.socialContainer}>
                  <TouchableOpacity style={styles.socialButton} onPress={handleGoogleLogin}>
                    <GoogleIcon size={16} />
                    <Text style={styles.socialButtonText}>  Google</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.socialButton} onPress={handleFacebookLogin}>
                    <FontAwesome name="facebook-official" color="#1877F2" size={16} style={styles.socialIcon} /><Text style={styles.socialButtonText}>Facebook</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.footer}>
                  <Text style={styles.footerText}>Don't have an account? </Text>
                  <TouchableOpacity onPress={() => router.push('/register')}><Text style={styles.linkText}>Sign Up</Text></TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContainer: { 
    flexGrow: 1, 
    justifyContent: 'flex-start',
    paddingTop: 45,
  },
  innerContainer: { 
    paddingHorizontal: 20, 
    paddingVertical: 10,
    alignItems: 'center',
  },
  gradientLogoContainer: { 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginBottom: 40, 
    height: 100, 
    width: 100,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#166534',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#166534',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  logoImage: { 
    width: '60%', 
    height: '60%',
  },
  signInHeader: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  titleText: { 
    fontSize: 25, 
    fontWeight: '800', 
    color: '#0F172A', 
    marginBottom: 3,
  },
  subtitle: { 
    fontSize: 12, 
    color: '#64748B', 
    textAlign: 'center',
  },
  
  // White Card - More vertical spacing (bigger)
  card: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 30, 
    paddingHorizontal: 25, 
    paddingVertical: 30,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    width: '100%',
  },
  
  form: { width: '100%' },
  inputWrapper: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#F8FAFC', 
    borderWidth: 1, 
    borderColor: '#E2E8F0', 
    borderRadius: 25, 
    paddingHorizontal: 15, 
    height: 50, 
    marginBottom: 20
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: '#0F172A', height: '100%' },
  eyeIcon: { padding: 5 },
  
  forgotWrapper: { 
    alignSelf: 'flex-end', 
    marginBottom: 20,
    marginTop: 4 
  },
  forgot: { color: '#166534', fontSize: 13, fontWeight: '600' },
  
  primaryButton: { 
    backgroundColor: '#166534', 
    borderRadius: 25, 
    height: 50, 
    alignItems: 'center', 
    justifyContent: 'center',
    marginBottom: 8,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  
  dividerContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginVertical: 24,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { color: '#94A3B8', fontSize: 13, paddingHorizontal: 12 },
  
  socialContainer: { 
    flexDirection: 'row', 
    gap: 12, 
    marginBottom: 24,
  },
  socialButton: { 
    flex: 1, 
    backgroundColor: '#FFFFFF', 
    borderRadius: 25, 
    height: 48, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    borderWidth: 1, 
    borderColor: '#E2E8F0' 
  },
  socialIcon: { marginRight: 8 },
  socialButtonText: { color: '#0F172A', fontSize: 14, fontWeight: '600' },
  
  footer: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginTop: 8,
  },
  footerText: { color: '#64748B', fontSize: 14 },
  linkText: { color: '#166534', fontWeight: '600', fontSize: 14 },
});