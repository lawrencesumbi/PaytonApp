import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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

interface Transaction {
  id: string;
  budget_id: string;
  amount: number;
  description: string;
  spent_at: string;
  budgets: {
    remaining_amount: number;
    allocated_amount: number;
    categories: {
      name: string;
      icon: string;
      color: string;
    };
  };
}

export default function TransactionsScreen() {
  const router = useRouter(); 

  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  // New State alang sa Search
  const [searchQuery, setSearchQuery] = useState('');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [updating, setUpdating] = useState(false);

  const handleBackPress = () => {
    router.push('/home'); 
  };

  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. I-fetch ang mga expenses gamit ang foreign key column reference sa husto nga paagi
      const { data, error } = await supabase
        .from('expenses')
        .select(`
          id,
          budget_id,
          amount,
          description,
          spent_at,
          budgets!inner (
            remaining_amount,
            allocated_amount,
            user_id,
            categories (
              name,
              icon,
              color
            )
          )
        `)
        .eq('budgets.user_id', user.id) // Filter sa owner sa budget
        .order('spent_at', { ascending: false });

      if (error) throw error;

      // 2. I-map ang data aron masiguro nga makuha ang Object imbes nga Array (kung nag-array man gani ang categories)
      const formattedData = (data || []).map((item: any) => {
        // Usahay ang nested joins i-return sa Supabase isip Array [ {} ] imbes nga Object {}
        const rawCategory = Array.isArray(item.budgets?.categories) 
          ? item.budgets.categories[0] 
          : item.budgets?.categories;

        return {
          id: item.id,
          budget_id: item.budget_id,
          amount: Number(item.amount),
          description: item.description,
          spent_at: item.spent_at,
          budgets: {
            remaining_amount: Number(item.budgets?.remaining_amount || 0),
            allocated_amount: Number(item.budgets?.allocated_amount || 0),
            categories: {
              name: rawCategory?.name || 'Uncategorized',
              icon: rawCategory?.icon || 'receipt-outline',
              color: rawCategory?.color || '#64748B'
            }
          }
        };
      });

      setTransactions(formattedData as Transaction[]);
    } catch (error: any) {
      console.error('Fetch Transactions Error:', error.message);
      Alert.alert("Database Error", "Dili makuha ang imong mga transactions karon.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // FILTER LOGIC PARA SA SEARCH
  // Susiha ang Description o ang Category Name base sa gi-type sa user
  const filteredTransactions = transactions.filter(tx => {
    const query = searchQuery.toLowerCase();
    const matchesDescription = tx.description?.toLowerCase().includes(query);
    const matchesCategory = tx.budgets?.categories?.name?.toLowerCase().includes(query);
    return matchesDescription || matchesCategory;
  });

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

  if (loading && transactions.length === 0) {
    return (
      <SafeAreaView style={[styles.container, styles.centeredContent]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="small" color="#10B981" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* HEADER SECTION */}
      <View style={styles.headerContainer}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerTextWrapper}>
          <Text style={styles.headerTitle}>Transactions</Text>
          <Text style={styles.headerSubtitle}>History of your cash logs</Text>
        </View>
      </View>

      {/* SEARCH BAR CONTAINER */}
      <View style={styles.searchContainer}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search transactions or categories..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing" // Para sa iOS naay x button inside
          />
          {searchQuery.length > 0 && Platform.OS === 'android' && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* DYNAMIC LISTING */}
      {filteredTransactions.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="receipt-outline" size={32} color="#64748B" />
          </View>
          <Text style={styles.emptyText}>
            {searchQuery.length > 0 ? "No Results Found" : "No Transactions Yet"}
          </Text>
          <Text style={styles.emptySub}>
            {searchQuery.length > 0 
              ? `We couldn't find any matches for "${searchQuery}". Try checking your spelling.`
              : "Expenses that you record from your active wallet folders will display chronologically here."
            }
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredTransactions} // Gigamit ang filtered list imbes nga katong raw data
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const txDate = new Date(item.spent_at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            });

            return (
              <View style={styles.txCard}>
                <View style={[styles.iconWrapper, { backgroundColor: `${item.budgets.categories.color}15` }]}>
                  {/* @ts-ignore */}
                  <Ionicons name={item.budgets.categories.icon || 'receipt-outline'} size={20} color={item.budgets.categories.color} />
                </View>

                <View style={styles.txDetails}>
                  <Text style={styles.txDescription} numberOfLines={1}>{item.description}</Text>
                  <Text style={styles.txCategoryName}>{item.budgets.categories.name} • {txDate}</Text>
                </View>

                <View style={styles.txRightSide}>
                  <Text style={styles.txAmount}>-₱{item.amount.toFixed(2)}</Text>
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.actionButton} onPress={() => handleOpenEditModal(item)}>
                      <Ionicons name="pencil" size={14} color="#64748B" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionButton, styles.deleteBtn]} onPress={() => handleDeleteTx(item)}>
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* EDIT MODAL DIALOGUE */}
      <Modal
        visible={isEditModalOpen}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        onRequestClose={handleCloseEditModal}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleCloseEditModal} />
          
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalContent}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
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
                    <Text style={styles.inputLabel}>RE-ENTER KANTIDAD (₱)</Text>
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
  
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? (NativeStatusBar.currentHeight ? NativeStatusBar.currentHeight + 16 : 34) : 20,
    paddingBottom: 8,
    gap: 12
  },
  backButton: {
    padding: 8,
    borderRadius: 50,
    backgroundColor: '#F1F5F9',
  },
  headerTextWrapper: { flex: 1 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 13, color: '#64748B', marginTop: 2, fontWeight: '500' },

  // NEW STYLES ALANG SA SEARCH INPUT
  searchContainer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 8,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 0
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
  txAmount: { fontSize: 15, fontWeight: '700', color: '#EF4444', letterSpacing: -0.3 },
  actionRow: { flexDirection: 'row', gap: 6 },
  actionButton: {
    backgroundColor: '#F8FAFC',
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  deleteBtn: { backgroundColor: '#FEF2F2', borderColor: '#FEE2E2' },
  emptyState: { flex: 0.8, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 36, gap: 14 },
  emptyIconContainer: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#1E293B' },
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