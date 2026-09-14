// app/logs.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../(spenderTabs)/profile'; // Adjust ang import path depende kung asa gikan ang imong colors

export default function ActivityLogsScreen() {
  const router = useRouter();

  // Mock activity logs data - i-connect lang sa imong Supabase backend kung naa na
  const logs = [
    { id: '1', title: 'Password Updated', description: 'Successfully changed account security credentials.', time: 'Today, 2:45 PM', icon: 'key-outline', type: 'security' },
    { id: '2', title: 'Portfolio Exported', description: 'Generated and emailed statement CSV ledger report.', time: 'Yesterday, 10:20 AM', icon: 'cloud-download-outline', type: 'export' },
    { id: '3', title: 'Profile Updated', description: 'Modified user account personal details and avatar.', time: 'Oct 12, 4:15 PM', icon: 'person-outline', type: 'profile' },
    { id: '4', title: 'Secure Login Session', description: 'Authorized access via Supabase Auth network node.', time: 'Oct 10, 9:00 AM', icon: 'shield-checkmark-outline', type: 'auth' },
  ];

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Modern Curved Header */}
      <View style={styles.modernHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnTouchable}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>Activity Logs</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>Recent System Transactions</Text>
        
        {logs.map((item) => (
          <View key={item.id} style={styles.logCard}>
            <View style={styles.iconCircle}>
              <Ionicons name={item.icon as any} size={20} color="#173D45" />
            </View>
            <View style={styles.logInfo}>
              <View style={styles.logHeaderRow}>
                <Text style={styles.logTitle}>{item.title}</Text>
                <Text style={styles.logTime}>{item.time}</Text>
              </View>
              <Text style={styles.logDesc}>{item.description}</Text>
            </View>
          </View>
        ))}
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
  logCard: { 
    backgroundColor: '#FFFFFF', 
    padding: 16, 
    borderRadius: 20, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#EBF6F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  logInfo: {
    flex: 1,
  },
  logHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  logTitle: { 
    fontSize: 15, 
    fontWeight: '700', 
    color: '#1E293B', 
  },
  logTime: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  logDesc: { 
    fontSize: 13, 
    color: '#64748B', 
    lineHeight: 18 
  },
});