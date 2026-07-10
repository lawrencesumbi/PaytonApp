 import { Feather, FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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

export default function RegisterScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!fullName || !email || !password || !confirmPassword) {
      Alert.alert("Error", "Please fill out all fields.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });

    setIsLoading(false);
    if (error) Alert.alert("Signup Failed", error.message);
    else router.push('/verify-email');
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

  return (
    <LinearGradient colors={['#ffffff', '#f0f5f1']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.headerContainer}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Start your journey with us today.</Text>
          </View>

          {/* The Card Layout */}
          <View style={styles.card}>
            <View style={styles.form}>
              {[
                { icon: 'user', placeholder: 'Full Name', value: fullName, setter: setFullName, type: 'words' },
                { icon: 'mail', placeholder: 'Email Address', value: email, setter: setEmail, type: 'none', keyboard: 'email-address' },
                { icon: 'lock', placeholder: 'Password', value: password, setter: setPassword, secure: true },
                { icon: 'lock', placeholder: 'Confirm Password', value: confirmPassword, setter: setConfirmPassword, secure: true },
              ].map((item, index) => (
                <View key={index} style={styles.inputWrapper}>
                  <Feather name={item.icon as any} color="#64748B" size={18} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder={item.placeholder}
                    placeholderTextColor="#94A3B8"
                    value={item.value}
                    onChangeText={item.setter}
                    secureTextEntry={item.secure && !showPassword}
                    autoCapitalize={item.type as any || 'none'}
                    keyboardType={item.keyboard as any || 'default'}
                  />
                  {item.secure && (
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                      <Feather name={showPassword ? 'eye-off' : 'eye'} color="#94A3B8" size={18} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <TouchableOpacity style={styles.primaryButton} onPress={handleRegister} disabled={isLoading}>
                {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Sign Up</Text>}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.dividerContainer}>
            <View style={styles.line} /><Text style={styles.dividerText}>or continue with</Text><View style={styles.line} />
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

          <TouchableOpacity style={styles.footer} onPress={() => router.push('/login')}>
            <Text style={styles.footerText}>Already have an account? <Text style={styles.linkText}>Sign In</Text></Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContainer: { padding: 24, flexGrow: 1, justifyContent: 'center' },
  headerContainer: { marginBottom: 30, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#64748B' },
  
  // Card Styles with Shadow
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    padding: 25,
    paddingVertical: 50,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  
  form: { width: '100%' },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC',
    borderRadius: 25, paddingHorizontal: 16, height: 50, marginBottom: 12,
    borderWidth: 1, borderColor: '#E2E8F0'
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 14, color: '#0F172A' },
  primaryButton: { backgroundColor: '#166534', borderRadius: 25, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 25 },
  line: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { marginHorizontal: 10, color: '#94A3B8', fontSize: 12 },
  
  socialContainer: { flexDirection: 'row', gap: 12 },
  socialButton: { flex: 1, height: 48, borderRadius: 25, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  socialText: { fontSize: 13, fontWeight: '600', color: '#166534' },
  
  footer: { marginTop: 30, alignItems: 'center' },
  footerText: { color: '#64748B', fontSize: 14 },
  linkText: { color: '#166534', fontWeight: 'bold' },

  socialButtonText: { color: '#0F172A', fontSize: 13, fontWeight: '600' },
  socialIcon: { marginRight: 8 }
});