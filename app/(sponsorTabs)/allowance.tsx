 // app/(sponsorTabs)/allowance.tsx
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    StatusBar as NativeStatusBar,
    Platform,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { supabase } from '../../lib/supabase';

/* ---------- Match Design Tokens Perfectly from home.tsx ---------- */
const COLORS = {
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  ink: '#0F5143', // updated from dark to match your brand green base text hierarchy
  inkSoft: '#475569',
  muted: '#94A3B8',
  hairline: '#ECEFF3',
  brand: '#0F5143',
  brandSoft: '#E8F2EF',
  brandBorder: '#D2E7E1',
  accent: '#C9A227', // refined gold
  danger: '#DC2626',
};

const SHADOW = {
  card: Platform.select({
    ios: {
      shadowColor: '#0F5143',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.05,
      shadowRadius: 14,
    },
    android: { elevation: 2 },
  }),
};

export default function AllowanceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const allowanceId = params.id as string;

  const [selectedSpender, setSelectedSpender] = useState<{ id: string, name: string, email: string } | null>(null);
  const [allowanceName, setAllowanceName] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [isCustomDate, setIsCustomDate] = useState(false);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');

  const now = new Date();
  const autoStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const autoEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  useEffect(() => {
    if (params.spenderId) {
      setSelectedSpender({
        id: params.spenderId as string,
        name: params.spenderName as string,
        email: params.spenderEmail as string
      });
    }
  }, [params.spenderId, params.spenderName, params.spenderEmail]);

  useEffect(() => {
    if (allowanceId) {
      fetchAllowanceDetails();
    }
  }, [allowanceId]);

  const fetchAllowanceDetails = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('allowances')
        .select('*')
        .eq('id', allowanceId)
        .single();

      if (error) throw error;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', data.spender_id)
        .single();

      setAllowanceName(data.allowance_name);
      setAmount(data.amount.toString());
      setStartDate(data.start_date);
      setEndDate(data.end_date);
      setIsCustomDate(true);
      setSelectedSpender({
        id: data.spender_id,
        name: profileData?.full_name || 'Member',
        email: ''
      });
    } catch (e: any) {
      Alert.alert("Error", "Dili ma-load ang detalye: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    router.setParams({ id: '', spenderId: '', spenderName: '', spenderEmail: '' });
    setAllowanceName('');
    setAmount('');
    setSelectedSpender(null);
    setIsCustomDate(false);
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate('');
    setRefreshing(false);
  };

  const handleSaveAllowance = async () => {
    if (!selectedSpender) {
      Alert.alert("Member Required", "Please select a member first.");
      return;
    }
    if (!allowanceName.trim() || !amount.trim()) {
      Alert.alert("Required Fields", "Please provide a name and amount.");
      return;
    }

    const finalStart = isCustomDate ? startDate : autoStart;
    const finalEnd = isCustomDate ? endDate : autoEnd;

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (allowanceId) {
        const { error } = await supabase
          .from('allowances')
          .update({
            allowance_name: allowanceName,
            amount: parseFloat(amount),
            start_date: finalStart,
            end_date: finalEnd
          })
          .eq('id', allowanceId);
        if (error) throw error;
        Alert.alert("Success 🎉", "Allowance updated successfully!");
      } else {
        const { error } = await supabase.from('allowances').insert([{
          sponsor_id: user.id,
          spender_id: selectedSpender.id,
          allowance_name: allowanceName,
          amount: parseFloat(amount),
          start_date: finalStart,
          end_date: finalEnd
        }]);
        if (error) throw error;
        Alert.alert("Success 🎉", "Allowance allocated successfully!");
      }
      router.back();
    } catch (e: any) { 
      Alert.alert("Error", e.message); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.brand]} tintColor={COLORS.brand} />
        }
      >
        <TouchableOpacity style={styles.backButton} activeOpacity={0.7} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={16} color={COLORS.brand} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.headerTitle}>{allowanceId ? 'Edit Allowance' : 'Set Allowance'}</Text>
          <Text style={styles.mainSubtitle}>Select a spender and allocate allowance.</Text>
          
          {selectedSpender ? (
            <View style={[styles.cardShadow, SHADOW.card]}>
              <View style={styles.selectedSpenderCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.headerSubtitle}>Allocating allowance for:</Text>
                  <Text style={styles.spenderName}>{selectedSpender.name}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedSpender(null)} style={styles.removeButton}>
                  <Ionicons name="close-circle" size={24} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.selectMemberButton} activeOpacity={0.8} onPress={() => router.push('/(sponsorTabs)/members')}>
              <Ionicons name="add-circle" size={20} color={COLORS.brand} />
              <Text style={styles.selectMemberText}>Select a Member to allocate</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Allowance Name</Text>
            <TextInput style={styles.input} value={allowanceName} onChangeText={setAllowanceName} placeholder="e.g. January Allowance" placeholderTextColor={COLORS.muted} />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Amount (PHP)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={COLORS.muted} />
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>Coverage Period</Text>
              <View style={styles.row}>
                <Text style={styles.switchLabel}>Custom</Text>
                <Switch value={isCustomDate} onValueChange={setIsCustomDate} trackColor={{ true: COLORS.brand, false: COLORS.hairline }} thumbColor="#FFFFFF" />
              </View>
            </View>
            
            {isCustomDate ? (
              <View style={styles.customDateContainer}>
                <TextInput style={styles.input} placeholder="Start (YYYY-MM-DD)" value={startDate} onChangeText={setStartDate} placeholderTextColor={COLORS.muted} />
                <TextInput style={styles.input} placeholder="End (YYYY-MM-DD)" value={endDate} onChangeText={setEndDate} placeholderTextColor={COLORS.muted} />
              </View>
            ) : (
              <View style={styles.dateDisplay}>
                <Ionicons name="calendar" size={18} color={COLORS.brand} />
                <Text style={styles.dateText}>{now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity style={styles.saveButton} activeOpacity={0.85} onPress={handleSaveAllowance} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>{allowanceId ? 'Update Allocation' : 'Confirm Allocation'}</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 22, marginTop: 12 },
  backButtonText: { fontSize: 13, fontWeight: '600', color: COLORS.brand },
  header: { marginBottom: 24 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: COLORS.brand, letterSpacing: -0.5 },
  headerSubtitle: { color: COLORS.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  mainSubtitle: { fontSize: 13, color: COLORS.inkSoft, marginTop: 4, marginBottom: 20, lineHeight: 18 },
  form: { gap: 18 },
  inputGroup: { gap: 8 },
  label: { fontSize: 11, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  input: { backgroundColor: COLORS.surface, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: COLORS.hairline, height: 48, color: COLORS.brand, fontSize: 14, fontWeight: '500' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchLabel: { fontSize: 12, color: COLORS.inkSoft, fontWeight: '500' },
  selectMemberButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4, padding: 16, backgroundColor: COLORS.brandSoft, borderRadius: 16, borderStyle: 'dashed', borderWidth: 1, borderColor: COLORS.brandBorder },
  selectMemberText: { color: COLORS.brand, fontWeight: '700', fontSize: 13, marginLeft: 8 },
  cardShadow: { borderRadius: 16, marginTop: 4 },
  selectedSpenderCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.hairline },
  spenderName: { fontSize: 16, fontWeight: '700', color: COLORS.brand, marginTop: 2, letterSpacing: -0.2 },
  removeButton: { padding: 4 },
  customDateContainer: { gap: 10 },
  dateDisplay: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.brandSoft, padding: 14, borderRadius: 14, gap: 10, borderWidth: 1, borderColor: COLORS.brandBorder },
  dateText: { fontSize: 14, fontWeight: '700', color: COLORS.brand },
  saveButton: { backgroundColor: COLORS.brand, padding: 14, borderRadius: 14, alignItems: 'center', marginTop: 10, flexDirection: 'row', justifyContent: 'center', height: 48 },
  saveButtonText: { color: '#FFF', fontWeight: '700', fontSize: 14, letterSpacing: 0.2 }
});