// app/(spenderTabs)/split.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react'; // 1. Gidugang ang useCallback
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  RefreshControl // 2. Gidugang ang RefreshControl
  ,


  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface Friend {
  id: string;
  full_name: string;
  email: string;
}

interface UserBudget {
  id: string;
  allocated_amount: number;
  remaining_amount: number;
  categories: {
    name: string;
  };
}

interface SplitMember {
  id: string;
  friend_id: string;
  owed_amount: number;
  status: 'unpaid' | 'paid';
  friends: {
    full_name: string;
  };
}

interface ActiveSplit {
  id: string;
  description: string;
  total_amount: number;
  personal_share: number;
  created_at: string;
  split_members: SplitMember[];
}

export default function SplitExpenseScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false); // 3. State para sa Pull-to-Refresh
  
  const [friends, setFriends] = useState<Friend[]>([]);
  const [budgets, setBudgets] = useState<UserBudget[]>([]);
  const [activeSplits, setActiveSplits] = useState<ActiveSplit[]>([]);
  
  // Transaction States
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [selectedBudgetId, setSelectedBudgetId] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);

  // Settlement Modal States
  const [settleModalVisible, setSettleModalVisible] = useState(false);
  const [currentSplitToSettle, setCurrentSplitToSettle] = useState<ActiveSplit | null>(null);

  // DATASET SYNCHRONIZATION
  // Giusab aron modawat og parameter kung refresh ba aron hapsay ang loading triggers
  const fetchData = async (isRefreshing = false) => {
    try {
      if (isRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Fetch Friends Directory
      const { data: friendsData } = await supabase
        .from('friends')
        .select('id, full_name, email')
        .eq('user_id', user.id)
        .order('full_name', { ascending: true });
      if (friendsData) setFriends(friendsData);

      // 2. Fetch Budgets
      const { data: budgetsData } = await supabase
        .from('budgets')
        .select(`id, allocated_amount, remaining_amount, categories ( name )`)
        .eq('user_id', user.id);
      if (budgetsData) setBudgets(budgetsData as any);

      // 3. Fetch Active Splits
      const { data: splitsData } = await supabase
        .from('split_expenses')
        .select(`
          id, description, total_amount, personal_share, created_at,
          split_members ( id, friend_id, owed_amount, status, friends ( full_name ) )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (splitsData) setActiveSplits(splitsData as unknown as ActiveSplit[]);

    } catch (error: any) {
      console.error('Error compiling metrics:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false); // Siguraduhong ma-off ang loading icon sa pull down
    }
  };

  // 4. Function nga tawgon inig pull down sa user
  const onRefresh = useCallback(() => {
    fetchData(true);
  }, []);

  const toggleFriendSelection = (id: string) => {
    if (selectedFriendIds.includes(id)) {
      setSelectedFriendIds(selectedFriendIds.filter(fId => fId !== id));
    } else {
      setSelectedFriendIds([...selectedFriendIds, id]);
    }
  };

  // PROCESS NEW SPLIT
  const handleProcessSplit = async () => {
    const parsedTotal = parseFloat(totalAmount);
    if (!description.trim() || isNaN(parsedTotal) || parsedTotal <= 0 || !selectedBudgetId) {
      Alert.alert('Validation Error', 'Please complete the description, amount, and budget category.');
      return;
    }

    if (selectedFriendIds.length === 0) {
      Alert.alert('Missing Friends', 'Please select at least one friend to split this expense with.');
      return;
    }

    const totalPeople = selectedFriendIds.length + 1;
    const shareAmount = parsedTotal / totalPeople;

    const selectedBudget = budgets.find(b => b.id === selectedBudgetId);
    if (!selectedBudget || Number(selectedBudget.remaining_amount) < shareAmount) {
      Alert.alert('Insufficient Balance', `Your personal share is ₱${shareAmount.toFixed(2)}, but this budget only has ₱${Number(selectedBudget?.remaining_amount || 0).toFixed(2)} remaining.`);
      return;
    }

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Deduct operational ledger balance margins
      const newRemaining = Number(selectedBudget.remaining_amount) - shareAmount;
      const { error: budgetError } = await supabase
        .from('budgets')
        .update({ remaining_amount: newRemaining })
        .eq('id', selectedBudgetId);
      if (budgetError) throw budgetError;

      // 2. Insert Base Expense
      const { error: expenseError } = await supabase
        .from('expenses')
        .insert({
          budget_id: selectedBudgetId,
          description: `Split: ${description.trim()} (Your Share)`,
          amount: shareAmount,
          spent_at: new Date().toISOString()
        });
      if (expenseError) throw expenseError;

      // 3. Insert Shared Split Group
      const { data: splitExpense, error: splitError } = await supabase
        .from('split_expenses')
        .insert({
          user_id: user.id,
          budget_id: selectedBudgetId,
          description: description.trim(),
          total_amount: parsedTotal,
          personal_share: shareAmount
        })
        .select()
        .single();
      if (splitError) throw splitError;

      // 4. Batch push relational map rows for corresponding target group peers
      const memberInserts = selectedFriendIds.map(fId => ({
        split_expense_id: splitExpense.id,
        friend_id: fId,
        owed_amount: shareAmount,
        status: 'unpaid'
      }));

      const { error: membersError } = await supabase
        .from('split_members')
        .insert(memberInserts);
      if (membersError) throw membersError;

      Alert.alert('Success 🎉', `Expense shared! Everyone owes ₱${shareAmount.toFixed(2)}.`);
      
      setDescription('');
      setTotalAmount('');
      setSelectedBudgetId('');
      setSelectedFriendIds([]);
      fetchData();

    } catch (error: any) {
      Alert.alert('Error processing split', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // SETTLE MEMBER BALANCES
  const handleSettleFriend = async (memberId: string, friendName: string, amount: number) => {
    Alert.alert(
      'Confirm Settlement',
      `Has ${friendName} paid you ₱${amount.toFixed(2)}? This updates their status to paid.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('split_members')
                .update({ status: 'paid', updated_at: new Date().toISOString() })
                .eq('id', memberId);

              if (error) throw error;

              Alert.alert('Settled 🎉', `${friendName}'s share has been paid.`);
              setSettleModalVisible(false);
              fetchData();
            } catch (error: any) {
              Alert.alert('Processing Error', error.message);
            }
          }
        }
      ]
    );
  };

  const openSettleModal = (split: ActiveSplit) => {
    setCurrentSplitToSettle(split);
    setSettleModalVisible(true);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const previewTotalPeople = selectedFriendIds.length + 1;
  const previewShare = parseFloat(totalAmount) > 0 ? parseFloat(totalAmount) / previewTotalPeople : 0;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      {/* Header Block with Friends Button */}
      <View style={styles.header}>
        <View style={styles.headerMainRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Split the Bill</Text>
          </View>
          <TouchableOpacity 
            style={styles.friendsBtn} 
            onPress={() => router.push('/friends')} 
            activeOpacity={0.7}
          >
            <Ionicons name="people-outline" size={22} color="#0d9e8b" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerSubtext}>Divide balances and coordinate group payouts seamlessly.</Text>
      </View>

      {/* 5. Gidugang ang RefreshControl sa ScrollView */}
      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        keyboardShouldPersistTaps="handled" 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            colors={['#10B981']} // Android spinner color
            tintColor="#10B981"  // iOS spinner color
          />
        }
      >
        {/* Input Details */}
        <View style={styles.mainCard}>
          <Text style={styles.sectionTitle}>Expense Details</Text>
          
          <Text style={styles.label}>What is this for?</Text>
          <TextInput style={styles.input} placeholder="e.g., Dinner, Grab ride, Groceries" placeholderTextColor="#94A3B8" value={description} onChangeText={setDescription} />

          <Text style={styles.label}>Total Amount (₱)</Text>
          <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#94A3B8" keyboardType="numeric" value={totalAmount} onChangeText={setTotalAmount} />

          <Text style={styles.label}>Source Wallet / Budget Allocation</Text>
          <View style={styles.categoryContainer}>
            {budgets.map((b) => (
              <TouchableOpacity
                key={b.id}
                style={[styles.budgetChip, selectedBudgetId === b.id && styles.budgetChipSelected]}
                onPress={() => setSelectedBudgetId(b.id)}
              >
                <Text style={[styles.chipText, selectedBudgetId === b.id && styles.chipTextSelected]}>
                  {b.categories?.name} (₱{Number(b.remaining_amount).toFixed(0)} left)
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Friends Selector */}
        <View style={styles.mainCard}>
          <Text style={styles.sectionTitle}>Split With</Text>
          {friends.length === 0 ? (
            <Text style={styles.emptyText}>No friends linked yet. Link profiles in your Friends tab.</Text>
          ) : (
            friends.map((friend) => {
              const isSelected = selectedFriendIds.includes(friend.id);
              return (
                <TouchableOpacity key={friend.id} style={[styles.friendRow, isSelected && styles.friendRowSelected]} onPress={() => toggleFriendSelection(friend.id)} activeOpacity={0.8}>
                  <View style={styles.friendLeft}>
                    <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                      {isSelected && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                    </View>
                    <Text style={styles.friendName} numberOfLines={1}>{friend.full_name}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Dynamic Calculation Preview Banner */}
        {previewShare > 0 && (
          <View style={styles.previewBanner}>
            <Ionicons name="calculator-outline" size={18} color="#10B981" />
            <Text style={styles.previewText}>
              Calculation: <Text style={{fontWeight: '700'}}>₱{previewShare.toFixed(2)}</Text> each split across {previewTotalPeople} people.
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.submitBtn} onPress={handleProcessSplit} disabled={submitting} activeOpacity={0.8}>
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Ionicons name="pie-chart-outline" size={16} color="#FFFFFF" />
              <Text style={styles.submitBtnText}>Complete Split Setup</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Active Streams History List */}
        <View style={{ marginTop: 32, marginBottom: 16 }}>
          <Text style={styles.sectionTitle}>Active Shared Streams</Text>
          
          {loading ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#10B981" />
            </View>
          ) : activeSplits.length === 0 ? (
            <Text style={styles.emptyText}>No active or past expense splits logged.</Text>
          ) : (
            activeSplits.map((split) => {
              const unpaidCount = split.split_members.filter(m => m.status === 'unpaid').length;

              return (
                <View key={split.id} style={styles.historyCard}>
                  <View style={styles.historyTop}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={styles.historyDesc} numberOfLines={1}>{split.description}</Text>
                      <Text style={styles.historyMeta}>Total: ₱{split.total_amount.toFixed(0)} • Your Share: ₱{split.personal_share.toFixed(0)}</Text>
                    </View>
                    
                    {unpaidCount > 0 ? (
                      <TouchableOpacity style={styles.settleOpenBtn} onPress={() => openSettleModal(split)} activeOpacity={0.8}>
                        <Text style={styles.settleOpenBtnText}>Settle ({unpaidCount})</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.fullySettledBadge}>
                        <Ionicons name="checkmark-circle" size={16} color="#9cf5f5" />
                        <Text style={styles.fullySettledText}>Settled</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Settle Management Drawer Modal */}
      <Modal animationType="slide" transparent={true} visible={settleModalVisible} onRequestClose={() => setSettleModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>Settle: {currentSplitToSettle?.description}</Text>
              <TouchableOpacity onPress={() => setSettleModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>Select a member who has completed their cash transfer to settle their tab:</Text>

            <FlatList
              data={currentSplitToSettle?.split_members}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={styles.settleMemberRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.settleMemberName} numberOfLines={1}>{item.friends?.full_name}</Text>
                    <Text style={styles.settleMemberAmount}>Owes: ₱{item.owed_amount.toFixed(2)}</Text>
                  </View>

                  {item.status === 'unpaid' ? (
                    <TouchableOpacity style={styles.settleActionBtn} onPress={() => handleSettleFriend(item.id, item.friends?.full_name, item.owed_amount)} activeOpacity={0.8}>
                      <Text style={styles.settleActionBtnText}>Mark Paid</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.memberPaidBadge}>
                      <Ionicons name="checkmark" size={14} color="#04ad97" />
                      <Text style={styles.memberPaidText}>Paid</Text>
                    </View>
                  )}
                </View>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}



const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F8FAFC' 
  },
  gradient: {
    flex: 1,
  },
  header: { 
    paddingHorizontal: 24, 
    paddingTop: Platform.OS === 'android' ? 40 : 16,
    paddingBottom: 8 
  },
  headerMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  friendsBtn: {
    padding: 8,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#05627e',
    elevation: 15,
    shadowColor: "#617c7c",
    shadowOpacity: 0.04,
    shadowRadius: 5,
  },
  headerTitle: { 
    fontSize: 32, 
    fontWeight: '800', 
    color: '#0F172A', 
    letterSpacing: -0.75 
  },
  headerSubtext: { 
    fontSize: 14, 
    color: '#64748B', 
    marginTop: 6, 
    fontWeight: '400' 
  },
  scrollContent: { 
    paddingBottom: 40, 
    paddingHorizontal: 24, 
    paddingTop: 16 
  },
  mainCard: { 
    backgroundColor: '#FFFFFF', 
    padding: 20, 
    borderRadius: 20, 
    borderWidth: 1, 
    borderColor: '#108d87', 
    marginBottom: 16,
    shadowColor: '#0F172A', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.02, 
    shadowRadius: 12, 
    elevation: 8,
  },
  sectionTitle: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#0F172A', 
    marginBottom: 4, 
    letterSpacing: -0.3 
  },
  label: { 
    fontSize: 13, 
    fontWeight: '600', 
    color: '#64748B', 
    marginTop: 14, 
    marginBottom: 6 
  },
  input: { 
    borderWidth: 1, 
    borderColor: '#000000', 
    padding: 12, 
    borderRadius: 12, 
    backgroundColor: '#F8FAFC', 
    fontSize: 15, 
    color: '#0F172A',
    elevation: 5,
  },
  categoryContainer: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: 8, 
    marginTop: 6 
  },
  budgetChip: { 
    paddingVertical: 8, 
    paddingHorizontal: 14, 
    borderRadius: 20, 
    backgroundColor: '#F1F5F9', 
    borderWidth: 1, 
    borderColor: '#E2E8F0' 
  },
  budgetChipSelected: { 
    backgroundColor: '#E6F4EA', 
    borderColor: '#10B981' 
  },
  chipText: { 
    fontSize: 12, 
    color: '#475569', 
    fontWeight: '500' 
  },
  chipTextSelected: { 
    color: '#10B981', 
    fontWeight: '700' 
  },
  emptyText: { 
    color: '#94A3B8', 
    fontSize: 14, 
    textAlign: 'center', 
    paddingVertical: 16 
  },
  friendRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 10, 
    paddingHorizontal: 8 
  },
  friendRowSelected: { 
    backgroundColor: '#F8FAFC', 
    borderRadius: 12 
  },
  friendLeft: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 12, 
    flex: 1 
  },
  checkbox: { 
    width: 20, 
    height: 20, 
    borderRadius: 6, 
    borderWidth: 2, 
    borderColor: '#CBD5E1', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  checkboxChecked: { 
    backgroundColor: '#10b9b9', 
    borderColor: '#10B981' 
  },
  friendName: { 
    fontSize: 15, 
    fontWeight: '600', 
    color: '#0F172A', 
    flex: 1 
  },
  previewBanner: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#E6F4EA', 
    padding: 14, 
    borderRadius: 12, 
    gap: 10, 
    marginBottom: 16, 
    borderWidth: 1, 
    borderColor: '#A7F3D0' 
  },
  previewText: { 
    fontSize: 14, 
    color: '#065F46', 
    flex: 1 
  },
  submitBtn: { 
    backgroundColor: '#305c5c', 
    padding: 16, 
    borderRadius: 30, 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center',
    borderColor: '#000000', 
    gap: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  submitBtnText: { 
    color: '#FFFFFF', 
    fontSize: 16, 
    fontWeight: '600' 
  },
  historyCard: { 
    backgroundColor: '#FFFFFF', 
    padding: 16, 
    borderRadius: 16, 
    borderWidth: 1, 
    borderColor: '#E2E8F0', 
    marginBottom: 10 
  },
  historyTop: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  historyDesc: { 
    fontSize: 15, 
    fontWeight: '700', 
    color: '#0F172A', 
    letterSpacing: -0.1 
  },
  historyMeta: { 
    fontSize: 12, 
    color: '#64748B', 
    marginTop: 4 
  },
  settleOpenBtn: { 
    backgroundColor: '#10B981', 
    paddingVertical: 8, 
    paddingHorizontal: 14, 
    borderRadius: 10 
  },
  settleOpenBtnText: { 
    color: '#FFFFFF', 
    fontSize: 12, 
    fontWeight: '600' 
  },
  fullySettledBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4 
  },
  fullySettledText: { 
    color: '#10B981', 
    fontSize: 13, 
    fontWeight: '600' 
  },
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(15, 23, 42, 0.3)', 
    justifyContent: 'flex-end' 
  },
  modalContainer: { 
    backgroundColor: '#FFFFFF', 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24, 
    padding: 24, 
    maxHeight: '60%' 
  },
  modalHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 8 
  },
  modalTitle: { 
    fontSize: 18, 
    fontWeight: '800', 
    color: '#0F172A', 
    flex: 1, 
    marginRight: 8,
    letterSpacing: -0.4
  },
  modalSub: { 
    fontSize: 14, 
    color: '#64748B', 
    marginBottom: 16, 
    lineHeight: 20 
  },
  settleMemberRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingVertical: 14, 
    borderBottomWidth: 1, 
    borderBottomColor: '#F1F5F9' 
  },
  settleMemberName: { 
    fontSize: 15, 
    fontWeight: '600', 
    color: '#0F172A' 
  },
  settleMemberAmount: { 
    fontSize: 13, 
    color: '#64748B', 
    marginTop: 2 
  },
  settleActionBtn: { 
    backgroundColor: '#10B981', 
    paddingVertical: 8, 
    paddingHorizontal: 14, 
    borderRadius: 10 
  },
  settleActionBtnText: { 
    color: '#FFFFFF', 
    fontSize: 12, 
    fontWeight: '600' 
  },
  memberPaidBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4 
  },
  memberPaidText: { 
    color: '#10B981', 
    fontSize: 13, 
    fontWeight: '600' 
  }
});