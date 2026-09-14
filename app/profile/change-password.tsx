// app/profile/change-password.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { colors } from '../(spenderTabs)/profile';
import { supabase } from '../../lib/supabase';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Modern Curved Header */}
      <View style={styles.modernHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnTouchable}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>Security & Password</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.editScrollContent}>
        <View style={styles.instructionContainer}>
          <Text style={styles.instructionText}>
            Enter your new password below to keep your Payton account secure.
          </Text>
        </View>

        <View style={styles.formCardContainer}>
          {/* New Password Input */}
          <View style={styles.pillInputBlock}>
            <Text style={styles.pillInputLabel}>New Password</Text>
            <View style={styles.passwordInputWrapper}>
              <TextInput 
                style={styles.pillTextInputInside} 
                value={newPassword} 
                onChangeText={setNewPassword} 
                placeholder="Min. 6 characters"
                secureTextEntry={!showNewPassword}
                placeholderTextColor="#94A3B8"
              />
              <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)} style={styles.eyeIconBtn}>
                <Ionicons name={showNewPassword ? "eye-outline" : "eye-off-outline"} size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm Password Input */}
          <View style={styles.pillInputBlock}>
            <Text style={styles.pillInputLabel}>Confirm New Password</Text>
            <View style={styles.passwordInputWrapper}>
              <TextInput 
                style={styles.pillTextInputInside} 
                value={confirmPassword} 
                onChangeText={setConfirmPassword} 
                placeholder="Repeat new password"
                secureTextEntry={!showConfirmPassword}
                placeholderTextColor="#94A3B8"
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIconBtn}>
                <Ionicons name={showConfirmPassword ? "eye-outline" : "eye-off-outline"} size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Save Action Button */}
      <View style={styles.bottomBtnContainer}>
        <TouchableOpacity 
          style={[styles.pillPrimaryActionBtn, isUpdating && styles.disabledButton]} 
          onPress={handleChangePassword}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.pillPrimaryActionBtnText}>UPDATE PASSWORD</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f5fcfa',
  },
  modernHeader: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 44 : 20,
    paddingBottom: 20,
    backgroundColor: colors.headerDark,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  backBtnTouchable: { width: 20 },
  headerTitleCentered: { 
    flex: 1, 
    textAlign: 'center', 
    fontSize: 20, 
    fontWeight: '800', 
    color: '#ffffff', 
    letterSpacing: -0.5 
  },
  editScrollContent: { paddingBottom: 24, flexGrow: 1 },
  instructionContainer: { paddingHorizontal: 24, marginTop: 24, marginBottom: 20 },
  instructionText: { fontSize: 14, color: '#64748B', lineHeight: 20, fontWeight: '400' },
  
  formCardContainer: { paddingHorizontal: 24, gap: 24 },
  pillInputBlock: { gap: 8 },
  pillInputLabel: { fontSize: 13, fontWeight: '500', color: '#94A3B8' },
  
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dbe0e6',
    borderRadius: 30,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
  },
  pillTextInputInside: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1E293B',
    fontWeight: '500',
  },
  eyeIconBtn: { padding: 4 },

  bottomBtnContainer: { paddingHorizontal: 24, paddingBottom: 24, paddingTop: 12 },
  pillPrimaryActionBtn: {
    backgroundColor: '#173D45',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillPrimaryActionBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  disabledButton: { backgroundColor: '#CBD5E1' }
});