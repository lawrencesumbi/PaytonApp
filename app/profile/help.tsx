import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, Platform, StatusBar as NativeStatusBar, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

export default function HelpScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help Desk</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>Frequently Asked Questions</Text>
        
        {[
          { q: "How do I update my email?", a: "Registered email addresses are locked for security. Please contact our main server administrators to submit an update request." },
          { q: "Is my balance ledger encrypted?", a: "Yes, Payton uses end-to-end Row Level Security protocols integrated securely via Supabase database networks." },
          { q: "How long do image uploads take?", a: "Avatar uploads stream in real-time, generally updating within 2-5 seconds depending on network bandwidth." }
        ].map((faq, idx) => (
          <View key={idx} style={styles.faqCard}>
            <Text style={styles.questionText}>{faq.q}</Text>
            <Text style={styles.answerText}>{faq.a}</Text>
          </View>
        ))}

        <TouchableOpacity style={styles.contactBtn} onPress={() => Alert.alert("Support Ticket", "Creating a support line... Our staff will reach out to your email shortly.")}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.contactBtnText}>Open Live Support Ticket</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFBFD', paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, height: 60 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#EDF2F7' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 16, letterSpacing: 0.5 },
  faqCard: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  questionText: { fontSize: 14, fontWeight: '600', color: '#1E293B', marginBottom: 6 },
  answerText: { fontSize: 13, color: '#64748B', lineHeight: 20 },
  contactBtn: { backgroundColor: '#3AA39F', height: 50, borderRadius: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 12 },
  contactBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' }
});