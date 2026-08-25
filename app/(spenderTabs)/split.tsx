import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { styles } from './split.style';

type Friend = {
  id: string;
  full_name: string;
};

type ActiveSplitFriend = {
  id: string;
  split_expense_id: string;
  friend_id: string;
  owed_amount: number;
  status: 'unpaid' | 'paid';
  friends?: {
    id: string;
    full_name: string;
  };
};

type ActiveSplit = {
  id: string;
  description: string;
  total_amount: number;
  personal_share: number;
  split_type?: 'EQUAL' | 'CUSTOM';
  created_at: string;
  split_friends: ActiveSplitFriend[];
};

type BudgetOption = {
  id: string;
  name?: string;
  allocated_amount: number;
  allowance_id: string;
  categories?: {
    name: string;
  };
  allowances?: {
    id: string;
    start_date: string;
    end_date: string;
  };
  expenses?: { amount: number }[];
};

export default function SplitScreen() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Default Array States
  const [friends, setFriends] = useState<Friend[]>([]);
  const [activeSplits, setActiveSplits] = useState<ActiveSplit[]>([]);
  const [availableBudgets, setAvailableBudgets] = useState<BudgetOption[]>([]);

  // Creation Form States
  const [formVisible, setFormVisible] = useState<boolean>(false);
  const [description, setDescription] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [splitType, setSplitType] = useState<'EQUAL' | 'CUSTOM'>('EQUAL');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [customShares, setCustomShares] = useState<{ [key: string]: string }>({});
  const [activeView, setActiveView] = useState<'history' | 'owes'>('history');

  // Friend Modal State
  const [addFriendModalVisible, setAddFriendModalVisible] = useState<boolean>(false);
  const [newFriendName, setNewFriendName] = useState<string>('');

  // Settlement Management Modal State
  const [settleModalVisible, setSettleModalVisible] = useState<boolean>(false);
  const [selectedSplitForSettle, setSelectedSplitForSettle] = useState<ActiveSplit | null>(null);

  // Settlement Payment Entry Modal State
  const [settleAmountModalVisible, setSettleAmountModalVisible] = useState<boolean>(false);
  const [selectedFriendToSettle, setSelectedFriendToSettle] = useState<ActiveSplitFriend | null>(null);
  const [paymentInputAmount, setPaymentInputAmount] = useState<string>('');

  // Budget Selection Modal State (For New Split creation only)
  const [budgetModalVisible, setBudgetModalVisible] = useState<boolean>(false);
  const [pendingSplitPayload, setPendingSplitPayload] = useState<any>(null);

  // Custom Alert Modal State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (title: string, message: string) => {
    setAlertConfig({ visible: true, title, message });
  };

  useEffect(() => {
    fetchUserAndData();
  }, []);

  const fetchUserAndData = async () => {
    setLoading(true);
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    if (currentUser) {
      setUser(currentUser);
      await fetchData(currentUser.id);
    }
    setLoading(false);
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    if (currentUser) {
      setUser(currentUser);
      await fetchData(currentUser.id);
    }
    setRefreshing(false);
  }, []);

  const calculateRemainingAmount = (budget: any): number => {
    const allocated = budget.allocated_amount || 0;
    const totalSpent = (budget.expenses || []).reduce(
      (sum: number, exp: { amount: number }) => sum + (exp.amount || 0),
      0
    );
    return allocated - totalSpent;
  };

  const fetchData = async (userId: string) => {
    // 1. Fetch Friends
    try {
      const { data: friendsData, error: friendsErr } = await supabase
        .from('friends')
        .select('id, full_name')
        .eq('user_id', userId)
        .order('full_name', { ascending: true });

      if (friendsErr) console.error('Friends fetch error:', friendsErr.message);
      setFriends(friendsData || []);
    } catch (err) {
      console.error('Friends error:', err);
      setFriends([]);
    }

    // 2. Fetch Active Splits
    try {
      const { data: splitsData, error: splitsErr } = await supabase
        .from('split_expenses')
        .select(`
          id,
          user_id,
          description,
          total_amount,
          personal_share,
          created_at,
          split_friends (
            id,
            split_expense_id,
            friend_id,
            owed_amount,
            status,
            friends (
              id,
              full_name
            )
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (splitsErr) console.error('Splits fetch error:', splitsErr.message);
      setActiveSplits((splitsData as unknown as ActiveSplit[]) || []);
    } catch (err) {
      console.error('Splits error:', err);
      setActiveSplits([]);
    }

    // 3. Fetch Budgets
    try {
      const { data: budgetData, error: budgetErr } = await supabase
        .from('budgets')
        .select(`
          id,
          user_id,
          category_id,
          allocated_amount,
          allowance_id,
          categories ( name ),
          allowances ( id, start_date, end_date ),
          expenses ( amount )
        `)
        .eq('user_id', userId);

      if (budgetErr) console.error('Budgets fetch error:', budgetErr.message);

      if (budgetData) {
        const today = new Date().toISOString().split('T')[0];
        const activeBudgets = budgetData.filter((b: any) => {
          const allowance = Array.isArray(b.allowances) ? b.allowances[0] : b.allowances;
          if (!allowance) return true;
          return today >= allowance.start_date && today <= allowance.end_date;
        });

        setAvailableBudgets((activeBudgets as unknown as BudgetOption[]) || []);
      } else {
        setAvailableBudgets([]);
      }
    } catch (err) {
      console.error('Budgets error:', err);
      setAvailableBudgets([]);
    }
  };

  const handleAddFriend = async () => {
    if (!newFriendName.trim() || !user) return;
    try {
      const { data, error } = await supabase
        .from('friends')
        .insert([{ user_id: user.id, full_name: newFriendName.trim() }])
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setFriends((prev) => [...(prev || []), data]);
        setNewFriendName('');
        setAddFriendModalVisible(false);
      }
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to add friend.');
    }
  };

  const toggleSelectFriend = (friendId: string) => {
    if (selectedFriends.includes(friendId)) {
      setSelectedFriends((prev) => prev.filter((id) => id !== friendId));
      const updatedShares = { ...customShares };
      delete updatedShares[friendId];
      setCustomShares(updatedShares);
    } else {
      setSelectedFriends((prev) => [...prev, friendId]);
    }
  };

  const handleCustomShareChange = (friendId: string, val: string) => {
    setCustomShares((prev) => ({ ...prev, [friendId]: val }));
  };

  const handleInitiateCreateSplit = () => {
    const numericAmount = parseFloat(amount);
    if (!description.trim() || isNaN(numericAmount) || numericAmount <= 0) {
      showAlert('Invalid Input', 'Please enter a valid description and amount.');
      return;
    }

    if ((selectedFriends?.length || 0) === 0) {
      showAlert('Select Friends', 'Please select at least one friend to split with.');
      return;
    }

    let calculatedFriendsPayload: { friend_id: string; owed_amount: number }[] = [];
    let ownerShare = 0;

    if (splitType === 'EQUAL') {
      const totalParticipants = selectedFriends.length + 1;
      const share = parseFloat((numericAmount / totalParticipants).toFixed(2));
      ownerShare = share;
      calculatedFriendsPayload = selectedFriends.map((fId) => ({
        friend_id: fId,
        owed_amount: share,
      }));
    } else {
      let customSum = 0;
      for (const fId of selectedFriends) {
        const val = parseFloat(customShares[fId] || '0');
        if (isNaN(val) || val < 0) {
          showAlert('Invalid Share', 'Please enter valid custom amounts for selected friends.');
          return;
        }
        customSum += val;
        calculatedFriendsPayload.push({
          friend_id: fId,
          owed_amount: val,
        });
      }

      if (customSum > numericAmount) {
        showAlert('Math Error', 'The sum of friend shares cannot exceed total amount.');
        return;
      }
      ownerShare = parseFloat((numericAmount - customSum).toFixed(2));
    }

    setPendingSplitPayload({
      description: description.trim(),
      total_amount: numericAmount,
      personal_share: ownerShare,
      split_type: splitType,
      friends: calculatedFriendsPayload,
    });

    setFormVisible(false);
    setBudgetModalVisible(true);
  };

  const handleSelectBudgetAndCreateSplit = async (selectedBudgetId: string) => {
    if (!user || !pendingSplitPayload) return;
    setBudgetModalVisible(false);
    setLoading(true);

    try {
      const { data: budgetData, error: budgetErr } = await supabase
        .from('budgets')
        .select(`
          id, 
          allocated_amount, 
          allowance_id,
          expenses ( amount )
        `)
        .eq('id', selectedBudgetId)
        .single();

      if (budgetErr || !budgetData) {
        showAlert('Error', 'Could not verify budget status.');
        setLoading(false);
        return;
      }

      const selectedBudget = budgetData;
      const remainingAmount = calculateRemainingAmount(selectedBudget);
      const splitAmount = pendingSplitPayload.total_amount;

      if (remainingAmount < splitAmount) {
        showAlert('Insufficient Budget', 'The selected budget category does not have enough balance.');
        setLoading(false);
        return;
      }

      const { error: expErr } = await supabase.from('expenses').insert([
        {
          budget_id: selectedBudgetId,
          amount: splitAmount,
          description: `[Split] ${pendingSplitPayload.description}`,
          spent_at: new Date().toISOString(),
          allowance_id: selectedBudget.allowance_id,
        },
      ]);

      if (expErr) throw expErr;

      const { data: splitExp, error: splitExpErr } = await supabase
        .from('split_expenses')
        .insert([
          {
            user_id: user.id,
            description: pendingSplitPayload.description,
            total_amount: splitAmount,
            personal_share: pendingSplitPayload.personal_share,
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (splitExpErr) throw splitExpErr;

      const friendInserts = (pendingSplitPayload.friends || []).map((f: any) => ({
        split_expense_id: splitExp.id,
        friend_id: f.friend_id,
        owed_amount: f.owed_amount,
        status: 'unpaid',
        updated_at: new Date().toISOString(),
      }));

      const { error: friendsErr } = await supabase.from('split_friends').insert(friendInserts);

      if (friendsErr) throw friendsErr;

      showAlert('Success', 'Split expense saved and deducted from budget!');
      setPendingSplitPayload(null);
      resetForm();
      fetchData(user.id);
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to process split.');
    } finally {
      setLoading(false);
    }
  };

  // 1. Opens the Payment Input Modal when Mark Paid is clicked
  const handleInitiateSettleFriend = (friendShare: ActiveSplitFriend) => {
    setSelectedFriendToSettle(friendShare);
    setPaymentInputAmount(friendShare.owed_amount.toString());
    setSettleAmountModalVisible(true);
  };

  // 2. Confirms repayment, updates split_friends, and increments allowance amount
  const handleConfirmSettlePayment = async () => {
    if (!user || !selectedFriendToSettle) return;

    const paidVal = parseFloat(paymentInputAmount);
    if (isNaN(paidVal) || paidVal <= 0) {
      showAlert('Invalid Amount', 'Please enter a valid amount paid.');
      return;
    }

    setSettleAmountModalVisible(false);
    setLoading(true);

    try {
      const friendName = selectedFriendToSettle.friends?.full_name || 'Friend';
      const currentOwed = selectedFriendToSettle.owed_amount || 0;
      const newOwed = Math.max(0, currentOwed - paidVal);
      const isFullyPaid = newOwed === 0;

      // Step A: Update friend's share in split_friends table
      const { error: updateFriendErr } = await supabase
        .from('split_friends')
        .update({
          owed_amount: parseFloat(newOwed.toFixed(2)),
          status: isFullyPaid ? 'paid' : 'unpaid',
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedFriendToSettle.id);

      if (updateFriendErr) throw updateFriendErr;

      // Step B: Fetch active or fallback allowance using spender_id
      const today = new Date().toISOString().split('T')[0];

      let { data: activeAllowances, error: allowanceErr } = await supabase
        .from('allowances')
        .select('id, amount, start_date, end_date')
        .eq('spender_id', user.id)
        .lte('start_date', today)
        .gte('end_date', today)
        .order('received_at', { ascending: false })
        .limit(1);

      if (allowanceErr) {
        console.error('Allowance fetch error:', allowanceErr.message);
      }

      // Fallback: If no allowance matches the exact current date, retrieve the latest allowance for this spender
      if (!activeAllowances || activeAllowances.length === 0) {
        const { data: latestAllowance, error: latestErr } = await supabase
          .from('allowances')
          .select('id, amount, start_date, end_date')
          .eq('spender_id', user.id)
          .order('end_date', { ascending: false })
          .limit(1);

        if (latestErr) {
          console.error('Latest allowance fetch error:', latestErr.message);
        } else {
          activeAllowances = latestAllowance;
        }
      }

      if (activeAllowances && activeAllowances.length > 0) {
        const activeAllowance = activeAllowances[0];
        const currentAllowanceAmount = parseFloat(activeAllowance.amount || 0);
        const updatedAllowanceAmount = currentAllowanceAmount + paidVal;

        const { error: incErr } = await supabase
          .from('allowances')
          .update({ amount: parseFloat(updatedAllowanceAmount.toFixed(2)) })
          .eq('id', activeAllowance.id);

        if (incErr) {
          console.error('Error updating allowance balance:', incErr.message);
          showAlert('Warning', `Payment recorded, but failed to update allowance: ${incErr.message}`);
        }
      } else {
        showAlert('Notice', 'Payment processed, but no allowance record was found to credit.');
      }

      showAlert(
        'Payment Recorded',
        `Successfully received ₱${paidVal.toFixed(2)} from ${friendName}. ${
          isFullyPaid ? 'Fully settled!' : `Remaining balance: ₱${newOwed.toFixed(2)}`
        }`
      );

      // Update local state for immediate UI feedback
      if (selectedSplitForSettle) {
        setSelectedSplitForSettle((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            split_friends: prev.split_friends.map((sf) =>
              sf.id === selectedFriendToSettle.id
                ? {
                    ...sf,
                    owed_amount: parseFloat(newOwed.toFixed(2)),
                    status: isFullyPaid ? 'paid' : 'unpaid',
                  }
                : sf
            ),
          };
        });
      }

      fetchData(user.id);
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to record payment.');
    } finally {
      setLoading(false);
      setSelectedFriendToSettle(null);
      setPaymentInputAmount('');
    }
  };

  function resetForm() {
    setDescription('');
    setAmount('');
    setSplitType('EQUAL');
    setSelectedFriends([]);
    setCustomShares({});
  }

  const calculateOwnerShare = () => {
    const total = parseFloat(amount) || 0;
    const friendCount = selectedFriends?.length || 0;
    if (splitType === 'EQUAL') {
      const parts = friendCount + 1;
      return (total / parts).toFixed(2);
    } else {
      let customSum = 0;
      (selectedFriends || []).forEach((id) => {
        customSum += parseFloat(customShares[id] || '0');
      });
      return Math.max(0, total - customSum).toFixed(2);
    }
  };

  const getAvatarColor = (name: string) => {
    const colors = ['#E0F2FE', '#DCFCE7', '#FEF3C7', '#F3E8FF', '#FFE4E6'];
    let hash = 0;
    for (let i = 0; i < (name?.length || 0); i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const balanceSummary = (activeSplits || []).reduce(
    (totals, item) => {
      const outstandingFriendBalances = (item.split_friends || []).reduce(
        (sum, friendSplit) => sum + (friendSplit.owed_amount || 0),
        0
      );

      totals.youAreOwed += outstandingFriendBalances;
      totals.youOwe += Number(item.personal_share || 0);

      return totals;
    },
    { youOwe: 0, youAreOwed: 0 }
  );

  const whoOwesSummary = (activeSplits || []).reduce(
    (acc, split) => {
      (split.split_friends || []).forEach((friendSplit) => {
        const isOutstanding = friendSplit.status !== 'paid' || (friendSplit.owed_amount || 0) > 0;
        if (!isOutstanding) return;

        const friendId = friendSplit.friend_id || friendSplit.friends?.id || 'unknown';
        const friendName = friendSplit.friends?.full_name || 'Friend';
        const currentTotal = acc[friendId]?.total || 0;

        acc[friendId] = {
          friendId,
          name: friendName,
          total: currentTotal + (friendSplit.owed_amount || 0),
        };
      });
      return acc;
    },
    {} as Record<string, { friendId: string; name: string; total: number }>
  );

  const whoOwesList = Object.values(whoOwesSummary)
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total);

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.modernHeader}>
        <View style={styles.headerLeft}>
          <Ionicons name="people-circle-outline" size={28} color="#108d87" />
          <Text style={styles.modernHeaderTitle}>Split Expenses</Text>
        </View>
        <TouchableOpacity
          style={styles.quickFormTrigger}
          onPress={() => setFormVisible(true)}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.quickFormTriggerText}>New Split</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#108d87" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#108d87']}
              tintColor="#108d87"
            />
          }
        >
          {/* FRIENDS SECTION */}
          <View style={styles.friendsSection}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Friends List</Text>
              <Text style={styles.sectionCount}>{friends?.length || 0} registered</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalFriendsScroll}>
              <TouchableOpacity style={styles.avatarContainer} onPress={() => setAddFriendModalVisible(true)}>
                <View style={styles.addCircle}>
                  <Ionicons name="add" size={24} color="#94A3B8" />
                </View>
                <Text style={styles.avatarName}>Add Friend</Text>
              </TouchableOpacity>

              {(friends || []).map((f) => (
                <View key={f.id} style={styles.avatarContainer}>
                  <View style={[styles.friendAvatar, { backgroundColor: getAvatarColor(f.full_name || 'F') }]}>
                    <Text style={styles.avatarLetter}>{(f.full_name || 'F').charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.avatarName} numberOfLines={1}>
                    {f.full_name}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>

          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, styles.summaryCardRed]}>
              <Text style={styles.summaryLabel}>Your Share</Text>
              <Text style={styles.summaryAmount}>₱{balanceSummary.youOwe.toFixed(2)}</Text>
              <Text style={styles.summarySubtitle}>Across your split share</Text>
            </View>

            <View style={[styles.summaryCard, styles.summaryCardGreen]}>
              <Text style={styles.summaryLabel}>You are owed</Text>
              <Text style={styles.summaryAmount}>₱{balanceSummary.youAreOwed.toFixed(2)}</Text>
              <Text style={styles.summarySubtitle}>From friends</Text>
            </View>
          </View>

          {/* ACTIVE SPLITS HISTORY */}
          <View style={styles.segmentedRow}>
            <TouchableOpacity
              style={[styles.segmentedButton, activeView === 'history' && styles.segmentedButtonActive]}
              onPress={() => setActiveView('history')}
            >
              <Text style={[styles.segmentedButtonText, activeView === 'history' && styles.segmentedButtonTextActive]}>
                Split Expenses
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentedButton, activeView === 'owes' && styles.segmentedButtonActive]}
              onPress={() => setActiveView('owes')}
            >
              <Text style={[styles.segmentedButtonText, activeView === 'owes' && styles.segmentedButtonTextActive]}>
                Who Owes You
              </Text>
            </TouchableOpacity>
          </View>

          {activeView === 'history' ? (
            (activeSplits?.length || 0) === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="receipt-outline" size={48} color="#CBD5E1" />
                <Text style={styles.emptyText}>No splits recorded yet.</Text>
              </View>
            ) : (
              (activeSplits || []).map((item) => {
                const sfList = item.split_friends || [];
                const allPaid = sfList.length > 0 && sfList.every((sf) => sf.status === 'paid' && sf.owed_amount <= 0);

                return (
                  <View key={item.id} style={styles.historyCard}>
                    <View style={styles.historyTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyDesc}>{item.description}</Text>
                        <Text style={styles.historyMeta}>
                          Total: ₱{item.total_amount?.toFixed(2)} • Your Share: ₱{item.personal_share?.toFixed(2)}
                        </Text>
                      </View>
                      {allPaid ? (
                        <View style={styles.fullySettledBadge}>
                          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                          <Text style={styles.fullySettledText}>Settled</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.settleOpenBtn}
                          onPress={() => {
                            setSelectedSplitForSettle(item);
                            setSettleModalVisible(true);
                          }}
                        >
                          <Text style={styles.settleOpenBtnText}>Manage Shares</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )
          ) : whoOwesList.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="cash-outline" size={48} color="#CBD5E1" />
              <Text style={styles.emptyText}>No one owes you right now.</Text>
            </View>
          ) : (
            whoOwesList.map((person) => (
              <View key={person.friendId} style={styles.historyCard}>
                <View style={styles.historyTop}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View
                      style={[
                        styles.friendAvatar,
                        {
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          marginRight: 12,
                          backgroundColor: getAvatarColor(person.name || 'F'),
                        },
                      ]}
                    >
                      <Text style={[styles.avatarLetter, { fontSize: 14 }]}>
                        {(person.name || 'F').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.historyDesc}>{person.name}</Text>
                  </View>
                  <Text style={styles.settleMemberAmount}>₱{person.total.toFixed(2)}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* CREATION FORM MODAL */}
      <Modal
        visible={formVisible}
        animationType="slide"
        transparent={true}
        presentationStyle="overFullScreen"
        onRequestClose={() => setFormVisible(false)}
      >
        <View style={styles.modalBackground}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Create New Split</Text>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              <View style={styles.formGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={styles.input}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g., Dinner at Luigi's"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Total Amount</Text>
                <TextInput
                  style={styles.input}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="e.g., 1200"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Split Type</Text>
                <View style={styles.splitTypeContainer}>
                  <TouchableOpacity
                    style={[
                      styles.splitTypeButton,
                      splitType === 'EQUAL' && styles.splitTypeButtonActive,
                    ]}
                    onPress={() => setSplitType('EQUAL')}
                  >
                    <Text
                      style={[
                        styles.splitTypeButtonText,
                        splitType === 'EQUAL' && styles.splitTypeButtonTextActive,
                      ]}
                    >
                      Equal
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.splitTypeButton,
                      splitType === 'CUSTOM' && styles.splitTypeButtonActive,
                    ]}
                    onPress={() => setSplitType('CUSTOM')}
                  >
                    <Text
                      style={[
                        styles.splitTypeButtonText,
                        splitType === 'CUSTOM' && styles.splitTypeButtonTextActive,
                      ]}
                    >
                      Custom
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Select Friends</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {(friends || []).map((friend) => (
                    <TouchableOpacity
                      key={friend.id}
                      style={[
                        styles.friendSelectButton,
                        selectedFriends.includes(friend.id) && styles.friendSelectButtonActive,
                      ]}
                      onPress={() => toggleSelectFriend(friend.id)}
                    >
                      <View style={[styles.friendAvatar, { backgroundColor: getAvatarColor(friend.full_name) }]}>
                        <Text style={styles.avatarLetter}>{friend.full_name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text style={styles.friendName}>{friend.full_name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {splitType === 'CUSTOM' && (
                <View style={styles.customSharesContainer}>
                  <Text style={styles.label}>Custom Shares</Text>
                  {selectedFriends.map((friendId) => (
                    <View key={friendId} style={styles.customShareRow}>
                      <Text style={styles.friendName}>
                        {
                          friends.find((f) => f.id === friendId)?.full_name
                            ?.split(' ')
                            .map((n) => n.charAt(0).toUpperCase() + n.slice(1))
                            .join(' ') || 'Unknown Friend'
                        }
                      </Text>
                      <TextInput
                        style={styles.customShareInput}
                        value={customShares[friendId]}
                        onChangeText={(val) => handleCustomShareChange(friendId, val)}
                        placeholder="e.g., 400"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                      />
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity style={styles.createSplitButton} onPress={handleInitiateCreateSplit}>
                <Text style={styles.createSplitButtonText}>Create Split</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.closeButton} onPress={() => setFormVisible(false)}>
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ADD FRIEND MODAL */}
      <Modal
        visible={addFriendModalVisible}
        animationType="slide"
        transparent={true}
        presentationStyle="overFullScreen"
        onRequestClose={() => setAddFriendModalVisible(false)}
      >
        <View style={styles.modalBackground}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Add New Friend</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Friend's Name</Text>
              <TextInput
                style={styles.input}
                value={newFriendName}
                onChangeText={setNewFriendName}
                placeholder="e.g., John Doe"
                placeholderTextColor="#94A3B8"
              />
            </View>

            <TouchableOpacity style={styles.addFriendButton} onPress={handleAddFriend}>
              <Text style={styles.addFriendButtonText}>Add Friend</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeButton} onPress={() => setAddFriendModalVisible(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SETTLE MANAGEMENT MODAL */}
      <Modal
        visible={settleModalVisible}
        animationType="slide"
        transparent={true}
        presentationStyle="overFullScreen"
        onRequestClose={() => setSettleModalVisible(false)}
      >
        <View style={styles.modalBackground}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Manage Split Shares</Text>

            {selectedSplitForSettle ? (
              <>
                <View style={styles.settleSummaryRow}>
                  <Text style={styles.settleSummaryLabel}>Description:</Text>
                  <Text style={styles.settleSummaryValue}>{selectedSplitForSettle.description}</Text>
                </View>

                <View style={styles.settleSummaryRow}>
                  <Text style={styles.settleSummaryLabel}>Total Amount:</Text>
                  <Text style={styles.settleSummaryValue}>
                    ₱{selectedSplitForSettle.total_amount?.toFixed(2)}
                  </Text>
                </View>

                <View style={styles.settleSummaryRow}>
                  <Text style={styles.settleSummaryLabel}>Your Share:</Text>
                  <Text style={styles.settleSummaryValue}>
                    ₱{selectedSplitForSettle.personal_share?.toFixed(2)}
                  </Text>
                </View>

                <View style={styles.divider} />

                <Text style={styles.settleMembersTitle}>Split Members</Text>

                {(selectedSplitForSettle.split_friends || []).map((friendShare) => (
                  <View key={friendShare.id} style={styles.settleMemberRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <View
                        style={[
                          styles.friendAvatar,
                          {
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            marginRight: 12,
                            backgroundColor: getAvatarColor(friendShare.friends?.full_name || 'F'),
                          },
                        ]}
                      >
                        <Text style={[styles.avatarLetter, { fontSize: 14 }]}
                        >
                          {(friendShare.friends?.full_name || 'F').charAt(0).toUpperCase()
                          }
                        </Text>
                      </View>
                      <Text style={styles.settleMemberName}>{friendShare.friends?.full_name}</Text>
                    </View>
                    <View style={styles.settleMemberActions}>
                      {friendShare.status === 'paid' ? (
                        <Text style={styles.settleMemberStatusPaid}>Settled</Text>
                      ) : (
                        <TouchableOpacity
                          style={styles.settleMemberButton}
                          onPress={() => handleInitiateSettleFriend(friendShare)}
                        >
                          <Text style={styles.settleMemberButtonText}>Mark as Paid</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </>
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No split selected.</Text>
              </View>
            )}

            <TouchableOpacity style={styles.closeButton} onPress={() => setSettleModalVisible(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SETTLE PAYMENT INPUT MODAL */}
      <Modal
        visible={settleAmountModalVisible}
        animationType="slide"
        transparent={true}
        presentationStyle="overFullScreen"
        onRequestClose={() => setSettleAmountModalVisible(false)}
      >
        <View style={styles.modalBackground}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Settle Payment</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Amount Paid</Text>
              <TextInput
                style={styles.input}
                value={paymentInputAmount}
                onChangeText={setPaymentInputAmount}
                placeholder="e.g., 500"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.settlePaymentSummary}>
              <Text style={styles.settlePaymentLabel}>You are receiving:</Text>
              <Text style={styles.settlePaymentAmount}>
                ₱
                {selectedFriendToSettle
                  ? (selectedFriendToSettle.owed_amount - parseFloat(paymentInputAmount)).toFixed(2)
                  : '0.00'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.settlePaymentButton}
              onPress={handleConfirmSettlePayment}
            >
              <Text style={styles.settlePaymentButtonText}>Confirm Payment</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeButton} onPress={() => setSettleAmountModalVisible(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ALERT MODAL */}
      <Modal
        visible={alertConfig.visible}
        animationType="slide"
        transparent={true}
        presentationStyle="overFullScreen"
        onRequestClose={() => setAlertConfig({ ...alertConfig, visible: false })}
      >
        <View style={styles.modalBackground}>
          <View style={styles.alertContainer}>
            <Text style={styles.alertTitle}>{alertConfig.title}</Text>
            <Text style={styles.alertMessage}>{alertConfig.message}</Text>

            <TouchableOpacity
              style={styles.alertButton}
              onPress={() => setAlertConfig({ ...alertConfig, visible: false })}
            >
              <Text style={styles.alertButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}