// app/terms.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../(spenderTabs)/profile'; // Adjust ang import path depende kung asa gikan ang imong colors

export default function TermsScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Modern Curved Header */}
      <View style={styles.modernHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnTouchable}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>Terms of Use</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.cardContainer}>
          <Text style={styles.lastUpdated}>Last updated: June 2026</Text>
          
          <Text style={styles.heading}>1. Acceptance of Terms</Text>
          <Text style={styles.paragraph}>By configuring an account inside the Payton Mobile Application ledger ecosystem, you explicitly assent and agree to remain bound to all legal criteria drafted here.</Text>
          
          <Text style={styles.heading}>2. User Account Privacy</Text>
          <Text style={styles.paragraph}>Account verification protocols rely heavily on accurate data nodes. You are heavily advised to secure your authorization tokens and session keys from third party actors.</Text>
          
          <Text style={styles.heading}>3. Financial Data & Ledgers</Text>
          <Text style={styles.paragraph}>Payton works strictly as an administrative portfolio system tracking client profiles and metadata. We carry no immediate liability regarding peripheral asset shifts outside internal architecture fields.</Text>
        </View>
      </ScrollView>
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
  scrollContent: { 
    paddingHorizontal: 24, 
    paddingTop: 24, 
    paddingBottom: 40 
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  lastUpdated: { 
    fontSize: 12, 
    color: '#94A3B8', 
    marginBottom: 20,
    fontWeight: '500'
  },
  heading: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#1E293B', 
    marginTop: 16, 
    marginBottom: 6 
  },
  paragraph: { 
    fontSize: 14, 
    color: '#64748B', 
    lineHeight: 22, 
    marginBottom: 12 
  }
});