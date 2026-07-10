import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StatusBar as NativeStatusBar, Platform, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    try {
      setIsUpdating(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      Alert.alert("Success", "Your password has been updated successfully!", [
        { text: "OK", onPress: () => router.back() }
      ]);
    } catch (error: any) {
      Alert.alert("Update Failed", error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Security & Password</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.instruction}>Enter your new password below to secure your account.</Text>
        
        <View style={styles.inputBlock}>
          <Text style={styles.inputLabel}>New Password</Text>
          <TextInput 
            style={styles.textInput} 
            value={newPassword} 
            onChangeText={setNewPassword} 
            placeholder="Min. 6 characters"
            secureTextEntry
            placeholderTextColor="#94A3B8"
          />
        </View>

        <View style={styles.inputBlock}>
          <Text style={styles.inputLabel}>Confirm New Password</Text>
          <TextInput 
            style={styles.textInput} 
            value={confirmPassword} 
            onChangeText={setConfirmPassword} 
            placeholder="Repeat new password"
            secureTextEntry
            placeholderTextColor="#94A3B8"
          />
        </View>

        <TouchableOpacity 
          style={[styles.primaryBtn, isUpdating && styles.disabledBtn]} 
          onPress={handleChangePassword}
          disabled={isUpdating}
        >
          {isUpdating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>Update Password</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFBFD', paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, height: 60 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#EDF2F7' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  content: { paddingHorizontal: 20, marginTop: 20 },
  instruction: { fontSize: 14, color: '#64748B', marginBottom: 24, lineHeight: 20 },
  inputBlock: { backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 2, letterSpacing: 0.3 },
  textInput: { fontSize: 15, color: '#1E293B', fontWeight: '500', height: 30, padding: 0 },
  primaryBtn: { backgroundColor: '#3AA39F', height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  disabledBtn: { backgroundColor: '#CBD5E1' }
});