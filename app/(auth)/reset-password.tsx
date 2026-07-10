import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase'; // Adjust this path to match your project structure

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleUpdatePassword = async () => {
    if (!password) {
      Alert.alert("Error", "Please enter a new password.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    setLoading(true);

    // Because the user clicked the email link, Supabase has already 
    // initialized a session behind the scenes. We just update the current user.
    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    setLoading(false);

    if (error) {
      Alert.alert("Update Failed", error.message);
    } else {
      Alert.alert(
        "Success", 
        "Your password has been updated successfully! Please log in with your new password.",
        [
          { text: "OK", onPress: () => router.replace('/login') } // Route back to your login screen path
        ]
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.innerContainer}>
        <View style={styles.headerContainer}>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>Enter your new password below to regain access to your account.</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputWrapper}>
            <Feather name="lock" color="#085334" size={20} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="New Password"
              placeholderTextColor="#A0AEC0"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              editable={!loading}
            />
          </View>

          <View style={styles.inputWrapper}>
            <Feather name="lock" color="#085334" size={20} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Confirm New Password"
              placeholderTextColor="#A0AEC0"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              editable={!loading}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
              <Feather name={showPassword ? 'eye-off' : 'eye'} color="#718096" size={20} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            style={[styles.primaryButton, loading && { opacity: 0.8 }]} 
            onPress={handleUpdatePassword}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Update Password</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  innerContainer: { flex: 1, paddingHorizontal: 28, justifyContent: 'center' },
  headerContainer: { marginBottom: 40 },
  title: { fontSize: 34, fontWeight: 'bold', color: '#000000', marginBottom: 12 },
  subtitle: { fontSize: 14, color: '#666', lineHeight: 20 },
  form: { width: '100%' },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f5ef',
    borderRadius: 30,
    paddingHorizontal: 20,
    height: 58,
    marginBottom: 18,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 15, color: '#1A202C', height: '100%' },
  eyeIcon: { padding: 4 },
  primaryButton: {
    backgroundColor: '#204d3a',
    borderRadius: 30,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});