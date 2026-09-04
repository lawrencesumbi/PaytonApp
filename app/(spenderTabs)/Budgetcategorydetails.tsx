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

// ---------------------------------------------------------------------------
// UNIFIED COLOR PALETTE & FIXED CYAN THEME
// ---------------------------------------------------------------------------
const COLORS = {
  deepTeal: '#1F4F59',
  cyan: '#54C9CC',
  cyanLight: '#7EDDE0',
  olive: '#7EA00E',
  yellowGreen: '#DCD964',
  darkOlive: '#213502',
  bg: '#F4F8F4',
  card: '#FFFFFF',
  white: '#FFFFFF',
  textMuted: '#7E8F82',
};

// FIXED CYAN CARD THEME
const CYAN_THEME = {
  bg: '#E6F0F2',
  text: '#1F4F59',
  iconBg: '#54C9CC',
  iconColor: '#FFFFFF',
};

interface Expense {
  id: string;
  budget_id: string;
  amount: number;
  description: string;
  spent_at: string;
  allowance_id?: string;
}

type FilterType = 'today' | 'week' | 'month' | 'all';

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
  
  // State for fetched category icon (fallback to route params)
  const [fetchedCategoryIcon, setFetchedCategoryIcon] = useState<string>(params.categoryIcon || 'folder-outline');

  // Filter State - TODAY as default
  const [activeFilter, setActiveFilter] = useState<FilterType>('today');

  // Modal States
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allocated = parseFloat(params.allocatedAmount || '0');
  const categoryIconName = (params.categoryIcon as keyof typeof Ionicons.glyphMap) || 'folder-outline';
  
  // Dynamic Icon for Expense List Entries
  const listCategoryIcon = (fetchedCategoryIcon as keyof typeof Ionicons.glyphMap) || categoryIconName;

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
        .select(`
          allowance_id,
          categories (
            icon
          )
        `)
        .eq('id', params.budgetId)
        .single();

      if (!budgetError && budgetData) {
        setAllowanceId(budgetData.allowance_id);

        if (budgetData.categories) {
          const category = Array.isArray(budgetData.categories)
            ? budgetData.categories[0]
            : budgetData.categories;

          if (category?.icon) {
            setFetchedCategoryIcon(category.icon);
          }
        }
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

  // FILTER LOGIC
  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      const expenseDate = new Date(expense.spent_at);
      const today = new Date();

      if (activeFilter === 'today') {
        return expenseDate.toDateString() === today.toDateString();
      } 
      
      if (activeFilter === 'week') {
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        return expenseDate >= startOfWeek && expenseDate <= endOfWeek;
      } 
      
      if (activeFilter === 'month') {
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
        <ActivityIndicator size="small" color={COLORS.cyan} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />

      {/* TOP DEEP TEAL HEADER */}
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
            <Ionicons name="chevron-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle} numberOfLines={1}>{params.categoryName || 'Category'}</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={openAddModal}
            style={styles.addButton}
          >
            <Ionicons name="add-circle" size={28} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        {/* FIXED CYAN PASTEL CARD */}
        <View style={styles.cardContainerWrapper}>
          <View style={[styles.identicalBudgetCard, { backgroundColor: CYAN_THEME.bg }]}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconBox, { backgroundColor: CYAN_THEME.iconBg }]}>
                <Ionicons name={categoryIconName} size={20} color={CYAN_THEME.iconColor} />
              </View>
              <View style={styles.cardMainInfo}>
                <Text style={[styles.cardCategoryTitle, { color: CYAN_THEME.text }]}>
                  {params.categoryName || 'Category'}
                </Text>
                <View style={[styles.spentBadgeContainer, { backgroundColor: 'rgba(0,0,0,0.04)' }]}>
                  <Text style={[styles.cardSpentBadge, { color: CYAN_THEME.text }]}>
                    {Math.round(spentPercent)}% Spent
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.progressBarTrack}>
              <View 
                style={[
                  styles.progressBarFill, 
                  { width: `${remainingPercent}%`, backgroundColor: CYAN_THEME.iconBg }
                ]} 
              />
            </View>

            <View style={styles.metricsRow}>
              <View style={styles.metricItem}>
                <Text style={[styles.metricLabel, { color: CYAN_THEME.text }]}>TOTAL</Text>
                <Text style={[styles.metricValue, { color: CYAN_THEME.text }]}>
                  ₱{allocated.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>

              <View style={[styles.metricItem, { alignItems: 'center' }]}>
                <Text style={[styles.metricLabel, { color: CYAN_THEME.text }]}>SPENT</Text>
                <Text style={[styles.metricValue, { color: CYAN_THEME.text }]}>
                  ₱{totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>

              <View style={[styles.metricItem, { alignItems: 'flex-end' }]}>
                <Text style={[styles.metricLabel, { color: CYAN_THEME.text }]}>REMAINING</Text>
                <Text style={[styles.metricValue, { color: CYAN_THEME.text }]}>
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
        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.darkOlive }}>Latest Transactions</Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.textMuted, backgroundColor: COLORS.white, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
              {filteredExpenses.length}
            </Text>
          </View>

          {/* QUICK FILTER CHIPS */}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['today', 'week', 'month', 'all'] as FilterType[]).map((filterKey) => {
              const labelMap: Record<FilterType, string> = {
                today: 'Today',
                week: 'This Week',
                month: 'This Month',
                all: 'All'
              };
              const isSelected = activeFilter === filterKey;
              return (
                <TouchableOpacity
                  key={filterKey}
                  activeOpacity={0.7}
                  onPress={() => setActiveFilter(filterKey)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                    borderRadius: 12,
                    backgroundColor: isSelected ? COLORS.deepTeal : COLORS.white,
                    borderWidth: isSelected ? 0 : 1,
                    borderColor: '#E2E8F0',
                  }}
                >
                  <Text style={{
                    fontSize: 11,
                    fontWeight: isSelected ? '700' : '600',
                    color: isSelected ? COLORS.white : COLORS.textMuted
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
              <Ionicons name={listCategoryIcon} size={28} color={COLORS.textMuted} />
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
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  backgroundColor: COLORS.white,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                }}
              >
                {/* Cyan Category Icon in Expense List */}
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: CYAN_THEME.bg, justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                  <Ionicons name={listCategoryIcon} size={16} color={CYAN_THEME.text} />
                </View>
                
                <View style={{ flex: 1, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.darkOlive }} numberOfLines={1} ellipsizeMode="tail">
                    {expense.description}
                  </Text>
                  <Text style={{ fontSize: 10, fontWeight: '500', color: COLORS.textMuted, marginTop: 1 }}>
                    {formatDate(expense.spent_at)}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.deepTeal, marginRight: 4 }}>
                    -₱{(expense.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </Text>
                  
                  <TouchableOpacity 
                    onPress={() => openEditModal(expense)} 
                    style={{ padding: 4 }}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <Ionicons name="pencil-outline" size={14} color={COLORS.textMuted} />
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

      {/* SCROLL TO TOP FAB */}
      {showScrollTop && (
        <TouchableOpacity
          style={styles.scrollTopFAB}
          activeOpacity={0.8}
          onPress={scrollToTop}
        >
          <Ionicons name="arrow-up" size={20} color={COLORS.white} />
        </TouchableOpacity>
      )}

      {/* MODAL */}
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
                
                <View style={[styles.categoryChip, { backgroundColor: CYAN_THEME.bg }]}>
                  <Ionicons name={categoryIconName} size={14} color={CYAN_THEME.text} />
                  <Text style={[styles.categoryChipText, { color: CYAN_THEME.text }]}>
                    {params.categoryName || 'Category'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity 
                onPress={() => setIsModalVisible(false)}
                style={styles.modalCloseCircle}
              >
                <Ionicons name="close" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.heroAmountBox}>
              <Text style={styles.amountLabelText}>AMOUNT SPENT</Text>
              
              <View style={styles.amountInputRow}>
                <Text style={styles.currencySymbol}>₱</Text>
                <TextInput
                  style={styles.heroAmountInput}
                  placeholder="0.00"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  value={expenseAmount}
                  onChangeText={setExpenseAmount}
                />
              </View>

              <View style={styles.heroDivider} />

              <View style={styles.folderLimitRow}>
                <Ionicons 
                  name="wallet-outline" 
                  size={14} 
                  color={currentRemainingBudget <= 0 ? '#EF4444' : COLORS.textMuted} 
                />
                <Text style={[
                  styles.folderLimitText,
                  currentRemainingBudget <= 0 && { color: '#EF4444', fontWeight: '700' }
                ]}>
                  Remaining Budget: ₱{currentRemainingBudget.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </Text>
              </View>
            </View>

            <View style={styles.descriptionSection}>
              <Text style={styles.descriptionLabel}>Description / Remarks</Text>
              <View style={styles.descriptionInputContainer}>
                <Ionicons name="document-text-outline" size={18} color={COLORS.textMuted} style={styles.documentIcon} />
                <TextInput
                  style={styles.descriptionTextInput}
                  placeholder="Enter expense details"
                  placeholderTextColor={COLORS.textMuted}
                  value={expenseDescription}
                  onChangeText={setExpenseDescription}
                />
              </View>
            </View>

            <TouchableOpacity 
              activeOpacity={0.85}
              style={styles.saveTransactionButton}
              onPress={handleSaveExpense}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <View style={styles.saveBtnInternalRow}>
                  <Text style={styles.saveTransactionBtnText}>
                    {editingExpense ? 'Update Transaction' : 'Save Transaction'}
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color={COLORS.white} />
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
  container: { flex: 1, backgroundColor: COLORS.bg },
  centeredContent: { justifyContent: 'center', alignItems: 'center' },

  topBackgroundHeader: {
    backgroundColor: COLORS.deepTeal,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingBottom: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: { flex: 1, alignItems: 'center', paddingHorizontal: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.white, letterSpacing: -0.3 },
  addButton: { width: 38, height: 38, justifyContent: 'center', alignItems: 'center' },

  cardContainerWrapper: {
    paddingHorizontal: 20,
  },
  identicalBudgetCard: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  cardMainInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardCategoryTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  spentBadgeContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  cardSpentBadge: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.05)',
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricItem: { flex: 1 },
  metricLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
    opacity: 0.6,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
  },

  scrollContent: { flex: 1, backgroundColor: COLORS.bg },

  emptyTransactions: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, paddingHorizontal: 36, gap: 8 },
  emptyIconContainer: { width: 56, height: 56, borderRadius: 16, backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 4 },
  emptyText: { fontSize: 15, fontWeight: '700', color: COLORS.darkOlive, letterSpacing: -0.3 },
  emptySubtext: { fontSize: 12, fontWeight: '400', color: COLORS.textMuted, textAlign: 'center', lineHeight: 18 },
  scrollTopFAB: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.deepTeal,
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
    backgroundColor: 'rgba(13, 34, 4, 0.5)', 
    justifyContent: 'flex-end' 
  },
  modalBackdropTouch: { flex: 1 },
  modalContentContainer: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
  },
  modalDragHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeaderRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start', 
    marginBottom: 16 
  },
  modalTitleText: { 
    fontSize: 20, 
    fontWeight: '700', 
    color: COLORS.darkOlive, 
    letterSpacing: -0.5,
    marginBottom: 4
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    gap: 4
  },
  categoryChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalCloseCircle: { 
    backgroundColor: '#F1F5F9',
    padding: 6,
    borderRadius: 50,
  },
  heroAmountBox: {
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  amountLabelText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginBottom: 6
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  currencySymbol: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.darkOlive,
    marginRight: 4
  },
  heroAmountInput: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.darkOlive,
    flex: 1,
    padding: 0
  },
  heroDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginBottom: 10
  },
  folderLimitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  folderLimitText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textMuted
  },
  descriptionSection: { marginBottom: 20 },
  descriptionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.darkOlive,
    marginBottom: 6
  },
  descriptionInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
  },
  documentIcon: { marginRight: 10 },
  descriptionTextInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.darkOlive
  },
  saveTransactionButton: { 
    height: 48, 
    borderRadius: 16, 
    backgroundColor: COLORS.deepTeal,
    justifyContent: 'center', 
    alignItems: 'center', 
    shadowColor: COLORS.deepTeal, 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.2, 
    shadowRadius: 10, 
    elevation: 4 
  },
  saveBtnInternalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  saveTransactionBtnText: { 
    fontSize: 15, 
    fontWeight: '700', 
    color: COLORS.white,
    letterSpacing: -0.2
  },
});