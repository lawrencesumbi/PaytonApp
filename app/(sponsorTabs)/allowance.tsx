// app/(sponsorTabs)/allowance.tsx
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../../lib/supabase';

/* ---------- Design Tokens — aligned with the rest of the app's teal palette ---------- */
const COLORS = {
  screenTeal: '#1F4F59',
  brand: '#173D45',
  surface: '#FFFFFF',
  pillBg: '#F1F5F9',
  softTint: '#F3F7F6',
  ink: '#173D45',
  inkSoft: '#64748B',
  muted: '#94A3B8',
  danger: '#EF4444',
  dangerSoft: '#FEF2F2',
};

const getLocalDateString = (year: number, monthIndex: number, day: number) => {
  const d = new Date(year, monthIndex, day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${date}`;
};

interface SelectedSpender {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

export default function AllowanceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const allowanceId = params.id as string;

  const [selectedSpender, setSelectedSpender] = useState<SelectedSpender | null>(null);
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
        email: (params.spenderEmail as string) || '',
        avatarUrl: (params.spenderAvatarUrl as string) || null // Nakuha na ang avatar gikan sa router params
      });
    }
  }, [params.spenderId, params.spenderName, params.spenderEmail, params.spenderAvatarUrl]);

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
        .select('*, profiles:spender_id(full_name, avatar_url, email)')
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
        email: data.profiles?.email || '',
        avatarUrl: data.profiles?.avatar_url || null
      });
    } catch (e: any) {
      Alert.alert("Error", "Dili ma-load ang detalye: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    router.setParams({ id: '', spenderId: '', spenderName: '', spenderEmail: '', spenderAvatarUrl: '' });
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
    <View style={styles.screenBg}>
      <StatusBar style="light" />

      {/* Thin teal strip with Back button */}
      <View style={styles.headerRow}/>

      {/* White rounded sheet */}
      <View style={styles.whiteSheet}>
        <ScrollView 
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.brand]} tintColor={COLORS.brand} />
          }
        >
          {/* Page Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{allowanceId ? 'Edit Allowance' : 'Set Allowance'}</Text>
            <Text style={styles.mainSubtitle}>Select a spender and allocate allowance.</Text>
          </View>

          {/* Target Member */}
          <Text style={styles.sectionTitle}>Target Member</Text>
          {selectedSpender ? (
            <View style={styles.selectedSpenderCard}>
              <View style={styles.avatarContainer}>
                {selectedSpender.avatarUrl ? (
                  <Image source={{ uri: selectedSpender.avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={16} color={COLORS.brand} />
                )}
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
              <View style={styles.addCircleOutline}>
                <Ionicons name="add" size={26} color={COLORS.brand} />
              </View>
              <Text style={styles.selectMemberText}>Select a Member to Allocate</Text>
            </TouchableOpacity>
          )}

          {/* Allowance Details */}
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Allowance Details</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Allowance Name</Text>
            <TextInput 
              style={styles.pillInput} 
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
                style={[styles.pillInput, styles.amountInput]} 
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
                  trackColor={{ true: COLORS.brand, false: COLORS.pillBg }} 
                  thumbColor="#FFFFFF" 
                />
              </View>
            </View>
            
            {isCustomDate ? (
              <View style={styles.customDateContainer}>
                <TextInput 
                  style={[styles.pillInput, styles.dateInput]} 
                  placeholder="Start (YYYY-MM-DD)" 
                  value={startDate} 
                  onChangeText={setStartDate} 
                  placeholderTextColor={COLORS.muted}
                  textAlign="center"
                />
                <TextInput 
                  style={[styles.pillInput, styles.dateInput]} 
                  placeholder="End (YYYY-MM-DD)" 
                  value={endDate} 
                  onChangeText={setEndDate} 
                  placeholderTextColor={COLORS.muted}
                  textAlign="center"
                />
              </View>
            ) : (
              <View style={styles.dateDisplay}>
                <Ionicons name="calendar-outline" size={16} color={COLORS.brand} />
                <Text style={styles.dateText}>{now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</Text>
              </View>
            )}
          </View>

          {/* Primary Action Button */}
          <TouchableOpacity style={styles.saveButton} activeOpacity={0.85} onPress={handleSaveAllowance} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>{allowanceId ? 'Update Allocation' : 'Confirm Allocation'}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenBg: {
    flex: 1,
    backgroundColor: COLORS.screenTeal,
  },
  headerRow: {
    height: 40,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  whiteSheet: {
    flex: 1,
    backgroundColor: COLORS.softTint,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },

  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  mainSubtitle: {
    fontSize: 14,
    color: COLORS.inkSoft,
    marginTop: 4,
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },

  /* Select Member */
  selectMemberButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    gap: 10,
  },
  addCircleOutline: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: COLORS.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectMemberText: {
    color: COLORS.brand,
    fontWeight: '600',
    fontSize: 15,
  },
  selectedSpenderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    gap: 12,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.softTint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  spenderName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.brand,
  },
  spenderEmail: {
    fontSize: 12,
    color: COLORS.inkSoft,
  },
  removeButton: {
    padding: 7,
    backgroundColor: COLORS.dangerSoft,
    borderRadius: 10,
  },

  /* Form fields */
  inputGroup: {
    gap: 8,
    marginTop: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  pillInput: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 20,
    borderRadius: 30,
    height: 50,
    color: COLORS.brand,
    fontSize: 15,
    fontWeight: '500',
  },
  amountWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  currencyPrefix: {
    position: 'absolute',
    left: 20,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.brand,
    zIndex: 1,
  },
  amountInput: {
    paddingLeft: 36,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  switchLabel: {
    fontSize: 13,
    color: COLORS.inkSoft,
    fontWeight: '500',
  },

  customDateContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  dateInput: {
    flex: 1,
  },
  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.pillBg,
    paddingHorizontal: 20,
    height: 50,
    borderRadius: 30,
    gap: 8,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.brand,
  },

  saveButton: {
    backgroundColor: COLORS.brand,
    height: 56,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
  },
  saveButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.2,
  },
});