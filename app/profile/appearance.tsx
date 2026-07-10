import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Platform, StatusBar as NativeStatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

export default function AppearanceScreen() {
  const router = useRouter();
  const [selectedTheme, setSelectedTheme] = useState('light');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Display & UI</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionLabel}>Theme Preferences</Text>
        
        {[
          { id: 'light', label: 'Light Mode', icon: 'sunny-outline' },
          { id: 'dark', label: 'Dark Mode (Coming Soon)', icon: 'moon-outline', disabled: true },
          { id: 'system', label: 'System Default', icon: 'cog-outline', disabled: true },
        ].map((theme) => (
          <TouchableOpacity 
            key={theme.id} 
            style={[styles.rowItem, selectedTheme === theme.id && styles.activeRow]}
            onPress={() => !theme.disabled && setSelectedTheme(theme.id)}
            disabled={theme.disabled}
          >
            <View style={styles.rowLeft}>
              <Ionicons name={theme.icon as any} size={20} color={theme.disabled ? "#94A3B8" : "#475569"} style={{ marginRight: 12 }} />
              <Text style={[styles.rowLabel, theme.disabled && styles.disabledText]}>{theme.label}</Text>
            </View>
            {selectedTheme === theme.id && <Ionicons name="checkmark-circle" size={20} color="#3AA39F" />}
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFBFD', paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, height: 60 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#EDF2F7' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  content: { paddingHorizontal: 20, marginTop: 24 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 12, letterSpacing: 0.5 },
  rowItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#F1F5F9' },
  activeRow: { borderColor: '#3AA39F', backgroundColor: '#F0F9F8' },
  rowLeft: { flexDirection: 'row', alignItems: 'center' },
  rowLabel: { fontSize: 14, fontWeight: '500', color: '#1E293B' },
  disabledText: { color: '#94A3B8' }
});