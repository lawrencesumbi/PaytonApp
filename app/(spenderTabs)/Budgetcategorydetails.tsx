import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

interface Expense {
  id: string;
  budget_id: string;
  amount: number;
  description: string;
  spent_at: string;
  allowance_id?: string;
}

type FilterType = 'all' | 'today' | 'month';

function BudgetCategoryDetailsContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  
  const params = useLocalSearchParams<{
    budgetId: string;
    categoryName: string;
    categoryIcon: string;
    categoryColor: string;
    allocatedAmount: string;
    remainingAmount: string;
    scannedName?: string;
    scannedAmount?: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allowanceId, setAllowanceId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Filter State
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  // Modal States
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allocated = parseFloat(params.allocatedAmount || '0');
  const categoryIconName = (params.categoryIcon as keyof typeof Ionicons.glyphMap) || 'school-outline';

  useEffect(() => {
    if (params.scannedName || params.scannedAmount) {
      setExpenseDescription(params.scannedName || '');
      setExpenseAmount(params.scannedAmount || '');
      setIsModalVisible(true);
    }
  }, [params.scannedName, params.scannedAmount]);

  const fetchExpenses = useCallback(async () => {
    if (!params.budgetId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data: budgetData, error: budgetError } = await supabase
        .from('budgets')
        .select('allowance_id')
        .eq('id', params.budgetId)
        .single();

      if (!budgetError && budgetData) {
        setAllowanceId(budgetData.allowance_id);
      }

      const { data, error } = await supabase
        .from('expenses')
        .select('id, budget_id, amount, description, spent_at, allowance_id')
        .eq('budget_id', params.budgetId)
        .order('spent_at', { ascending: false });

      if (error) throw error;
      setExpenses((data || []) as Expense[]);
    } catch (error: any) {
      console.error("Fetch Expenses Error:", error.message);
      Alert.alert("Error", "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, [params.budgetId]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  // FILTER LOGIC ONLY
  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      const expenseDate = new Date(expense.spent_at);
      const today = new Date();

      if (activeFilter === 'today') {
        return expenseDate.toDateString() === today.toDateString();
      } else if (activeFilter === 'month') {
        return (
          expenseDate.getMonth() === today.getMonth() &&
          expenseDate.getFullYear() === today.getFullYear()
        );
      }

      return true;
    });
  }, [expenses, activeFilter]);

  const totalSpent = useMemo(() => {
    return expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  }, [expenses]);

  const currentRemainingBudget = useMemo(() => {
    return allocated - totalSpent;
  }, [allocated, totalSpent]);

  const spentPercent = useMemo(() => {
    if (allocated <= 0) return 0;
    return Math.min(100, Math.max(0, (totalSpent / allocated) * 100));
  }, [allocated, totalSpent]);

  const remainingPercent = useMemo(() => {
    if (allocated <= 0) return 0;
    return Math.min(100, Math.max(0, (currentRemainingBudget / allocated) * 100));
  }, [allocated, currentRemainingBudget]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setShowScrollTop(offsetY > 150);
  };

  const scrollToTop = () => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const openAddModal = () => {
    setEditingExpense(null);
    setExpenseDescription('');
    setExpenseAmount('');
    setIsModalVisible(true);
  };

  const openEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    setExpenseDescription(expense.description);
    setExpenseAmount(expense.amount.toString());
    setIsModalVisible(true);
  };

  const handleSaveExpense = async () => {
    if (!expenseDescription.trim() || !expenseAmount.trim()) {
      Alert.alert("Missing Info", "Please fill in all fields.");
      return;
    }

    const amountNum = parseFloat(expenseAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount.");
      return;
    }

    const previousExpenseAmount = editingExpense ? editingExpense.amount : 0;
    const projectTotalSpent = totalSpent - previousExpenseAmount + amountNum;

    if (projectTotalSpent > allocated) {
      const allowedAmount = allocated - (totalSpent - previousExpenseAmount);
      Alert.alert(
        "Budget Limit Exceeded",
        `This expense exceeds your category budget.\n\nRemaining Available: ₱${allowedAmount.toLocaleString(
          undefined,
          { minimumFractionDigits: 2 }
        )}`
      );
      return;
    }

    try {
      setIsSubmitting(true);

      if (editingExpense) {
        const { error: updateError } = await supabase
          .from('expenses')
          .update({
            description: expenseDescription.trim(),
            amount: amountNum,
          })
          .eq('id', editingExpense.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('expenses')
          .insert([
            {
              budget_id: params.budgetId,
              description: expenseDescription.trim(),
              amount: amountNum,
              spent_at: new Date().toISOString(),
              allowance_id: allowanceId,
            }
          ]);

        if (insertError) throw insertError;
      }

      const newRemaining = allocated - projectTotalSpent;
      await supabase
        .from('budgets')
        .update({ remaining_amount: newRemaining })
        .eq('id', params.budgetId);

      setIsModalVisible(false);
      fetchExpenses();
      Alert.alert("Success", editingExpense ? "Expense updated!" : "Expense added!");
    } catch (error: any) {
      console.error("Save Expense Error:", error.message);
      Alert.alert("Error", "Failed to save expense");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteExpense = (expense: Expense) => {
    Alert.alert(
      "Delete Expense",
      `Are you sure you want to delete "${expense.description}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              const { error: deleteError } = await supabase
                .from('expenses')
                .delete()
                .eq('id', expense.id);

              if (deleteError) throw deleteError;

              const newTotalSpent = totalSpent - expense.amount;
              const newRemaining = allocated - newTotalSpent;

              await supabase
                .from('budgets')
                .update({ remaining_amount: newRemaining })
                .eq('id', params.budgetId);

              fetchExpenses();
              Alert.alert("Deleted", "Expense deleted successfully.");
            } catch (error: any) {
              console.error("Delete Expense Error:", error.message);
              Alert.alert("Error", "Failed to delete expense");
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const timeString = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    if (date.toDateString() === today.toDateString()) {
      return `Today at ${timeString}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday at ${timeString}`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  if (loading && expenses.length === 0) {
    return (
      <View style={[styles.container, styles.centeredContent]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#1F4F59" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />

      {/* TOP HEADER + CARD BACKGROUND WRAPPER (#1F4F59) */}
      <View style={[
        styles.topBackgroundHeader, 
        { paddingTop: Platform.OS === 'android' ? insets.top + 12 : insets.top + 8 }
      ]}>
        <View style={styles.header}>
          <TouchableOpacity 
            activeOpacity={0.7}
            onPress={() => router.replace('/(spenderTabs)/budget')}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle} numberOfLines={1}>{params.categoryName || 'Category'}</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={openAddModal}
            style={styles.addButton}
          >
            <Ionicons name="add-circle" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* CLEAN CARD WRAPPER */}
        <View style={styles.cardContainerWrapper}>
          <View style={styles.identicalBudgetCard}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconBox}>
                <Ionicons name={categoryIconName} size={22} color="#FFFFFF" />
              </View>
              <View style={styles.cardMainInfo}>
                <Text style={styles.cardCategoryTitle}>
                  {params.categoryName || 'Category'}
                </Text>
                <View style={styles.spentBadgeContainer}>
                  <Text style={styles.cardSpentBadge}>
                    {Math.round(spentPercent)}% Spent
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.progressBarTrack}>
              <View 
                style={[
                  styles.progressBarFill, 
                  { width: `${remainingPercent}%`, backgroundColor: '#1F4F59' }
                ]} 
              />
            </View>

            <View style={styles.metricsRow}>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>TOTAL</Text>
                <Text style={styles.metricValue}>
                  ₱{allocated.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>

              <View style={[styles.metricItem, { alignItems: 'center' }]}>
                <Text style={styles.metricLabel}>SPENT</Text>
                <Text style={[styles.metricValue, { color: '#EF4444' }]}>
                  ₱{totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>

              <View style={[styles.metricItem, { alignItems: 'flex-end' }]}>
                <Text style={styles.metricLabel}>REMAINING</Text>
                <Text style={[styles.metricValue, { color: '#16A34A' }]}>
                  ₱{currentRemainingBudget.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* LOWER TRANSACTIONS SECTION */}
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 80, paddingTop: 16 }}
      >
        {/* TRANSACTIONS HEADER + FILTER CHIPS */}
        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#1F4F59' }}>Latest Transactions</Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', backgroundColor: '#F8FAFC', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
              {filteredExpenses.length}
            </Text>
          </View>

          {/* QUICK FILTER CHIPS */}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['all', 'today', 'month'] as FilterType[]).map((filterKey) => {
              const labelMap: Record<FilterType, string> = {
                all: 'All',
                today: 'Today',
                month: 'This Month'
              };
              const isSelected = activeFilter === filterKey;
              return (
                <TouchableOpacity
                  key={filterKey}
                  activeOpacity={0.7}
                  onPress={() => setActiveFilter(filterKey)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 14,
                    backgroundColor: isSelected ? '#1F4F59' : '#F8FAFC',
                  }}
                >
                  <Text style={{
                    fontSize: 11,
                    fontWeight: isSelected ? '700' : '600',
                    color: isSelected ? '#FFFFFF' : '#64748B'
                  }}>
                    {labelMap[filterKey]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {filteredExpenses.length === 0 ? (
          <View style={styles.emptyTransactions}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="receipt-outline" size={28} color="#94A3B8" />
            </View>
            <Text style={styles.emptyText}>
              {activeFilter !== 'all' ? 'No transactions for this filter' : 'No transactions yet'}
            </Text>
            <Text style={styles.emptySubtext}>
              {activeFilter !== 'all' ? 'Try changing your filter option' : 'Add your first expense to get started'}
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, gap: 8 }}>
            {filteredExpenses.map((expense) => (
              <View 
                key={expense.id} 
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  backgroundColor: '#F8FAFC',
                  borderRadius: 12,
                  borderWidth: 0,
                  shadowColor: 'transparent',
                  elevation: 0
                }}
              >
                <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#EFF4F6', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                  <Ionicons name="receipt-outline" size={16} color="#1F4F59" />
                </View>
                
                <View style={{ flex: 1, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B' }} numberOfLines={1} ellipsizeMode="tail">
                    {expense.description}
                  </Text>
                  <Text style={{ fontSize: 10, fontWeight: '500', color: '#64748B', marginTop: 1 }}>
                    {formatDate(expense.spent_at)}
                  </Text>
                </View>

                {/* SIDE BY SIDE INLINE ROW (PRICE + EDIT + DELETE) */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#1F4F59', marginRight: 4 }}>
                    -₱{(expense.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </Text>
                  
                  <TouchableOpacity 
                    onPress={() => openEditModal(expense)} 
                    style={{ padding: 4 }}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <Ionicons name="pencil-outline" size={14} color="#94A3B8" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    onPress={() => handleDeleteExpense(expense)} 
                    style={{ padding: 4 }}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <Ionicons name="trash-outline" size={14} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* SCROLL TO TOP FLOATING BUTTON */}
      {showScrollTop && (
        <TouchableOpacity
          style={styles.scrollTopFAB}
          activeOpacity={0.8}
          onPress={scrollToTop}
        >
          <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* MODAL SECTION */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity 
            style={styles.modalBackdropTouch} 
            activeOpacity={1} 
            onPress={() => setIsModalVisible(false)} 
          />
          <View style={styles.modalContentContainer}>
            <View style={styles.modalDragHandle} />

            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalTitleText}>
                  {editingExpense ? 'Edit Expense' : 'Log New Expense'}
                </Text>
                
                <View style={styles.categoryChip}>
                  <Ionicons name={categoryIconName} size={14} color="#1F4F59" />
                  <Text style={styles.categoryChipText}>
                    {params.categoryName || 'Food & Dining'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity 
                onPress={() => setIsModalVisible(false)}
                style={styles.modalCloseCircle}
              >
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            {/* AMOUNT SPENT HERO BOX */}
            <View style={styles.heroAmountBox}>
              <Text style={styles.amountLabelText}>AMOUNT SPENT</Text>
              
              <View style={styles.amountInputRow}>
                <Text style={styles.currencySymbol}>₱</Text>
                <TextInput
                  style={styles.heroAmountInput}
                  placeholder="0"
                  placeholderTextColor="#0F172A"
                  keyboardType="numeric"
                  value={expenseAmount}
                  onChangeText={setExpenseAmount}
                />
              </View>

              <View style={styles.heroDivider} />

              <View style={styles.folderLimitRow}>
                <Ionicons 
                  name="wallet-outline" 
                  size={16} 
                  color={currentRemainingBudget <= 0 ? '#EF4444' : '#64748B'} 
                />
                <Text style={[
                  styles.folderLimitText,
                  currentRemainingBudget <= 0 && { color: '#EF4444', fontWeight: '700' }
                ]}>
                  Remaining Budget: ₱{currentRemainingBudget.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </Text>
              </View>
            </View>

            {/* DESCRIPTION SECTION */}
            <View style={styles.descriptionSection}>
              <Text style={styles.descriptionLabel}>Description / Remarks</Text>
              <View style={styles.descriptionInputContainer}>
                <Ionicons name="document-text-outline" size={20} color="#64748B" style={styles.documentIcon} />
                <TextInput
                  style={styles.descriptionTextInput}
                  placeholder="Enter expense details"
                  placeholderTextColor="#94A3B8"
                  value={expenseDescription}
                  onChangeText={setExpenseDescription}
                />
              </View>
            </View>

            {/* SAVE BUTTON */}
            <TouchableOpacity 
              activeOpacity={0.85}
              style={styles.saveTransactionButton}
              onPress={handleSaveExpense}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <View style={styles.saveBtnInternalRow}>
                  <Text style={styles.saveTransactionBtnText}>
                    {editingExpense ? 'Update Transaction' : 'Save Transaction'}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

export default function BudgetCategoryDetailsScreen() {
  return (
    <SafeAreaProvider>
      <BudgetCategoryDetailsContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  centeredContent: { justifyContent: 'center', alignItems: 'center' },

  topBackgroundHeader: {
    backgroundColor: '#1F4F59',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: { flex: 1, alignItems: 'center', paddingHorizontal: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3 },
  addButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },

  cardContainerWrapper: {
    paddingHorizontal: 20,
  },
  identicalBudgetCard: {
    backgroundColor: '#EFF4F6',
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1F4F59',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardMainInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardCategoryTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#2D3748',
  },
  spentBadgeContainer: {
    backgroundColor: 'rgba(31, 79, 89, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  cardSpentBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F4F59',
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricItem: { flex: 1 },
  metricLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#718096',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2D3748',
  },

  scrollContent: { flex: 1, backgroundColor: '#FFFFFF' },

  emptyTransactions: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, paddingHorizontal: 36, gap: 8 },
  emptyIconContainer: { width: 56, height: 56, borderRadius: 14, backgroundColor: '#EFF4F6', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyText: { fontSize: 15, fontWeight: '700', color: '#2D3748', letterSpacing: -0.3 },
  emptySubtext: { fontSize: 12, fontWeight: '400', color: '#718096', textAlign: 'center', lineHeight: 18 },
  scrollTopFAB: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1F4F59',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(15, 23, 42, 0.55)', 
    justifyContent: 'flex-end' 
  },
  modalBackdropTouch: {
    flex: 1,
  },
  modalContentContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
  },
  modalDragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeaderRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start', 
    marginBottom: 20 
  },
  modalTitleText: { 
    fontSize: 22, 
    fontWeight: '800', 
    color: '#0F172A', 
    letterSpacing: -0.5,
    marginBottom: 6
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(31, 79, 89, 0.1)',
    borderRadius: 8,
    alignSelf: 'flex-start',
    gap: 6
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F4F59',
  },
  modalCloseCircle: { 
    width: 36, 
    height: 36, 
    borderRadius: 18, 
    backgroundColor: '#F1F5F9', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  heroAmountBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9'
  },
  amountLabelText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 10
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },
  currencySymbol: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0F172A',
    marginRight: 8
  },
  heroAmountInput: {
    fontSize: 34,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    padding: 0
  },
  heroDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginBottom: 12
  },
  folderLimitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  folderLimitText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B'
  },
  descriptionSection: {
    marginBottom: 24
  },
  descriptionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10
  },
  descriptionInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
  },
  documentIcon: {
    marginRight: 12
  },
  descriptionTextInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A'
  },
  saveTransactionButton: { 
    height: 56, 
    borderRadius: 16, 
    backgroundColor: '#1F4F59',
    justifyContent: 'center', 
    alignItems: 'center', 
    shadowColor: '#1F4F59', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.25, 
    shadowRadius: 8, 
    elevation: 4 
  },
  saveBtnInternalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  saveTransactionBtnText: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#FFFFFF' 
  },
});