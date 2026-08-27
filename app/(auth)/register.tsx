import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export default function RegisterScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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

    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          full_name: fullName, // Saved securely in user metadata
        }
      }
    });

    setIsLoading(false);

    if (error) {
      Alert.alert("Signup Failed", error.message);
    } else {
      // Send them to the verification notice screen
      router.push('/verify-email');
    }
  };

  const handleGoogleLogin = async () => {
        setIsLoading(true);
        try {
          const redirectTo = Linking.createURL('/login');
          const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
          if (error) throw error;
          if (data?.url) {
            const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
            if (res.type === 'success' && res.url) { /* Handle callback logic here */ }
          }
        } catch (e: any) { Alert.alert("Error", e.message); } finally { setIsLoading(false); }
      };
    
      const handleFacebookLogin = async () => {
        setIsLoading(true);
        try {
          const redirectTo = Linking.createURL('/login');
          const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'facebook', options: { redirectTo, skipBrowserRedirect: true } });
          if (error) throw error;
          if (data?.url) {
            const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
            if (res.type === 'success' && res.url) { /* Handle callback logic here */ }
          }
        } catch (e: any) { Alert.alert("Error", e.message); } finally { setIsLoading(false); }
      };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "white"}}>
      <View style={styles.innerContainer}>
        
        <View style={styles.headerContainer}>
          <Text style={styles.title}>
            Create an <Text style={styles.brandText}>Account</Text>
          </Text>
          <Text style={styles.subtitle}>
            Sign up with your email and password to continue.
          </Text>
        </View>

        <View style={styles.form}>
          
          {/* 1. FIXED: Full Name Field */}
          <View style={styles.inputWrapper}>
            <Feather name="user" color="#085334" size={20} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Full Name"
              placeholderTextColor="#A0AEC0"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
            />
          </View>

          {/* 2. FIXED: Cleaned Email Field */}
          <View style={styles.inputWrapper}>
            <Feather name="mail" color="#085334" size={20} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email Address"
              placeholderTextColor="#A0AEC0"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {/* 3. FIXED: Main Password Field */}
          <View style={styles.inputWrapper}>
            <Feather name="lock" color="#085334" size={20} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#A0AEC0"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
              <Feather name={showPassword ? 'eye-off' : 'eye'} color="#718096" size={20} />
            </TouchableOpacity>
          </View>

          {/* 4. FIXED: Confirm Password Field */}
          <View style={styles.inputWrapper}>
            <Feather name="lock" color="#085334" size={20} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Confirm Password"
              placeholderTextColor="#A0AEC0"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
              <Feather name={showPassword ? 'eye-off' : 'eye'} color="#718096" size={20} />
            </TouchableOpacity>
          </View>

          {/* 5. FIXED: Points to handleRegister & handles Loading states */}
          <TouchableOpacity 
            style={[styles.primaryButton, isLoading && { opacity: 0.7 }]} 
            onPress={handleRegister}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Sign Up</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.dividerContainer}>
          <Text style={styles.dividerText}>Or continue with</Text>
        </View>

        <View style={styles.socialContainer}>
          <TouchableOpacity style={styles.socialButton} onPress={handleGoogleLogin}>
            <Text style={styles.socialButtonText}>Continue with Google</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.socialButton} onPress={handleFacebookLogin}>
            <Text style={styles.socialButtonText}>Continue with Facebook</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/login')}>
            <Text style={styles.linkText}>Sign In</Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  innerContainer: { 
    flex: 1, 
    paddingHorizontal: 28, 
    justifyContent: 'center' 
  },
  headerContainer: { 
    marginBottom: 40 
  },
  title: { 
    fontSize: 34, 
    fontWeight: 'bold', 
    color: '#000000', 
    lineHeight: 42,
    marginBottom: 12, 
  },
  brandText: {
    color: '#276916', 
  },
  subtitle: { 
    fontSize: 13, 
    color: '#0e9b59',
    lineHeight: 18,
  },
  form: { 
    width: '100%', 
    marginBottom: 20 
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f5ef',
    borderRadius: 30, 
    paddingHorizontal: 20,
    height: 58,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#1A202C',
    height: '100%',
  },
  eyeIcon: {
    padding: 4,
  },
  primaryButton: {
    backgroundColor: '#204d3a',
    borderRadius: 30,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: '#15492f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  buttonText: { 
    color: '#FFFFFF', 
    fontSize: 16, 
    fontWeight: '600' 
  },
  dividerContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerText: {
    color: '#0c9c6c',
    fontSize: 14,
  },
  socialContainer: {
    gap: 12,
    marginBottom: 32,
  },
  socialButton: {
    backgroundColor: '#f3fdec',
    borderRadius: 30,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  socialButtonText: {
    color: '#1A202C',
    fontSize: 15,
    fontWeight: '500',
  },
  footer: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  footerText: { 
    color: '#3e973b', 
    fontSize: 14 
  },
  linkText: { 
    color: '#07756c' ,
    fontWeight: 'bold', 
    fontSize: 14 
  }
});