import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { categoryThemes, colors, styles } from './split.style';

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

      const remainingAmount = calculateRemainingAmount(budgetData);
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
          allowance_id: budgetData.allowance_id,
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

  const resetForm = () => {
    setDescription('');
    setAmount('');
    setSplitType('EQUAL');
    setSelectedFriends([]);
    setCustomShares({});
  };

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

  // Shared avatar palette — same style family as categoryThemes used in the
  // budget picker below. Each entry is just { bg, text } since avatars only
  // show a flat circle + initial (no separate icon).
  const CARD_THEMES = [
    { bg: '#54C9CC', text: '#ffffff' },
    { bg: '#7EA00E', text: '#ffffff' },
    { bg: '#DCD964', text: '#213502' },
  ];
  const getAvatarTheme = (index: number) => CARD_THEMES[index % CARD_THEMES.length];

  // This was missing entirely in this version of the file, which is why
  // both summary pills rendered with a label but no ₱ amount.
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

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.modernHeader}>
        <View style={styles.headerLeft}>
          <Ionicons name="people-circle-outline" size={28} color="#FFFFFF" />
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
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        > 

          <View style={styles.summaryPillsContainer}>
            <View style={[styles.summaryPill, styles.summaryPillOwed]}>
              <Text style={styles.summaryPillLabel}>Who Owes You</Text>
              <Text style={styles.summaryPillAmount}>₱{balanceSummary.youAreOwed.toFixed(2)}</Text>
            </View>

            <View style={[styles.summaryPill, styles.summaryPillOwe]}>
              <Text style={styles.summaryPillLabel}>Your Share</Text>
              <Text style={styles.summaryPillAmount}>₱{balanceSummary.youOwe.toFixed(2)}</Text>
            </View>
          </View>

          {/* FRIENDS SECTION */}
          <View style={styles.friendsSection}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Friends List</Text>
              <Text style={styles.sectionCount}>{friends?.length || 0} registered</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalFriendsScroll}>
              <TouchableOpacity style={styles.avatarContainer} onPress={() => setAddFriendModalVisible(true)}>
                <View style={styles.addCircle}>
                  <Ionicons name="add" size={24} color={colors.textFaint} />
                </View>
                <Text style={styles.avatarName}>Add Friend</Text>
              </TouchableOpacity>

              {(friends || []).map((f, index) => {
                const theme = getAvatarTheme(index);
                return (
                  <View key={f.id} style={styles.avatarContainer}>
                    <View style={[styles.friendAvatar, { backgroundColor: theme.bg }]}>
                      <Text style={[styles.avatarLetter, { color: theme.text }]}>
                        {(f.full_name || 'F').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.avatarName} numberOfLines={1}>
                      {f.full_name}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>

          {/* ACTIVE SPLITS HISTORY */}
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Split History</Text>
          </View>

          {(activeSplits?.length || 0) === 0 ? (
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
                        <Ionicons name="checkmark-circle" size={16} color={colors.positive} />
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
          )}
        </ScrollView>
      )}

      {/* CREATE SPLIT — floating centered card */}
      <Modal visible={formVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.formDrawerContainer}>
            <View style={styles.pullBar} />
            <View style={styles.modalHeader}>
              <Text style={styles.drawerTitle}>Create Split Expense</Text>
              <TouchableOpacity style={styles.closeCircle} onPress={() => setFormVisible(false)}>
                <Ionicons name="close" size={23} color={colors.headerDarker} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Dinner with Friends"
                placeholderTextColor={colors.textFaint}
                value={description}
                onChangeText={setDescription}
              />

              <Text style={styles.label}>Total Amount (₱)</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={colors.textFaint}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />

              <Text style={styles.label}>Split Method</Text>
              <View style={styles.tabContainer}>
                <TouchableOpacity
                  style={[styles.tabBtn, splitType === 'EQUAL' && styles.tabBtnActive]}
                  onPress={() => setSplitType('EQUAL')}
                >
                  <Text style={[styles.tabBtnText, splitType === 'EQUAL' && styles.tabBtnTextActive]}>Equal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabBtn, splitType === 'CUSTOM' && styles.tabBtnActive]}
                  onPress={() => setSplitType('CUSTOM')}
                >
                  <Text style={[styles.tabBtnText, splitType === 'CUSTOM' && styles.tabBtnTextActive]}>Custom</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Select Friends Included</Text>
              {(friends?.length || 0) === 0 ? (
                <Text style={styles.emptyInlineText}>No friends added yet. Please add a friend first.</Text>
              ) : (
                <View style={styles.inlineChecklist}>
                  {(friends || []).map((f) => {
                    const isSelected = selectedFriends.includes(f.id);
                    return (
                      <TouchableOpacity
                        key={f.id}
                        style={[styles.checkChip, isSelected && styles.checkChipSelected]}
                        onPress={() => toggleSelectFriend(f.id)}
                      >
                        <Ionicons
                           name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                          size={16}
                          color={isSelected ? colors.primary : colors.textMuted}
                        />
                        <Text style={[styles.checkChipText, isSelected && styles.checkChipTextSelected]}>
                          {f.full_name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {splitType === 'CUSTOM' && (selectedFriends?.length || 0) > 0 && (
                <View style={styles.customSection}>
                  <Text style={styles.customSectionTitle}>Enter Friend Shares (₱)</Text>
                  {selectedFriends.map((fId) => {
                    const friendObj = (friends || []).find((f) => f.id === fId);
                    return (
                      <View key={fId} style={styles.customRow}>
                        <Text style={styles.customMemberName}>{friendObj?.full_name || 'Friend'}</Text>
                        <TextInput
                          style={styles.customInput}
                          placeholder="0.00"
                          placeholderTextColor={colors.textFaint}
                          keyboardType="numeric"
                          value={customShares[fId] || ''}
                          onChangeText={(val) => handleCustomShareChange(fId, val)}
                        />
                      </View>
                    );
                  })}
                </View>
              )}

              {amount !== '' && (selectedFriends?.length || 0) > 0 && (
                <View style={styles.previewBanner}>
                  <Ionicons name="information-circle-outline" size={20} color={colors.positive} />
                  <Text style={styles.previewText}>
                    Your Personal Share: <Text style={{ fontWeight: '800' }}>₱{calculateOwnerShare()}</Text>
                  </Text>
                </View>
              )}

              <TouchableOpacity style={styles.submitBtn} onPress={handleInitiateCreateSplit}>
                <Text style={styles.submitBtnText}>Confirm & Process Split</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* SELECT BUDGET MODAL (FOR CREATION ONLY) — themed rows, matching Home's Quick Budget cards */}
      <Modal visible={budgetModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.alertModalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Budget Category</Text>
              <TouchableOpacity style={styles.closeCircle} onPress={() => setBudgetModalVisible(false)}>
                <Ionicons name="close" size={20} color={colors.headerDarker} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>Select category to deduct the total expense:</Text>

            {(availableBudgets?.length || 0) === 0 ? (
              <Text style={styles.emptyText}>No active budget categories available.</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
                {(availableBudgets || []).map((b, index) => {
                  const remaining = calculateRemainingAmount(b);
                  const theme = categoryThemes[index % categoryThemes.length];
                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={[styles.budgetChipOption, { backgroundColor: theme.bg }]}
                      onPress={() => handleSelectBudgetAndCreateSplit(b.id)}
                    >
                      <View style={[styles.budgetIconCircle, { backgroundColor: theme.iconBg }]}>
                        <Ionicons name="folder-outline" size={18} color={theme.iconColor} />
                      </View>
                      <View style={styles.budgetTextGroup}>
                        <Text style={[styles.budgetName, { color: theme.text }]}>
                          {b.categories?.name || b.name || 'Budget Category'}
                        </Text>
                        <Text style={[styles.budgetBalance, { color: theme.text }]}>
                          Remaining: ₱{remaining.toFixed(2)}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={theme.text} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ADD FRIEND MODAL */}
      <Modal visible={addFriendModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.alertModalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Friend</Text>
              <TouchableOpacity style={styles.closeCircle} onPress={() => setAddFriendModalVisible(false)}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.input, { marginTop: 12 }]}
              placeholder="Friend's Full Name"
              placeholderTextColor={colors.textFaint}
              value={newFriendName}
              onChangeText={setNewFriendName}
            />

            <TouchableOpacity style={styles.submitBtn} onPress={handleAddFriend}>
              <Text style={styles.submitBtnText}>Save Friend</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MANAGE SHARES & SETTLEMENT MODAL — floating centered card */}
      <Modal visible={settleModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedSplitForSettle?.description}</Text>
              <TouchableOpacity style={styles.closeCircle} onPress={() => setSettleModalVisible(false)}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>Track paid shares or mark friend as settled:</Text>

            <FlatList
              data={selectedSplitForSettle?.split_friends || []}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isPaid = item.status === 'paid' && item.owed_amount <= 0;
                const friendName = item.friends?.full_name || 'Friend';

                return (
                  <View style={styles.settleMemberCard}>
                    <View style={styles.settleMemberCardHeader}>
                      <View style={styles.settleMemberIdentity}>
                        <View style={styles.settleMemberAvatarChip}>
                          <Text style={styles.settleMemberAvatarChipText}>
                            {friendName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.settleMemberName}>{friendName}</Text>
                      </View>
                    </View>

                    <View style={styles.settleMemberAmountBlock}>
                      <Text style={styles.settleMemberAmountLabel}>Remaining Owes</Text>
                      <Text style={styles.settleMemberAmountValue}>₱{(item.owed_amount || 0).toFixed(2)}</Text>
                    </View>

                    {isPaid ? (
                      <View style={styles.settleMemberPaidPill}>
                        <Ionicons name="checkmark-circle" size={16} color={colors.positive} />
                        <Text style={styles.settleMemberPaidPillText}>Paid</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.settleMemberCTA}
                        onPress={() => handleInitiateSettleFriend(item)}
                      >
                        <Text style={styles.settleMemberCTAText}>Mark as Paid</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* PAYMENT ENTRY INPUT MODAL FOR MARK PAID */}
      <Modal visible={settleAmountModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.alertModalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Payment</Text>
              <TouchableOpacity
                style={styles.closeCircle}
                onPress={() => setSettleAmountModalVisible(false)}
              >
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              Friend: <Text style={{ fontWeight: 'bold' }}>{selectedFriendToSettle?.friends?.full_name || 'Friend'}</Text>
            </Text>
            <Text style={[styles.modalSub, { marginTop: 4 }]}>
              Current Owed: ₱{(selectedFriendToSettle?.owed_amount || 0).toFixed(2)}
            </Text>

            <Text style={[styles.label, { marginTop: 12 }]}>Amount Received (₱)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={colors.textFaint}
              keyboardType="numeric"
              value={paymentInputAmount}
              onChangeText={setPaymentInputAmount}
            />

            <TouchableOpacity
              style={[styles.submitBtn, { marginTop: 16 }]}
              onPress={handleConfirmSettlePayment}
            >
              <Text style={styles.submitBtnText}>Confirm & Add to Allowance</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* CUSTOM ALERT MODAL */}
      <Modal visible={alertConfig.visible} animationType="fade" transparent>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.alertModalContainer}>
            <Text style={styles.modalTitle}>{alertConfig.title}</Text>
            <Text style={[styles.modalSub, { marginTop: 8 }]}>{alertConfig.message}</Text>
            <TouchableOpacity
              style={[styles.submitBtn, { marginTop: 12 }]}
              onPress={() => setAlertConfig({ visible: false, title: '', message: '' })}
            >
              <Text style={styles.submitBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}