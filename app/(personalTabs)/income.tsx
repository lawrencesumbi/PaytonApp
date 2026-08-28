import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    StatusBar as NativeStatusBar,
    Platform,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface IncomeItem {
  id: string;
  user_id: string;
  source_name: string;
  amount: number;
  start_date: string;
  end_date: string;
  received_at: string;
}

export default function IncomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [incomes, setIncomes] = useState<IncomeItem[]>([]);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingIncome, setEditingIncome] = useState<IncomeItem | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [amount, setAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchIncomes = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('income')
        .select('*')
        .eq('user_id', user.id)
        .order('start_date', { ascending: false });

      if (error) throw error;
      setIncomes(data || []);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchIncomes();
  }, []);

  const handleOpenAddModal = () => {
    const d = new Date();
    const todayStr = d.toISOString().split('T')[0];

    setEditingIncome(null);
    setSourceName('');
    setAmount('');
    setStartDate(todayStr);
    setEndDate('');
    setModalVisible(true);
  };

  const handleOpenEditModal = (item: IncomeItem) => {
    setEditingIncome(item);
    setSourceName(item.source_name);
    setAmount(String(item.amount));
    setStartDate(item.start_date);
    setEndDate(item.end_date);
    setModalVisible(true);
  };

  const handleSaveIncome = async () => {
    if (!sourceName.trim() || !amount.trim() || !startDate.trim() || !endDate.trim()) {
      Alert.alert('Validation Error', 'Please fill in all required fields.');
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid amount.');
      return;
    }

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const payload = {
        user_id: user.id,
        source_name: sourceName.trim(),
        amount: parsedAmount,
        start_date: startDate,
        end_date: endDate,
        received_at: editingIncome ? editingIncome.received_at : new Date().toISOString(),
      };

      if (editingIncome) {
        const { error } = await supabase
          .from('income')
          .update(payload)
          .eq('id', editingIncome.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('income').insert([payload]);
        if (error) throw error;
      }

      setModalVisible(false);
      fetchIncomes();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteIncome = (id: string) => {
    Alert.alert(
      'Delete Income',
      'Are you sure you want to delete this income record?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('income').delete().eq('id', id);
              if (error) throw error;
              fetchIncomes();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  // Status helper based on local date
  const isIncomeActive = (start: string, end: string) => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return start <= today && end >= today;
  };

  const activeIncomes = incomes.filter((i) => isIncomeActive(i.start_date, i.end_date));
  const inactiveIncomes = incomes.filter((i) => !isIncomeActive(i.start_date, i.end_date));

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.loadingCenter]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#38B2AC" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.iconCircleButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Income Sources</Text>
          <TouchableOpacity style={styles.iconCircleButton} onPress={handleOpenAddModal}>
            <Ionicons name="add-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchIncomes(); }} colors={['#1B494E']} />
        }
      >
        <View style={styles.bodyCard}>
          {/* Active Income Section */}
          <Text style={styles.sectionTitle}>Active Income</Text>
          {activeIncomes.length === 0 ? (
            <Text style={styles.emptyText}>No active income stream found.</Text>
          ) : (
            activeIncomes.map((item) => (
              <IncomeCard
                key={item.id}
                item={item}
                isActive={true}
                onEdit={() => handleOpenEditModal(item)}
                onDelete={() => handleDeleteIncome(item.id)}
              />
            ))
          )}

          {/* Inactive / Past Income Section */}
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Past & Inactive Income</Text>
          {inactiveIncomes.length === 0 ? (
            <Text style={styles.emptyText}>No inactive income records.</Text>
          ) : (
            inactiveIncomes.map((item) => (
              <IncomeCard
                key={item.id}
                item={item}
                isActive={false}
                onEdit={() => handleOpenEditModal(item)}
                onDelete={() => handleDeleteIncome(item.id)}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* Add / Edit Modal */}
      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>{editingIncome ? 'Edit Income' : 'Add Income'}</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Source Name (e.g. Allowance, Salary)"
              placeholderTextColor="#94A3B8"
              value={sourceName}
              onChangeText={setSourceName}
            />

            <TextInput
              style={styles.modalInput}
              placeholder="Amount (₱)"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
            />

            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Start Date</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94A3B8"
                  value={startDate}
                  onChangeText={setStartDate}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>End Date</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94A3B8"
                  value={endDate}
                  onChangeText={setEndDate}
                />
              </View>
            </View>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelBtn]} onPress={() => setModalVisible(false)} disabled={submitting}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.confirmBtn]} onPress={handleSaveIncome} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>{editingIncome ? 'Update' : 'Save'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Item Component
function IncomeCard({ item, isActive, onEdit, onDelete }: { item: IncomeItem; isActive: boolean; onEdit: () => void; onDelete: () => void }) {
  return (
    <View style={styles.incomeCard}>
      <View style={styles.cardLeft}>
        <View style={[styles.statusBadge, { backgroundColor: isActive ? '#38B2AC' : '#94A3B8' }]}>
          <Ionicons name={isActive ? 'cash-outline' : 'time-outline'} size={18} color="#FFFFFF" />
        </View>
        <View>
          <Text style={styles.sourceText}>{item.source_name}</Text>
          <Text style={styles.dateText}>{item.start_date} to {item.end_date}</Text>
        </View>
      </View>

      <View style={styles.cardRight}>
        <Text style={styles.amountText}>₱{Number(item.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity onPress={onEdit} style={styles.actionIcon}>
            <Ionicons name="pencil-outline" size={16} color="#1B494E" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={styles.actionIcon}>
            <Ionicons name="trash-outline" size={16} color="#E11D48" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1B494E' },
  loadingCenter: { justifyContent: 'center', alignItems: 'center' },
  headerContainer: {
    backgroundColor: '#1B494E',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (NativeStatusBar.currentHeight ? NativeStatusBar.currentHeight + 12 : 40) : 10,
    paddingBottom: 20,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  iconCircleButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: { flexGrow: 1, backgroundColor: '#F8FAF8' },
  bodyCard: {
    flex: 1,
    backgroundColor: '#F8FAF8',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1B494E', marginBottom: 12 },
  emptyText: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic', marginBottom: 12 },
  incomeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  statusBadge: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  sourceText: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  dateText: { fontSize: 12, color: '#64748B', marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  amountText: { fontSize: 15, fontWeight: '800', color: '#1B494E' },
  actionButtonsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionIcon: { padding: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { backgroundColor: '#FFFFFF', width: '88%', padding: 20, borderRadius: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 16 },
  inputLabel: { fontSize: 12, color: '#64748B', fontWeight: '600', marginBottom: 4 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    borderRadius: 12,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    backgroundColor: '#F8FAFC',
    color: '#0F172A',
  },
  dateRow: { flexDirection: 'row', gap: 10 },
  modalButtonsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  modalButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  cancelBtn: { backgroundColor: '#F1F5F9' },
  cancelBtnText: { color: '#475569', fontWeight: '600' },
  confirmBtn: { backgroundColor: '#1B494E' },
  confirmBtnText: { color: '#FFFFFF', fontWeight: '600' },
});