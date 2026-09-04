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
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  ink: '#0F5143',
  inkSoft: '#475569',
  muted: '#94A3B8',
  hairline: '#F1F5F9', // Subtle and soft line
  brand: '#0F5143',
  brandSoft: '#F0F7F5',
  brandBorder: '#E2EEEB',
  accent: '#C9A227',
  danger: '#EF4444',
  dangerSoft: '#FEF2F2',
};

// Soft and flat shadow approach
const SHADOW = {
  card: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.03,
      shadowRadius: 6,
    },
    android: { elevation: 1 },
  }),
};

const getLocalDateString = (year: number, monthIndex: number, day: number) => {
  const d = new Date(year, monthIndex, day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${date}`;
};

export default function AllowanceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const allowanceId = params.id as string;

  const [selectedSpender, setSelectedSpender] = useState<{ id: string; name: string; email: string } | null>(null);
  const [allowanceName, setAllowanceName] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [isCustomDate, setIsCustomDate] = useState(false);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const autoStart = getLocalDateString(currentYear, currentMonth, 1);
  const autoEnd = getLocalDateString(currentYear, currentMonth + 1, 0);

  const [startDate, setStartDate] = useState(autoStart);
  const [endDate, setEndDate] = useState(autoEnd);

  useEffect(() => {
    if (params.spenderId) {
      setSelectedSpender({
        id: params.spenderId as string,
        name: params.spenderName as string,
        email: (params.spenderEmail as string) || ''
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
        .select('*, profiles:spender_id(full_name)')
        .eq('id', allowanceId)
        .single();

      if (error) throw error;

      setAllowanceName(data.allowance_name);
      setAmount(data.amount.toString());
      setStartDate(data.start_date);
      setEndDate(data.end_date);
      setIsCustomDate(true);
      setSelectedSpender({
        id: data.spender_id,
        name: data.profiles?.full_name || 'Member',
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
    setStartDate(autoStart);
    setEndDate(autoEnd);
    setRefreshing(false);
  };

  const handleSaveAllowance = async () => {
    if (!selectedSpender) {
      Alert.alert("Member Required", "Please select a member first.");
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (!allowanceName.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Required Fields", "Please provide a valid name and positive amount.");
      return;
    }

    const finalStart = isCustomDate ? startDate : autoStart;
    const finalEnd = isCustomDate ? endDate : autoEnd;

    if (isCustomDate && (!finalStart.trim() || !finalEnd.trim())) {
      Alert.alert("Required Dates", "Please provide both start and end dates.");
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const payload = {
        sponsor_id: user.id,
        spender_id: selectedSpender.id,
        allowance_name: allowanceName.trim(),
        amount: parsedAmount,
        start_date: finalStart,
        end_date: finalEnd
      };

      if (allowanceId) {
        const { error } = await supabase
          .from('allowances')
          .update(payload)
          .eq('id', allowanceId);

        if (error) throw error;
        Alert.alert("Success 🎉", "Allowance updated successfully!");
      } else {
        const { error } = await supabase
          .from('allowances')
          .insert([payload]);

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
        {/* Top Bar */}
        <TouchableOpacity style={styles.backButton} activeOpacity={0.7} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={16} color={COLORS.brand} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>

        {/* Page Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{allowanceId ? 'Edit Allowance' : 'Set Allowance'}</Text>
          <Text style={styles.mainSubtitle}>Select a spender and allocate allowance.</Text>
        </View>

        {/* Card 1: Member Section */}
        <View style={[styles.card, SHADOW.card]}>
          <Text style={styles.sectionTitle}>Target Member</Text>
          {selectedSpender ? (
            <View style={styles.selectedSpenderCard}>
              <View style={styles.avatarIcon}>
                <Ionicons name="person" size={16} color={COLORS.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.spenderName}>{selectedSpender.name}</Text>
                <Text style={styles.spenderEmail}>{selectedSpender.email || 'Beneficiary'}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedSpender(null)} style={styles.removeButton}>
                <Ionicons name="close" size={16} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.selectMemberButton} activeOpacity={0.7} onPress={() => router.push('/(sponsorTabs)/members')}>
              <Ionicons name="add-circle-outline" size={18} color={COLORS.brand} />
              <Text style={styles.selectMemberText}>Select a Member to allocate</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Card 2: Form Details */}
        <View style={[styles.card, SHADOW.card, { gap: 14 }]}>
          <Text style={styles.sectionTitle}>Allowance Details</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Allowance Name</Text>
            <TextInput 
              style={styles.input} 
              value={allowanceName} 
              onChangeText={setAllowanceName} 
              placeholder="e.g. August Allowance" 
              placeholderTextColor={COLORS.muted} 
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Amount (PHP)</Text>
            <View style={styles.amountWrapper}>
              <Text style={styles.currencyPrefix}>₱</Text>
              <TextInput 
                style={[styles.input, styles.amountInput]} 
                keyboardType="decimal-pad" 
                value={amount} 
                onChangeText={setAmount} 
                placeholder="0.00" 
                placeholderTextColor={COLORS.muted} 
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>Coverage Period</Text>
              <View style={styles.row}>
                <Text style={styles.switchLabel}>Custom</Text>
                <Switch 
                  value={isCustomDate} 
                  onValueChange={setIsCustomDate} 
                  trackColor={{ true: COLORS.brand, false: COLORS.hairline }} 
                  thumbColor="#FFFFFF" 
                />
              </View>
            </View>
            
            {isCustomDate ? (
              <View style={styles.customDateContainer}>
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="Start (YYYY-MM-DD)" value={startDate} onChangeText={setStartDate} placeholderTextColor={COLORS.muted} />
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="End (YYYY-MM-DD)" value={endDate} onChangeText={setEndDate} placeholderTextColor={COLORS.muted} />
              </View>
            ) : (
              <View style={styles.dateDisplay}>
                <Ionicons name="calendar-outline" size={16} color={COLORS.brand} />
                <Text style={styles.dateText}>{now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Primary Action Button */}
        <TouchableOpacity style={styles.saveButton} activeOpacity={0.85} onPress={handleSaveAllowance} disabled={loading}>
          {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>{allowanceId ? 'Update Allocation' : 'Confirm Allocation'}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.bg, 
    paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0 
  },
  content: { 
    paddingHorizontal: 16, 
    paddingBottom: 32,
    gap: 12,
  },
  backButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    marginTop: 8,
    marginBottom: 4,
  },
  backButtonText: { 
    fontSize: 13, 
    fontWeight: '600', 
    color: COLORS.brand 
  },
  header: { 
    marginBottom: 4 
  },
  headerTitle: { 
    fontSize: 22, 
    fontWeight: '700', 
    color: COLORS.brand, 
    letterSpacing: -0.3 
  },
  mainSubtitle: { 
    fontSize: 13, 
    color: COLORS.inkSoft, 
    marginTop: 2 
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.hairline,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  inputGroup: { 
    gap: 6 
  },
  label: { 
    fontSize: 12, 
    fontWeight: '600', 
    color: COLORS.inkSoft 
  },
  input: { 
    backgroundColor: COLORS.bg, 
    paddingHorizontal: 12, 
    borderRadius: 10, 
    borderWidth: 1, 
    borderColor: COLORS.hairline, 
    height: 44, 
    color: COLORS.brand, 
    fontSize: 14, 
    fontWeight: '500' 
  },
  amountWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  currencyPrefix: {
    position: 'absolute',
    left: 12,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.brand,
    zIndex: 1,
  },
  amountInput: {
    paddingLeft: 28,
  },
  rowBetween: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  row: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6 
  },
  switchLabel: { 
    fontSize: 12, 
    color: COLORS.inkSoft, 
    fontWeight: '500' 
  },
  selectMemberButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 12, 
    backgroundColor: COLORS.brandSoft, 
    borderRadius: 10, 
    borderWidth: 1, 
    borderColor: COLORS.brandBorder,
    gap: 6,
  },
  selectMemberText: { 
    color: COLORS.brand, 
    fontWeight: '600', 
    fontSize: 13 
  },
  selectedSpenderCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 10, 
    backgroundColor: COLORS.brandSoft, 
    borderRadius: 10, 
    borderWidth: 1, 
    borderColor: COLORS.brandBorder,
    gap: 10,
  },
  avatarIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spenderName: { 
    fontSize: 14, 
    fontWeight: '700', 
    color: COLORS.brand 
  },
  spenderEmail: {
    fontSize: 11,
    color: COLORS.inkSoft,
  },
  removeButton: { 
    padding: 6,
    backgroundColor: COLORS.dangerSoft,
    borderRadius: 8,
  },
  customDateContainer: { 
    flexDirection: 'row',
    gap: 8,
  },
  dateDisplay: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: COLORS.bg, 
    paddingHorizontal: 12, 
    height: 44,
    borderRadius: 10, 
    gap: 8, 
    borderWidth: 1, 
    borderColor: COLORS.hairline 
  },
  dateText: { 
    fontSize: 13, 
    fontWeight: '600', 
    color: COLORS.brand 
  },
  saveButton: { 
    backgroundColor: COLORS.brand, 
    height: 48, 
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginTop: 4,
  },
  saveButtonText: { 
    color: '#FFF', 
    fontWeight: '700', 
    fontSize: 14, 
    letterSpacing: 0.2 
  }
});