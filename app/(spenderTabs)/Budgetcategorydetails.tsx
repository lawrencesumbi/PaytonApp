import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
// Gi-import nato kini para sa saktong padding sa ibabaw sa screen
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

interface Expense {
  id: string;
  amount: number;
  description: string;
  spent_at: string;
}

// Gi-separate nato ang Main Content para magamit ang useSafeAreaInsets sa sulod
function BudgetCategoryDetailsContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets(); // Kani ang mokuha sa saktong sukod sa ibabaw sa screen
  
  const params = useLocalSearchParams<{
    budgetId: string;
    categoryName: string;
    categoryIcon: string;
    categoryColor: string;
    allocatedAmount: string;
    remainingAmount: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [totalSpent, setTotalSpent] = useState(0);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchExpenses = useCallback(async () => {
    try {
      setLoading(true);
      if (!params.budgetId) return;

      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('budget_id', params.budgetId)
        .order('spent_at', { ascending: false });

      if (error) throw error;

      const expensesList = (data || []) as Expense[];
      setExpenses(expensesList);
      setFilteredExpenses(expensesList);

      const total = expensesList.reduce((sum, exp) => sum + (exp.amount || 0), 0);
      setTotalSpent(total);
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

  const handleAddExpense = async () => {
    if (!expenseDescription.trim() || !expenseAmount.trim()) {
      Alert.alert("Missing Info", "Please fill in all fields.");
      return;
    }

    const amountNum = parseFloat(expenseAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount.");
      return;
    }

    try {
      setIsSubmitting(true);
      
      const { error } = await supabase
        .from('expenses')
        .insert([
          {
            budget_id: params.budgetId,
            description: expenseDescription.trim(),
            amount: amountNum,
            spent_at: new Date().toISOString(),
          }
        ]);

      if (error) throw error;

      setExpenseDescription('');
      setExpenseAmount('');
      setIsModalVisible(false);
      
      fetchExpenses();
      Alert.alert("Success", "Expense added successfully!");
    } catch (error: any) {
      console.error("Add Expense Error:", error.message);
      Alert.alert("Error", "Failed to add expense");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim() === '') {
      setFilteredExpenses(expenses);
    } else {
      const filtered = expenses.filter((expense) =>
        expense.description.toLowerCase().includes(query.toLowerCase())
      );
      setFilteredExpenses(filtered);
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

  const allocated = parseFloat(params.allocatedAmount || '0');
  const remaining = parseFloat(params.remainingAmount || '0');
  
  const rawPercent = allocated > 0 ? ((allocated - remaining) / allocated) * 100 : 0;
  const spentPercent = Math.min(Math.max(rawPercent, 0), 100);

  const themeColor = params.categoryColor || '#087996';

  if (loading) {
    return (
      <View style={[styles.container, styles.centeredContent]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={themeColor} />
      </View>
    );
  }

  return (
    // Gi-apil ang dynamic padding sa container gamit ang insets.bottom para sa ubos
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />

      {/* HEADER SECTION WITH DYNAMIC INSET PADDING 
        Gidugangan og insets.top aron automatic manaog kon naay notch o status bar ang phone
      */}
      <View style={[
        styles.header, 
        { paddingTop: Platform.OS === 'android' ? insets.top + 16 : insets.top + 10 }
      ]}>
        <TouchableOpacity 
          activeOpacity={0.7}
          onPress={() => router.replace('/(spenderTabs)/budget')}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle} numberOfLines={1}>{params.categoryName || 'Category'}</Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setIsModalVisible(true)}
          style={styles.addButton}
        >
          <Ionicons name="add-circle" size={28} color={themeColor} />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        {/* Category Budget Card */}
        <View style={[styles.categoryCard, { backgroundColor: themeColor }]}>
          <View style={styles.categoryCardContent}>
            <View style={styles.categoryIconWrapper}>
              {/* @ts-ignore */}
              <Ionicons name={params.categoryIcon || 'folder-outline'} size={36} color="#FFFFFF" />
            </View>
            
            <Text style={styles.categoryCardTitle}>{params.categoryName}</Text>
            <Text style={styles.categoryCardAmount}>₱{allocated.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
            
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${spentPercent}%` }]} />
              </View>
            </View>

            <View style={styles.spentInfoRow}>
              <View style={styles.spentInfoItem}>
                <Text style={styles.spentInfoLabel}>Spent</Text>
                <Text style={styles.spentInfoAmount}>₱{(allocated - remaining).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
              </View>
              <View style={styles.spentInfoDivider} />
              <View style={styles.spentInfoItem}>
                <Text style={styles.spentInfoLabel}>Remaining</Text>
                <Text style={styles.spentInfoAmount}>₱{remaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Search Input Container */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search transactions"
            placeholderTextColor="#CBD5E1"
            value={searchQuery}
            onChangeText={handleSearch}
            autoCorrect={false}
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => handleSearch('')} style={styles.clearButton}>
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

                <Text style={[styles.transactionAmount, { color: themeColor }]}>
                  -₱{(expense.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ADD EXPENSE MODAL COMPONENT */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Expense</Text>
              <TouchableOpacity 
                onPress={() => setIsModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalForm}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., Grocery Shopping"
                  placeholderTextColor="#94A3B8"
                  value={expenseDescription}
                  onChangeText={setExpenseDescription}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Amount (₱)</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="0.00"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  value={expenseAmount}
                  onChangeText={setExpenseAmount}
                />
              </View>

              <TouchableOpacity 
                activeOpacity={0.8}
                style={[styles.submitButton, { backgroundColor: themeColor }]}
                onPress={handleAddExpense}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Save Expense</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Wrapper aron masiguro nga naay SafeAreaProvider ang tibuok screen context
export default function BudgetCategoryDetailsScreen() {
  return (
    <SafeAreaProvider>
      <BudgetCategoryDetailsContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#FAFBFD' 
  },
  centeredContent: { 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 16, // Gi-remove ang hardcoded paddingTop kay dynamic na sa taas
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
  headerContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  addButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flex: 1,
  },
  categoryCard: {
    marginHorizontal: 24,
    marginTop: 20,
    marginBottom: 24,
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  categoryCardContent: {
    alignItems: 'center',
    gap: 12,
  },
  categoryIconWrapper: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  categoryCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    opacity: 0.9,
    letterSpacing: -0.2,
  },
  categoryCardAmount: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.8,
  },
  progressBarContainer: {
    width: '100%',
    marginVertical: 12,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
  },
  spentInfoRow: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  spentInfoItem: {
    alignItems: 'center',
    flex: 1,
  },
  spentInfoLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 4,
  },
  spentInfoAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  spentInfoDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginBottom: 24,
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
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
  },
  clearButton: {
    padding: 4,
  },
  transactionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  transactionsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  transactionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  transactionsList: {
    paddingHorizontal: 24,
    gap: 12,
  },
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
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionContent: {
    flex: 1,
    justifyContent: 'center',
  },
  transactionDescription: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    fontWeight: '400',
    color: '#94A3B8',
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  emptyTransactions: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 36,
    gap: 12,
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: -0.3,
  },
  emptySubtext: {
    fontSize: 12,
    fontWeight: '400',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalForm: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  modalInput: {
    height: 48,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
  },
  submitButton: {
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});