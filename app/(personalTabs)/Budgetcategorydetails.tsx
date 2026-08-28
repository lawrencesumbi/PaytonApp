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
  income_id?: string;
}

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
    // Added receipt scan params
    scannedName?: string;
    scannedAmount?: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [incomeId, setIncomeId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Modal States
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allocated = parseFloat(params.allocatedAmount || '0');

  // AUTO-POPULATE FORM ON RECEIPT SCAN REDIRECT
  useEffect(() => {
    if (params.scannedName || params.scannedAmount) {
      setExpenseDescription(params.scannedName || '');
      setExpenseAmount(params.scannedAmount || '');
      setIsModalVisible(true);
    }
  }, [params.scannedName, params.scannedAmount]);

  // Fetch expenses
  const fetchExpenses = useCallback(async () => {
    if (!params.budgetId) {
      // Prevent infinite loading state if budgetId is missing
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data: budgetData, error: budgetError } = await supabase
        .from('budgets')
        .select('income_id')
        .eq('id', params.budgetId)
        .single();

      if (!budgetError && budgetData) {
        setIncomeId(budgetData.income_id);
      }

      const { data, error } = await supabase
        .from('expenses')
        .select('id, budget_id, amount, description, spent_at, income_id')
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

  // Dynamic calculations
  const totalSpent = useMemo(() => {
    return expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  }, [expenses]);

  // Remaining budget computation
  const currentRemainingBudget = useMemo(() => {
    return allocated - totalSpent;
  }, [allocated, totalSpent]);

  const filteredExpenses = useMemo(() => {
    if (!searchQuery.trim()) return expenses;
    return expenses.filter((e) =>
      e.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [expenses, searchQuery]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setShowScrollTop(offsetY > 150);
  };

  const scrollToTop = () => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  // Open modal for Add
  const openAddModal = () => {
    setEditingExpense(null);
    setExpenseDescription('');
    setExpenseAmount('');
    setIsModalVisible(true);
  };

  // Open modal for Edit
  const openEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    setExpenseDescription(expense.description);
    setExpenseAmount(expense.amount.toString());
    setIsModalVisible(true);
  };

  // Save Expense
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
              income_id: incomeId,
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

  const themeColor = params.categoryColor || '#0E7490';
  const categoryIconName = (params.categoryIcon as keyof typeof Ionicons.glyphMap) || 'fast-food';

  if (loading && expenses.length === 0) {
    return (
      <View style={[styles.container, styles.centeredContent]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={themeColor} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />

      {/* HEADER SECTION */}
      <View style={[
        styles.header, 
        { paddingTop: Platform.OS === 'android' ? insets.top + 16 : insets.top + 10 }
      ]}>
        <TouchableOpacity 
          activeOpacity={0.7}
          onPress={() => router.replace('/(personalTabs)/budget')}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle} numberOfLines={1}>{params.categoryName || 'Category'}</Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={openAddModal}
          style={styles.addButton}
        >
          <Ionicons name="add-circle" size={28} color={themeColor} />
        </TouchableOpacity>
      </View>

      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 80 }}
      >
        {/* Search Input Container */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search transactions"
            placeholderTextColor="#CBD5E1"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Transactions Section Header */}
        <View style={styles.transactionsHeader}>
          <Text style={styles.transactionsTitle}>Latest Transactions</Text>
          {filteredExpenses.length > 0 && (
            <Text style={styles.transactionCount}>{filteredExpenses.length}</Text>
          )}
        </View>

        {/* Transaction History Dynamic List */}
        {filteredExpenses.length === 0 ? (
          <View style={styles.emptyTransactions}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="receipt-outline" size={32} color="#94A3B8" />
            </View>
            <Text style={styles.emptyText}>
              {searchQuery ? 'No transactions found' : 'No transactions yet'}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery ? 'Try a different search keyword' : 'Add your first expense to get started'}
            </Text>
          </View>
        ) : (
          <View style={styles.transactionsList}>
            {filteredExpenses.map((expense) => (
              <View key={expense.id} style={styles.transactionItem}>
                <View style={styles.transactionIcon}>
                  <Ionicons name="receipt-outline" size={20} color={themeColor} />
                </View>
                
                <View style={styles.transactionContent}>
                  <Text style={styles.transactionDescription} numberOfLines={1} ellipsizeMode="tail">
                    {expense.description}
                  </Text>
                  <Text style={styles.transactionDate}>
                    {formatDate(expense.spent_at)}
                  </Text>
                </View>

                <View style={styles.transactionRight}>
                  <Text style={[styles.transactionAmount, { color: themeColor }]}>
                    -₱{(expense.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </Text>
                  
                  <View style={styles.actionButtonsRow}>
                    <TouchableOpacity 
                      onPress={() => openEditModal(expense)} 
                      style={styles.actionIconButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="pencil-outline" size={16} color="#64748B" />
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      onPress={() => handleDeleteExpense(expense)} 
                      style={styles.actionIconButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* SCROLL TO TOP FLOATING BUTTON */}
      {showScrollTop && (
        <TouchableOpacity
          style={[styles.scrollTopFAB, { backgroundColor: themeColor }]}
          activeOpacity={0.8}
          onPress={scrollToTop}
        >
          <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* EXACT DESIGN UI MODAL FROM IMAGE */}
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
                  <Ionicons name={categoryIconName} size={14} color="#0E7490" />
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

            {/* DESCRIPTION / REMARKS SECTION */}
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

            {/* SAVE TRANSACTION BUTTON */}
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
  container: { flex: 1, backgroundColor: '#FAFBFD' },
  centeredContent: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: { flex: 1, alignItems: 'center', paddingHorizontal: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', letterSpacing: -0.3 },
  addButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { flex: 1 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginBottom: 20,
    marginTop: 20,
    paddingHorizontal: 16,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A', fontWeight: '500' },
  clearButton: { padding: 4 },
  transactionsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, marginBottom: 16 },
  transactionsTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', letterSpacing: -0.3 },
  transactionCount: { fontSize: 12, fontWeight: '600', color: '#64748B', backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  transactionsList: { paddingHorizontal: 24, gap: 12 },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  transactionIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  transactionContent: { flex: 1, justifyContent: 'center' },
  transactionDescription: { fontSize: 14, fontWeight: '600', color: '#0F172A', marginBottom: 4 },
  transactionDate: { fontSize: 12, fontWeight: '400', color: '#94A3B8' },
  transactionRight: { alignItems: 'flex-end', gap: 4 },
  transactionAmount: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  actionButtonsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionIconButton: { padding: 2 },
  emptyTransactions: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 36, gap: 12 },
  emptyIconContainer: { width: 64, height: 64, borderRadius: 16, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#1E293B', letterSpacing: -0.3 },
  emptySubtext: { fontSize: 12, fontWeight: '400', color: '#64748B', textAlign: 'center', lineHeight: 18 },
  scrollTopFAB: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
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
    backgroundColor: '#ECFEFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: 'flex-start',
    gap: 6
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0E7490'
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
    backgroundColor: '#0B132B',
    borderRadius: 16, 
    justifyContent: 'center', 
    alignItems: 'center', 
    shadowColor: '#0B132B', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.2, 
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