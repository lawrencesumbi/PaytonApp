// app/archive.tsx (o kung asa man nahimutang ang imong archive screen)
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../(spenderTabs)/profile'; // Adjust ang import path depende kung asa gikan ang imong colors

export default function ArchiveScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Modern Curved Header */}
      <View style={styles.modernHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnTouchable}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>Data Vault Archive</Text>
        <View style={{ width: 20 }} />
      </View>

      <View style={styles.centerContainer}>
        <View style={styles.iconCircle}>
          <Ionicons name="archive-outline" size={40} color="#173D45" />
        </View>
        <Text style={styles.mainTitle}>Archive Empty</Text>
        <Text style={styles.subTitle}>You have no archived data loops or hidden records at this moment.</Text>
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
  centerContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingHorizontal: 40 
  },
  iconCircle: { 
    width: 80, 
    height: 80, 
    borderRadius: 24, 
    backgroundColor: '#EBF6F5', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 20 
  },
  mainTitle: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: '#1E293B', 
    marginBottom: 8 
  },
  subTitle: { 
    fontSize: 14, 
    color: '#64748B', 
    textAlign: 'center', 
    lineHeight: 22 
  }
});