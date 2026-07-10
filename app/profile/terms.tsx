import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { StatusBar as NativeStatusBar, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function TermsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Use</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Last updated: June 2026</Text>
        
        <Text style={styles.heading}>1. Acceptance of Terms</Text>
        <Text style={styles.paragraph}>By configuring an account inside the Payton Mobile Application ledger ecosystem, you explicitly assent and agree to remain bound to all legal criteria drafted here.</Text>
        
        <Text style={styles.heading}>2. User Account Privacy</Text>
        <Text style={styles.paragraph}>Account verification protocols rely heavily on accurate data nodes. You are heavily advised to secure your authorization tokens and session keys from third party actors.</Text>
        
        <Text style={styles.heading}>3. Financial Data & Ledgers</Text>
        <Text style={styles.paragraph}>Payton works strictly as an administrative portfolio system tracking client profiles and metadata. We carry no immediate liability regarding peripheral asset shifts outside internal architecture fields.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFBFD', paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, height: 60 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#EDF2F7' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  lastUpdated: { fontSize: 12, color: '#94A3B8', marginBottom: 20 },
  heading: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginTop: 16, marginBottom: 6 },
  paragraph: { fontSize: 13, color: '#64748B', lineHeight: 22, marginBottom: 12 }
});