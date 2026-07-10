import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  StatusBar as NativeStatusBar,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface BudgetOption {
  id: string;
  allocated_amount: number;
  remaining_amount: number;
  categories: {
    id: string;
    name: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    color: string;
  };
}

export default function SpenderExpensesScreen() {
  const router = useRouter();
  
  const { scannedName, scannedAmount } = useLocalSearchParams<{ scannedName?: string; scannedAmount?: string }>();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [budgets, setBudgets] = useState<BudgetOption[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<BudgetOption | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchActiveBudgets = useCallback(async (shouldAutoSelect = false) => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('budgets')
        .select(`
          id,
          allocated_amount,
          remaining_amount,
          categories (
            id,
            name,
            icon,
            color
          )
        `)
        .eq('user_id', user.id);

      if (error) throw error;
      
      const validBudgets = (data || []).filter((b: any) => b.categories) as unknown as BudgetOption[];
      setBudgets(validBudgets);
      
      if (validBudgets.length > 0 && shouldAutoSelect) {
        setSelectedBudget(validBudgets[0]);
      }
    } catch (error: any) {
      console.error("Fetch Budgets Error:", error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleInitialSync = async () => {
      const hasScanData = !!(scannedAmount || scannedName);
      
      if (scannedAmount) setAmount(scannedAmount);
      if (scannedName) setDescription(`Scanned: ${scannedName}`);
      
      await fetchActiveBudgets(hasScanData);
      
      if (hasScanData) {
        setIsModalOpen(true);
      }
    };

    handleInitialSync();
  }, [scannedAmount, scannedName, fetchActiveBudgets]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedBudget(null);
    router.setParams({ scannedName: undefined, scannedAmount: undefined });
  };

  const handleLogExpense = async () => {
    if (!selectedBudget) {
      Alert.alert("Missing Category", "Please select an active budget category target.");
      return;
    }

    const expenseAmount = parseFloat(amount);
    if (isNaN(expenseAmount) || expenseAmount <= 0) {
      Alert.alert("Invalid Amount", "Please input a positive numeric transaction value.");
      return;
    }

    if (expenseAmount > selectedBudget.remaining_amount) {
      Alert.alert(
        "Insufficient Budget ❌", 
        `You cannot spend ₱${expenseAmount.toFixed(2)} because you only have ₱${selectedBudget.remaining_amount.toFixed(2)} remaining inside this specific folder.`
      );
      return;
    }

    try {
      setSubmitting(true);
      
      const { error: insertError } = await supabase
        .from('expenses')
        .insert({
          budget_id: selectedBudget.id,
          amount: expenseAmount,
          description: description.trim() || 'Uncategorized Expense',
          spent_at: new Date().toISOString()
        });

      if (insertError) throw insertError;

      const newRemaining = selectedBudget.remaining_amount - expenseAmount;
      const { error: updateError } = await supabase
        .from('budgets')
        .update({ remaining_amount: newRemaining })
        .eq('id', selectedBudget.id);

      if (updateError) throw updateError;

      Alert.alert("Success ", `Your transaction of ₱${expenseAmount.toFixed(2)} was securely captured.`);
      
      setAmount('');
      setDescription('');
      handleCloseModal();
      await fetchActiveBudgets(false);

    } catch (error: any) {
      Alert.alert("Transaction Aborted", error.message);
    } finally {
      setSubmitting(false);
    }
  };

   const handleCardPress = (item: BudgetOption) => {
      router.push({
          pathname: '/(personalTabs)/category-dashboard',
          params: { budgetData: JSON.stringify(item) }
      });
   };

  if (loading && budgets.length === 0) {
    return (
      <SafeAreaView style={[styles.container, styles.centeredContent]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="small" color="#10B981" />
      </SafeAreaView>
    );
  }

  // Render individual stackable card for the vertical list
  const renderStackableCard = ({ item }: { item: BudgetOption }) => {
    const total = item.allocated_amount || 1; 
    const remainingPercent = Math.max(0, Math.min(100, (item.remaining_amount / total) * 100));

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => handleCardPress(item)}
        style={[styles.stackableCard, { backgroundColor: item.categories.color || '#1E293B' }]}
      >
        <View style={styles.stackCardHeader}>
          <View style={styles.stackCardIconWrapper}>
            <Ionicons name={item.categories.icon || 'wallet-outline'} size={20} color={item.categories.color || '#1E293B'} />
          </View>
          <Text style={styles.stackCardTitle} numberOfLines={1}>{item.categories.name}</Text>
          <TouchableOpacity onPress={() => handleCardPress(item)}>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </View>

        {/* Progress Bar */}
        <View style={styles.stackCardProgressTrack}>
          <View style={[styles.stackCardProgressFill, { width: `${remainingPercent}%` }]} />
        </View>
        
        <View style={styles.stackCardAmountRow}>
          <Text style={styles.stackCardLeftText}>₱{item.remaining_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} left</Text>
          <Text style={styles.stackCardRightText}>of ₱{item.allocated_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
        </View>

        <View style={styles.stackCardFooter}>
          <Text style={styles.stackCardAvailableLabel}>AVAILABLE BALANCE</Text>
          <Text style={styles.stackCardAvailableAmount}>
            ₱{item.remaining_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.cardSelectionHeader}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={styles.cardSelectionTitle}>Select Wallet</Text>
            <Text style={styles.cardSelectionSubtitle}>{budgets.length} active folders</Text>
          </View>
          
          <TouchableOpacity 
            activeOpacity={0.7}
            onPress={() => router.push('/(personalTabs)/statistics')}
            style={{
              backgroundColor: '#F1F5F9',
              padding: 10,
              borderRadius: 50,
              borderWidth: 1,
              borderColor: '#E2E8F0'
            }}
          >
            <Ionicons name="bar-chart-outline" size={20} color="#0F172A" />
          </TouchableOpacity>
        </View>
      </View>

      {budgets.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="wallet-outline" size={32} color="#64748B" />
          </View>
          <Text style={styles.emptyText}>No Active Budgets Allocated</Text>
          <Text style={styles.emptySub}>To populate transactional items, configure and allocate capital tokens via your Home layout first.</Text>
        </View>
      ) : (
        // Stackable Vertical FlatList
        <FlatList
          data={budgets}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.stackableListContainer}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => renderStackableCard({ item })}
        />
      )}

      <Modal
        visible={isModalOpen}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={StyleSheet.absoluteFillObject} 
            activeOpacity={1} 
            onPress={handleCloseModal} 
          />

          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
            style={styles.modalContent}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={{ flex: 1 }}>
                <View style={styles.modalDragHandle} />

                <View style={styles.header}>
                  <View style={styles.headerRow}>
                    <View>
                      <Text style={styles.headerTitle}>Log New Expense</Text>
                      {selectedBudget && (
                        <View style={[styles.modernCategoryBadge, { backgroundColor: `${selectedBudget.categories.color}15` }]}>
                          <Ionicons name={selectedBudget.categories.icon || 'folder-outline'} size={14} color={selectedBudget.categories.color} />
                          <Text style={[styles.modernCategoryBadgeText, { color: selectedBudget.categories.color }]}>
                            {selectedBudget.categories.name}
                          </Text>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity 
                      style={styles.closeModalHeaderIcon} 
                      activeOpacity={0.7}
                      onPress={handleCloseModal}
                    >
                      <Ionicons name="close" size={20} color="#64748B" />
                    </TouchableOpacity>
                  </View>
                </View>

                <ScrollView 
                  style={{ flex: 1 }}
                  contentContainerStyle={styles.formContainer}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.modernAmountContainer}>
                    <Text style={styles.modernAmountLabel}>AMOUNT SPENT</Text>
                    <View style={styles.amountInputRow}>
                      <Text style={styles.currencySymbol}>₱</Text>
                      <TextInput
                        style={styles.amountInput}
                        placeholder="0.00"
                        placeholderTextColor="#CBD5E1"
                        keyboardType="numeric"
                        value={amount}
                        onChangeText={setAmount}
                        editable={!submitting}
                        autoFocus
                      />
                    </View>
                    {selectedBudget && (
                      <View style={styles.remainingBalanceRow}>
                        <Ionicons name="wallet-outline" size={13} color="#64748B" />
                        <Text style={styles.remainingBalanceText}>
                          Folder Limit: ₱{selectedBudget.remaining_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Description / Remarks</Text>
                    <View style={styles.textInputWrapper}>
                      <Ionicons name="document-text-outline" size={18} color="#94A3B8" style={{ marginRight: 10 }} />
                      <TextInput
                        style={styles.textInput}
                        placeholder="What did you purchase?"
                        placeholderTextColor="#94A3B8"
                        value={description}
                        onChangeText={setDescription}
                        editable={!submitting}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.submitButton, submitting && styles.disabledButton]}
                    onPress={handleLogExpense}
                    disabled={submitting}
                    activeOpacity={0.8}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Text style={styles.submitButtonText}>Save Transaction</Text>
                        <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                      </>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFBFD' },
  centeredContent: { justifyContent: 'center', alignItems: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)', 
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    height: '75%', 
    paddingTop: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 24,
  },
  modalDragHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    alignSelf: 'center',
    marginBottom: 6,
  },
  closeModalHeaderIcon: {
    backgroundColor: '#F1F5F9',
    padding: 8,
    borderRadius: 50,
  },
  modernCategoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 6,
    gap: 5,
  },
  modernCategoryBadgeText: { fontSize: 12, fontWeight: '600' },
  header: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#0F172A', letterSpacing: -0.5 },
  formContainer: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: Platform.OS === 'ios' ? 40 : 56 }, 
  modernAmountContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  modernAmountLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', letterSpacing: 1 },
  amountInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 6 },
  currencySymbol: { fontSize: 36, fontWeight: '700', color: '#0F172A', marginRight: 4 },
  amountInput: { flex: 1, fontSize: 40, fontWeight: '700', color: '#0F172A', letterSpacing: -1 },
  remainingBalanceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 4 },
  remainingBalanceText: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  inputGroup: { marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 8 },
  textInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, paddingHorizontal: 14, height: 52 },
  textInput: { flex: 1, fontSize: 14, color: '#0F172A', fontWeight: '500' },
  submitButton: { 
    backgroundColor: '#0F172A', 
    height: 54,
    borderRadius: 16, 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    gap: 6, 
    marginTop: 12,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 
  },
  disabledButton: { opacity: 0.6 },
  submitButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16, letterSpacing: -0.2 },
  cardSelectionHeader: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? (NativeStatusBar.currentHeight ? NativeStatusBar.currentHeight + 16 : 34) : 20,
    paddingBottom: 20
  },
  cardSelectionTitle: { fontSize: 24, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  cardSelectionSubtitle: { fontSize: 13, color: '#64748B', marginTop: 2, fontWeight: '500' },
  
  // ===== STACKABLE LIST STYLES =====
  stackableListContainer: {
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 120, // Generous bottom padding for floating nav clearance
    gap: 16,
  },
  stackableCard: {
    width: '100%', // Takes full width for a true stacked look
    borderRadius: 24,
    padding: 20,
    // Removed fixed height, let content dictate size for flexibility
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08, // Softer shadow so they look clean when stacked
    shadowRadius: 10,
    elevation: 4,
    overflow: 'hidden', // Ensure progress bar stays inside rounded corners
  },
  stackCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  stackCardIconWrapper: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 12,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stackCardTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    flex: 1,
    marginLeft: 12,
  },
  stackCardProgressTrack: {
    height: 8, // Slightly thicker for the stacked format
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  stackCardProgressFill: {
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 4,
  },
  stackCardAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  stackCardLeftText: {
    color: 'rgba(255,255,255, 0.9)',
    fontSize: 13,
    fontWeight: '600',
  },
  stackCardRightText: {
    color: 'rgba(255,255,255, 0.6)',
    fontSize: 13,
    fontWeight: '400',
  },
  stackCardFooter: {
    marginTop: 'auto', // Pushes balance to the bottom cleanly
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
  },
  stackCardAvailableLabel: {
    color: 'rgba(255,255,255, 0.6)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  stackCardAvailableAmount: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },

  emptyState: { flex: 0.7, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 36, gap: 14 },
  emptyIconContainer: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#1E293B', letterSpacing: -0.4 },
  emptySub: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 22, fontWeight: '400' }
});