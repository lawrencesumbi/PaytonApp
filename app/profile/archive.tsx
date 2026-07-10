import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { StatusBar as NativeStatusBar, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function ArchiveScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Data Vault Archive</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.centerContainer}>
        <View style={styles.iconCircle}>
          <Ionicons name="archive-outline" size={40} color="#3AA39F" />
        </View>
        <Text style={styles.mainTitle}>Archive Empty</Text>
        <Text style={styles.subTitle}>You have no archived data loops or hidden records at this moment.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFBFD', paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, height: 60 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#EDF2F7' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  iconCircle: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#EBF6F5', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  mainTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 8 },
  subTitle: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22 }
});