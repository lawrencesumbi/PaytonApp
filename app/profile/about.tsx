import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { StatusBar as NativeStatusBar, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function AboutScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>App Version</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>P</Text>
        </View>

        <Text style={styles.appName}>Payton Mobile Edition</Text>
        <Text style={styles.versionNumber}>v2.4.1 (Stable Build)</Text>
        
        <View style={styles.infoGroup}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Database Engine</Text>
            <Text style={styles.infoValue}>Supabase PostgreSQL</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Framework Context</Text>
            <Text style={styles.infoValue}>React Native (Expo)</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>System Status</Text>
            <Text style={styles.statusValue}>Operational</Text>
          </View>
        </View>

        <Text style={styles.copyright}>© 2026 Payton Labs. All rights reserved.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFBFD', paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, height: 60 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#EDF2F7' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  content: { flex: 1, alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 },
  logoBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#3AA39F', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  logoText: { fontSize: 36, fontWeight: '800', color: '#FFFFFF' },
  appName: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  versionNumber: { fontSize: 13, color: '#94A3B8', fontWeight: '500', marginBottom: 32 },
  infoGroup: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', paddingVertical: 4, paddingHorizontal: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#FAFBFD' },
  infoLabel: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  infoValue: { fontSize: 13, color: '#1E293B', fontWeight: '600' },
  statusValue: { fontSize: 13, color: '#10B981', fontWeight: '700' },
  copyright: { position: 'absolute', bottom: 30, fontSize: 12, color: '#94A3B8' }
});