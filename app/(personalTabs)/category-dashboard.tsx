 // app/(personalTabs)/category-dashboard.tsx
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { supabase } from '../../lib/supabase';

export default function CategoryDashboard() {
  const { budgetData } = useLocalSearchParams<{ budgetData: string }>();
  const router = useRouter();
  
  const budget = JSON.parse(budgetData || '{}');
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchExpenses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('budget_id', budget.id)
        .order('spent_at', { ascending: false });

      if (error) throw error;
      setExpenses(data || []);
    } catch (error: any) {
      console.error('Fetch expenses error:', error.message);
      Alert.alert('Error', 'Failed to load transactions');
    }
  }, [budget.id]);

  useEffect(() => {
    fetchExpenses().finally(() => setLoading(false));
  }, [fetchExpenses]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchExpenses();
    setRefreshing(false);
  };

  const handleLogExpense = async () => {
    const expenseAmount = parseFloat(amount);
    if (isNaN(expenseAmount) || expenseAmount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount.");
      return;
    }

    if (expenseAmount > budget.remaining_amount) {
      Alert.alert("Insufficient Budget", `You only have ₱${budget.remaining_amount.toFixed(2)} left.`);
      return;
    }

    try {
      setSubmitting(true);
      const { error: insertError } = await supabase.from('expenses').insert({
        budget_id: budget.id,
        amount: expenseAmount,
        description: description.trim() || 'Uncategorized',
        spent_at: new Date().toISOString(),
      });

      if (insertError) throw insertError;

      // Update remaining amount
      const newRemaining = budget.remaining_amount - expenseAmount;
      await supabase
        .from('budgets')
        .update({ remaining_amount: newRemaining })
        .eq('id', budget.id);

      Alert.alert("Success", `₱${expenseAmount.toFixed(2)} recorded successfully.`);

      setAmount('');
      setDescription('');
      setIsModalOpen(false);
      await fetchExpenses();
    } catch (error: any) {
      Alert.alert("Failed", error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#10B981" style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.title}>{budget.categories?.name}</Text>
        <TouchableOpacity onPress={() => setIsModalOpen(true)}>
          <Ionicons name="add-circle" size={28} color="#10B981" />
        </TouchableOpacity>
      </View>

      {/* Category Card */}
      <View style={[styles.modernFintechCard, { backgroundColor: budget.categories?.color || '#1E293B' }]}>
        <View style={styles.cardHeader}>
          <View style={styles.iconBadge}>
            <Ionicons 
              name={budget.categories?.icon || 'wallet-outline'} 
              size={24} 
              color="#FFFFFF" 
            />
          </View>
          <Text style={styles.categoryName}>{budget.categories?.name}</Text>
        </View>

        <Text style={styles.balanceLabel}>AVAILABLE BALANCE</Text>
        <Text style={styles.balanceAmount}>
          ₱{budget.remaining_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </Text>

        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <View 
              style={[
                styles.progressFill, 
                { width: `${Math.max(0, (budget.remaining_amount / budget.allocated_amount) * 100)}%` }
              ]} 
            />
          </View>
        </View>
      </View>

      {/* Transactions List */}
      <View style={styles.transactionsHeader}>
        <Text style={styles.transactionsTitle}>Recent Transactions</Text>
        <Text style={styles.count}>{expenses.length} logs</Text>
      </View>

      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={48} color="#CBD5E1" />
            <Text style={styles.emptyText}>No transactions yet</Text>
            <Text style={styles.emptySub}>Tap the + button to add your first expense</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.logItem}>
            <View>
              <Text style={styles.logDescription}>{item.description}</Text>
              <Text style={styles.logDate}>
                {new Date(item.spent_at).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </Text>
            </View>
            <Text style={styles.logAmount}>-₱{item.amount.toFixed(2)}</Text>
          </View>
        )}
        contentContainerStyle={styles.listContent}
      />

      {/* Add Expense Modal */}
      <Modal
        visible={isModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setIsModalOpen(false)} />

          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
            style={styles.modalContent}
          >
            <View style={styles.modalDragHandle} />

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Expense</Text>
              <TouchableOpacity onPress={() => setIsModalOpen(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formContainer}>
              <View style={styles.amountContainer}>
                <Text style={styles.amountLabel}>AMOUNT</Text>
                <View style={styles.amountRow}>
                  <Text style={styles.currency}>₱</Text>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="0.00"
                    keyboardType="numeric"
                    value={amount}
                    onChangeText={setAmount}
                    autoFocus
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="What did you buy?"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                />
              </View>

              <TouchableOpacity 
                style={styles.submitButton} 
                onPress={handleLogExpense}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitText}>Save Expense</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFBFD' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: { padding: 4 },
  title: { fontSize: 22, fontWeight: '700', color: '#0F172A' },

  modernFintechCard: {
    margin: 20,
    padding: 20,
    borderRadius: 24,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  iconBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 10,
    borderRadius: 14,
  },
  categoryName: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  balanceLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  balanceAmount: { color: '#FFFFFF', fontSize: 36, fontWeight: '800', marginVertical: 4 },
  progressContainer: { marginTop: 12 },
  progressTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#FFFFFF', borderRadius: 3 },

  transactionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  transactionsTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  count: { fontSize: 14, color: '#64748B' },

  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  logItem: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  logDescription: { fontSize: 16, fontWeight: '500', color: '#0F172A' },
  logDate: { fontSize: 13, color: '#64748B', marginTop: 4 },
  logAmount: { fontSize: 17, fontWeight: '700', color: '#EF4444' },

  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#64748B', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 6 },

  // Modal Styles (reused from your budget screen)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    height: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
  },
  modalDragHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    alignSelf: 'center',
    marginVertical: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  modalTitle: { fontSize: 22, fontWeight: '700' },
  formContainer: { padding: 24 },
  amountContainer: { backgroundColor: '#F8FAFC', padding: 20, borderRadius: 20, marginBottom: 24 },
  amountLabel: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  amountRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  currency: { fontSize: 36, fontWeight: '700', marginRight: 8 },
  amountInput: { flex: 1, fontSize: 42, fontWeight: '700' },
  inputGroup: { marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 8 },
  textInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#0F172A',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  submitText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
});