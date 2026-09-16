// app/help.tsx (o kung asa man nahimutang ang imong help screen)
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../(spenderTabs)/profile'; // Adjust ang import path depende kung asa gikan ang imong colors

export default function HelpScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Modern Curved Header */}
      <View style={styles.modernHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnTouchable}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>Help Desk</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>Frequently Asked Questions</Text>
        
        {[
          { q: "How do I update my email?", a: "Registered email addresses are locked for security. Please contact our administrators to submit an update request." },
          { q: "How do I reset my password?", a: "You can securely reset your password by tapping 'Forgot Password' on the login screen, or via your profile settings if you are currently logged in." },
          { q: "Is my balance ledger encrypted?", a: "Yes, Payton uses end-to-end Row Level Security protocols integrated securely via Supabase database networks." },
          { q: "How long do image uploads take?", a: "Avatar uploads stream in real-time, generally updating within 2-5 seconds depending on network bandwidth." }
        ].map((faq, idx) => (
          <View key={idx} style={styles.faqCard}>
            <Text style={styles.questionText}>{faq.q}</Text>
            <Text style={styles.answerText}>{faq.a}</Text>
          </View>
        ))}

        <TouchableOpacity 
          style={styles.pillPrimaryActionBtn} 
          onPress={() => Alert.alert("Support Ticket", "Creating a support line... Our staff will reach out to your email shortly.")}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.pillPrimaryActionBtnText}>OPEN LIVE SUPPORT TICKET</Text>
        </TouchableOpacity>
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
  sectionLabel: { 
    fontSize: 12, 
    fontWeight: '700', 
    color: '#94A3B8', 
    textTransform: 'uppercase', 
    marginBottom: 16, 
    letterSpacing: 0.5 
  },
  faqCard: { 
    backgroundColor: '#FFFFFF', 
    padding: 20, 
    borderRadius: 20, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  questionText: { 
    fontSize: 15, 
    fontWeight: '700', 
    color: '#1E293B', 
    marginBottom: 6 
  },
  answerText: { 
    fontSize: 14, 
    color: '#64748B', 
    lineHeight: 22 
  },
  pillPrimaryActionBtn: {
    backgroundColor: '#173D45',
    borderRadius: 30,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  pillPrimaryActionBtnText: { 
    color: '#FFFFFF', 
    fontSize: 15, 
    fontWeight: '700', 
    letterSpacing: 0.5 
  }
});