import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

interface Transaction {
  id: string;
  budget_id: string;
  amount: number;
  description: string;
  spent_at: string;
  budgets: {
    remaining_amount: number;
    allocated_amount: number;
    user_id: string;
    categories: {
      name: string;
      icon: keyof typeof Ionicons.glyphMap;
      color: string;
    };
  };
}

type FilterType = 'today' | 'week' | 'month' | 'year';

function TransactionsScreenContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('today');
  const [showScrollTop, setShowScrollTop] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [updating, setUpdating] = useState(false);

  const handleBackPress = () => {
    router.push('/home'); 
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setShowScrollTop(offsetY > 150);
  };

  const scrollToTop = () => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Get all budgets for the current user with category info
      const { data: budgets, error: budgetsError } = await supabase
        .from('budgets')
        .select('id, categories(name, icon, color)')
        .eq('user_id', user.id);

      if (budgetsError) throw budgetsError;

      // Create a map of budget_id -> category details
      const budgetMap = new Map();
      (budgets || []).forEach((budget: any) => {
        const rawCategory = Array.isArray(budget.categories) 
          ? budget.categories[0] 
          : budget.categories;
        
        budgetMap.set(budget.id, {
          categories: {
            name: rawCategory?.name || 'Uncategorized',
            icon: rawCategory?.icon || 'receipt-outline',
            color: rawCategory?.color || '#64748B'
          }
        });
      });

      // 2. Fetch all expenses for these budgets
      const { data, error } = await supabase
        .from('expenses')
        .select('id, budget_id, amount, description, spent_at')
        .in('budget_id', Array.from(budgetMap.keys()))
        .order('spent_at', { ascending: false });

      if (error) throw error;

      // 3. Map expenses with their budget category info
      const formattedData = (data || []).map((expense: any) => {
        const budgetInfo = budgetMap.get(expense.budget_id);
        return {
          id: expense.id,
          budget_id: expense.budget_id,
          amount: Number(expense.amount),
          description: expense.description,
          spent_at: expense.spent_at,
          budgets: {
            remaining_amount: 0,
            allocated_amount: 0,
            categories: budgetInfo?.categories || {
              name: 'Uncategorized',
              icon: 'receipt-outline',
              color: '#64748B'
            }
          }
        };
      });

      setTransactions(formattedData as Transaction[]);
    } catch (error: any) {
      console.error('Fetch Transactions Error:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchTransactions();
  }, [fetchTransactions]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchTransactions();
  };

  const filteredTransactions = useMemo(() => {
    let filtered = transactions;

    // Apply search filter
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      filtered = filtered.filter(tx => {
        const matchesDescription = tx.description?.toLowerCase().includes(query);
        const matchesCategory = tx.budgets?.categories?.name?.toLowerCase().includes(query);
        return matchesDescription || matchesCategory;
      });
    }

    // Apply date filter
    filtered = filtered.filter((tx) => {
      const txDate = new Date(tx.spent_at);
      const today = new Date();

      if (activeFilter === 'today') {
        return txDate.toDateString() === today.toDateString();
      }

      if (activeFilter === 'week') {
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        return txDate >= startOfWeek && txDate <= endOfWeek;
      }

      if (activeFilter === 'month') {
        return (
          txDate.getMonth() === today.getMonth() &&
          txDate.getFullYear() === today.getFullYear()
        );
      }

      if (activeFilter === 'year') {
        return txDate.getFullYear() === today.getFullYear();
      }

      return true; // 'all'
    });

    return filtered;
  }, [searchQuery, transactions, activeFilter]);

  const handleDeleteTx = (tx: Transaction) => {
    Alert.alert(
      "Delete Transaction?",
      `Are you sure you want to delete this expense worth ₱${tx.amount.toFixed(2)}? This will return the amount to your wallet.`,
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
                .eq('id', tx.id);

              if (deleteError) throw deleteError;

              const restoredRemaining = tx.budgets.remaining_amount + tx.amount;
              const { error: updateError } = await supabase
                .from('budgets')
                .update({ remaining_amount: restoredRemaining })
                .eq('id', tx.budget_id);

              if (updateError) throw updateError;

              Alert.alert("Deleted 🎉", "Transaction removed and wallet balance restored.");
              fetchTransactions();
            } catch (error: any) {
              Alert.alert("Error", error.message);
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleOpenEditModal = (tx: Transaction) => {
    setSelectedTx(tx);
    setEditAmount(tx.amount.toString());
    setEditDescription(tx.description);
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setSelectedTx(null);
    setEditAmount('');
    setEditDescription('');
  };

  const handleUpdateTx = async () => {
    if (!selectedTx) return;

    const newAmount = parseFloat(editAmount);
    if (isNaN(newAmount) || newAmount <= 0) {
      Alert.alert("Invalid Amount", "Please input a valid number.");
      return;
    }

    const difference = newAmount - selectedTx.amount;
    const projectRemaining = selectedTx.budgets.remaining_amount - difference;

    if (projectRemaining < 0) {
      Alert.alert(
        "Insufficient Budget ❌",
        `You cannot increase this expense by ₱${difference.toFixed(2)} because your folder only has ₱${selectedTx.budgets.remaining_amount.toFixed(2)} left.`
      );
      return;
    }

    try {
      setUpdating(true);
      const { error: updateTxError } = await supabase
        .from('expenses')
        .update({
          amount: newAmount,
          description: editDescription.trim() || 'Uncategorized Expense'
        })
        .eq('id', selectedTx.id);

      if (updateTxError) throw updateTxError;

      const { error: updateBudgetError } = await supabase
        .from('budgets')
        .update({ remaining_amount: projectRemaining })
        .eq('id', selectedTx.budget_id);

      if (updateBudgetError) throw updateBudgetError;

      Alert.alert("Updated 🎉", "Transaction successfully modified.");
      handleCloseEditModal();
      fetchTransactions();
    } catch (error: any) {
      Alert.alert("Update Failed", error.message);
    } finally {
      setUpdating(false);
    }
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

  if (loading && transactions.length === 0) {
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

      {/* DARK TEAL TOP HEADER */}
      <View style={[
        styles.topBackgroundHeader, 
        { paddingTop: Platform.OS === 'android' ? insets.top + 12 : insets.top + 8 }
      ]}>
        <View style={styles.header}>
          <TouchableOpacity 
            activeOpacity={0.7}
            onPress={handleBackPress}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle} numberOfLines={1}>All Transactions</Text>
          </View>

          <View style={{ width: 40 }} />
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
          </View>

          {/* QUICK FILTER CHIPS */}
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {(['today', 'week', 'month', 'year',] as FilterType[]).map((filterKey) => {
              const labelMap: Record<FilterType, string> = {
                today: 'Today',
                week: 'This Week',
                month: 'This Month',
                year: 'This Year',
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

          {/* SEARCH INPUT */}
          <View style={styles.searchContainer}>
            <View style={styles.searchWrapper}>
              <Ionicons name="search-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search transactions or categories..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && Platform.OS === 'android' && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {filteredTransactions.length === 0 ? (
          <View style={styles.emptyTransactions}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="receipt-outline" size={28} color="#94A3B8" />
            </View>
            <Text style={styles.emptyText}>
              {searchQuery.length > 0 ? "No Results Found" : activeFilter !== 'today' ? "No transactions for this filter" : "No Transactions Yet"}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery.length > 0 
                ? `We couldn't find any matches for "${searchQuery}". Try checking your spelling.`
                : activeFilter !== 'today' 
                ? 'Try changing your filter option'
                : "Expenses that you record will display chronologically here."
              }
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, gap: 8 }}>
            {filteredTransactions.map((expense) => (
              <View 
                key={expense.id} 
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  backgroundColor: '#F8FAFC',
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#F1F5F9',
                }}
              >
                <View style={{ 
                  width: 40, 
                  height: 40, 
                  borderRadius: 10, 
                  backgroundColor: `${expense.budgets?.categories?.color || '#64748B'}15`, 
                  justifyContent: 'center', 
                  alignItems: 'center', 
                  marginRight: 12 
                }}>
                  <Ionicons name={expense.budgets?.categories?.icon || 'receipt-outline'} size={18} color={expense.budgets?.categories?.color || '#64748B'} />
                </View>
                
                <View style={{ flex: 1, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E293B' }} numberOfLines={1} ellipsizeMode="tail">
                    {expense.description}
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748B', marginTop: 2 }}>
                    {expense.budgets?.categories?.name || 'Uncategorized'} • {formatDate(expense.spent_at)}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#DC2626', marginRight: 4 }}>
                    -₱{(expense.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </Text>
                  
                  <TouchableOpacity 
                    onPress={() => handleOpenEditModal(expense)} 
                    style={{ padding: 4 }}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <Ionicons name="pencil-outline" size={15} color="#94A3B8" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    onPress={() => handleDeleteTx(expense)} 
                    style={{ padding: 4 }}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <Ionicons name="trash-outline" size={15} color="#EF4444" />
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
          <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Edit Modal */}
      <Modal
        visible={isEditModalOpen}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        onRequestClose={handleCloseEditModal}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleCloseEditModal} />
            
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalContent}>
              <View style={{ flex: 1 }}>
                <View style={styles.modalDragHandle} />

                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Modify Transaction</Text>
                  <TouchableOpacity style={styles.closeIcon} onPress={handleCloseEditModal}>
                    <Ionicons name="close" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.formContainer} keyboardShouldPersistTaps="handled">
                  <View style={styles.amountContainer}>
                    <Text style={styles.inputLabel}>RE-ENTER AMOUNT (₱)</Text>
                    <View style={styles.amountInputRow}>
                      <Text style={styles.currencySymbol}>₱</Text>
                      <TextInput
                        style={styles.amountInput}
                        placeholder="0.00"
                        keyboardType="numeric"
                        value={editAmount}
                        onChangeText={setEditAmount}
                        editable={!updating}
                      />
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Remarks / Description</Text>
                    <View style={styles.textInputWrapper}>
                      <Ionicons name="document-text-outline" size={18} color="#94A3B8" style={{ marginRight: 10 }} />
                      <TextInput
                        style={styles.textInput}
                        placeholder="What changed?"
                        placeholderTextColor="#94A3B8"
                        value={editDescription}
                        onChangeText={setEditDescription}
                        editable={!updating}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.saveButton, updating && styles.disabledButton]}
                    onPress={handleUpdateTx}
                    disabled={updating}
                  >
                    {updating ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Text style={styles.saveButtonText}>Apply Adjustments</Text>
                        <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                      </>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  centeredContent: { justifyContent: 'center', alignItems: 'center' },

  topBackgroundHeader: {
    backgroundColor: '#1F4F59',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
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

  scrollContent: { flex: 1, backgroundColor: '#FFFFFF' },

  searchContainer: {
    paddingHorizontal: 0,
    paddingVertical: 12,
    marginTop: 8,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0
  },

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

  listContainer: { paddingHorizontal: 24, paddingBottom: 40, gap: 12 },
  txCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  txDetails: { flex: 1, justifyContent: 'center' },
  txDescription: { fontSize: 15, fontWeight: '600', color: '#1E293B', letterSpacing: -0.2 },
  txCategoryName: { fontSize: 12, color: '#94A3B8', marginTop: 4, fontWeight: '500' },
  txRightSide: { alignItems: 'flex-end', justifyContent: 'center', gap: 6 },
  txAmount: { fontSize: 15, fontWeight: '700', color: '#DC2626', letterSpacing: -0.3 },
  actionRow: { flexDirection: 'row', gap: 6 },
  actionButton: {
    backgroundColor: '#F8FAFC',
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  deleteBtn: { backgroundColor: '#FEF2F2', borderColor: '#FEE2E2' },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 36, gap: 14, paddingTop: 60 },
  emptySub: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 22 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, height: '70%', paddingTop: 14 },
  modalDragHandle: { width: 36, height: 4, backgroundColor: '#E2E8F0', borderRadius: 10, alignSelf: 'center', marginBottom: 12 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  closeIcon: { backgroundColor: '#F1F5F9', padding: 6, borderRadius: 50 },
  formContainer: { paddingHorizontal: 24, paddingTop: 6 },
  amountContainer: { backgroundColor: '#F8FAFC', borderRadius: 20, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#F1F5F9' },
  inputLabel: { fontSize: 10, fontWeight: '700', color: '#64748B', letterSpacing: 1 },
  amountInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 4 },
  currencySymbol: { fontSize: 28, fontWeight: '700', color: '#0F172A', marginRight: 4 },
  amountInput: { flex: 1, fontSize: 32, fontWeight: '700', color: '#0F172A' },
  inputGroup: { marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 8 },
  textInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, paddingHorizontal: 14, height: 52 },
  textInput: { flex: 1, fontSize: 14, color: '#0F172A' },
  saveButton: { backgroundColor: '#0F172A', height: 52, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 8 },
  saveButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
  disabledButton: { opacity: 0.6 }
});

function TransactionsScreenWrapper() {
  return (
    <SafeAreaProvider>
      <TransactionsScreenContent />
    </SafeAreaProvider>
  );
}

export default TransactionsScreenWrapper;