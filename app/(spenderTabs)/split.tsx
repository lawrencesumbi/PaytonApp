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
  email?: string;
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

// PAYTON PALETTE FOR AVATARS (Same grid logic as category cards)
const AVATAR_PALETTE = ['#1F4F59', '#7EA00E', '#D97706', '#475569'];

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
  const [newFriendEmail, setNewFriendEmail] = useState<string>('');

  // Settlement Management Modal State
  const [settleModalVisible, setSettleModalVisible] = useState<boolean>(false);
  const [selectedSplitForSettle, setSelectedSplitForSettle] = useState<ActiveSplit | null>(null);

  // Settlement Payment Entry Modal State
  const [settleAmountModalVisible, setSettleAmountModalVisible] = useState<boolean>(false);
  const [selectedFriendToSettle, setSelectedFriendToSettle] = useState<ActiveSplitFriend | null>(null);
  const [paymentInputAmount, setPaymentInputAmount] = useState<string>('');

  // Budget Selection Modal State
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
    try {
      const { data: friendsData, error: friendsErr } = await supabase
        .from('friends')
        .select('id, full_name, email')
        .eq('user_id', userId)
        .order('full_name', { ascending: true });

      if (friendsErr) console.error('Friends fetch error:', friendsErr.message);
      setFriends(friendsData || []);
    } catch (err) {
      console.error('Friends error:', err);
      setFriends([]);
    }

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
    if (!newFriendName.trim() || !newFriendEmail.trim() || !user) {
      showAlert('Missing Information', 'Please enter both full name and email.');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('friends')
        .insert([
          { 
            user_id: user.id, 
            full_name: newFriendName.trim(),
            email: newFriendEmail.trim().toLowerCase()
          }
        ])
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setFriends((prev) => [...(prev || []), data]);
        setNewFriendName('');
        setNewFriendEmail('');
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

  const handleInitiateSettleFriend = (friendShare: ActiveSplitFriend) => {
    setSelectedFriendToSettle(friendShare);
    setPaymentInputAmount(friendShare.owed_amount.toString());
    setSettleAmountModalVisible(true);
  };

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

      const { error: updateFriendErr } = await supabase
        .from('split_friends')
        .update({
          owed_amount: parseFloat(newOwed.toFixed(2)),
          status: isFullyPaid ? 'paid' : 'unpaid',
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedFriendToSettle.id);

      if (updateFriendErr) throw updateFriendErr;

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
      {/* HEADER WITH UNIFIED BUTTON COLOR */}
      <View style={[styles.modernHeader, { backgroundColor: '#FFFFFF', paddingBottom: 16 }]}>
        <View style={styles.headerLeft}>
          <Ionicons name="people-circle-outline" size={28} color="#1F4F59" />
          <Text style={[styles.modernHeaderTitle, { color: '#1F4F59', fontWeight: '800' }]}>Split Expenses</Text>
        </View>
        <TouchableOpacity
          style={[styles.quickFormTrigger, { backgroundColor: '#1F4F59', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }]}
          onPress={() => setFormVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={[styles.quickFormTriggerText, { color: '#FFFFFF', fontWeight: '600' }]}>New Split</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#1F4F59" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#1F4F59']}
              tintColor="#1F4F59"
            />
          }
        >
          {/* FRIENDS SECTION WITH MULTI-COLOR PALETTE AVATARS */}
          <View style={styles.friendsSection}>
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionTitle, { color: '#1F4F59', fontWeight: '700' }]}>Friends List</Text>
              <Text style={styles.sectionCount}>{friends?.length || 0} registered</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalFriendsScroll}>
              <TouchableOpacity style={styles.avatarContainer} onPress={() => setAddFriendModalVisible(true)} activeOpacity={0.7}>
                <View style={[styles.addCircle, { borderColor: '#1F4F59', backgroundColor: 'rgba(31, 79, 89, 0.05)' }]}>
                  <Ionicons name="add" size={24} color="#1F4F59" />
                </View>
                <Text style={[styles.avatarName, { color: '#1F4F59' }]}>Add Friend</Text>
              </TouchableOpacity>

              {(friends || []).map((f, index) => {
                const avatarBgColor = AVATAR_PALETTE[index % AVATAR_PALETTE.length];
                return (
                  <View key={f.id} style={styles.avatarContainer}>
                    <View style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: avatarBgColor,
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginBottom: 6
                    }}>
                      <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
                        {(f.full_name || 'F').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.avatarName, { color: '#1F4F59', fontWeight: '500' }]} numberOfLines={1}>
                      {f.full_name}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>

          {/* SUMMARY ROW (ORIGINAL STYLES PRESERVED) */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, styles.summaryCardRed]}>
              <Text style={styles.summaryLabel}>Your Share</Text>
              <Text style={styles.summaryAmount}>₱{balanceSummary.youOwe.toFixed(2)}</Text>
              <Text style={styles.summarySubtitle}>Across all splits</Text>
            </View>

            <View style={[styles.summaryCard, styles.summaryCardGreen]}>
              <Text style={styles.summaryLabel}>You are owed</Text>
              <Text style={styles.summaryAmount}>₱{balanceSummary.youAreOwed.toFixed(2)}</Text>
              <Text style={styles.summarySubtitle}>From friends</Text>
            </View>
          </View>

          {/* SEGMENTED CONTROLS */}
          <View style={styles.segmentedRow}>
            <TouchableOpacity
              style={[
                styles.segmentedButton, 
                activeView === 'history' && { backgroundColor: '#1F4F59', borderColor: '#1F4F59' }
              ]}
              onPress={() => setActiveView('history')}
            >
              <Text style={[
                styles.segmentedButtonText, 
                activeView === 'history' && { color: '#FFFFFF', fontWeight: '700' }
              ]}>
                Split Expenses
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segmentedButton, 
                activeView === 'owes' && { backgroundColor: '#1F4F59', borderColor: '#1F4F59' }
              ]}
              onPress={() => setActiveView('owes')}
            >
              <Text style={[
                styles.segmentedButtonText, 
                activeView === 'owes' && { color: '#FFFFFF', fontWeight: '700' }
              ]}>
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
                  <View key={item.id} style={[styles.historyCard, { borderColor: '#E2E8F0', borderRadius: 16 }]}>
                    <View style={styles.historyTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.historyDesc, { color: '#1F4F59', fontWeight: '700' }]}>{item.description}</Text>
                        <Text style={styles.historyMeta}>
                          Total: ₱{item.total_amount?.toFixed(2)} • Your Share: ₱{item.personal_share?.toFixed(2)}
                        </Text>
                      </View>
                      {allPaid ? (
                        <View style={styles.fullySettledBadge}>
                          <Ionicons name="checkmark-circle" size={16} color="#7EA00E" />
                          <Text style={[styles.fullySettledText, { color: '#7EA00E' }]}>Settled</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[styles.settleOpenBtn, { backgroundColor: '#1F4F59', borderRadius: 8 }]}
                          onPress={() => {
                            setSelectedSplitForSettle(item);
                            setSettleModalVisible(true);
                          }}
                        >
                          <Text style={[styles.settleOpenBtnText, { color: '#FFFFFF' }]}>Manage Shares</Text>
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
            whoOwesList.map((person, index) => {
              const avatarBgColor = AVATAR_PALETTE[index % AVATAR_PALETTE.length];
              return (
                <View key={person.friendId} style={[styles.historyCard, { borderColor: '#E2E8F0', borderRadius: 16 }]}>
                  <View style={styles.historyTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <View
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 19,
                          marginRight: 12,
                          backgroundColor: avatarBgColor,
                          justifyContent: 'center',
                          alignItems: 'center'
                        }}
                      >
                        <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
                          {(person.name || 'F').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.historyDesc, { color: '#1F4F59', fontWeight: '600' }]}>{person.name}</Text>
                    </View>
                    <Text style={[styles.settleMemberAmount, { color: '#7EA00E', fontWeight: '800' }]}>₱{person.total.toFixed(2)}</Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* SETTLE MANAGEMENT MODAL */}
      <Modal visible={settleModalVisible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={() => setSettleModalVisible(false)}>
        <View style={styles.modalBackground}>
          <View style={styles.modalContainer}>
            <Text style={[styles.modalTitle, { color: '#1F4F59' }]}>Manage Split Shares</Text>
            {selectedSplitForSettle ? (
              <>
                <View style={styles.settleSummaryRow}>
                  <Text style={styles.settleSummaryLabel}>Description:</Text>
                  <Text style={styles.settleSummaryValue}>{selectedSplitForSettle.description}</Text>
                </View>
                <View style={styles.settleSummaryRow}>
                  <Text style={styles.settleSummaryLabel}>Total Amount:</Text>
                  <Text style={styles.settleSummaryValue}>₱{selectedSplitForSettle.total_amount?.toFixed(2)}</Text>
                </View>
                <View style={styles.settleSummaryRow}>
                  <Text style={styles.settleSummaryLabel}>Your Share:</Text>
                  <Text style={styles.settleSummaryValue}>₱{selectedSplitForSettle.personal_share?.toFixed(2)}</Text>
                </View>
                <View style={styles.divider} />
                <Text style={[styles.settleMembersTitle, { color: '#1F4F59' }]}>Split Members</Text>
                {(selectedSplitForSettle.split_friends || []).map((friendShare, index) => {
                  const avatarBgColor = AVATAR_PALETTE[index % AVATAR_PALETTE.length];
                  return (
                    <View key={friendShare.id} style={styles.settleMemberRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: avatarBgColor, justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                            {(friendShare.friends?.full_name || 'F').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.settleMemberName}>{friendShare.friends?.full_name}</Text>
                      </View>
                      <View style={styles.settleMemberActions}>
                        {friendShare.status === 'paid' ? (
                          <Text style={[styles.settleMemberStatusPaid, { color: '#7EA00E' }]}>Settled</Text>
                        ) : (
                          <TouchableOpacity style={[styles.settleMemberButton, { backgroundColor: '#1F4F59' }]} onPress={() => handleInitiateSettleFriend(friendShare)}>
                            <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 12 }}>Mark as Paid</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </>
            ) : null}
            <TouchableOpacity style={styles.closeButton} onPress={() => setSettleModalVisible(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* CREATE SPLIT FORM MODAL */}
      <Modal visible={formVisible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={() => setFormVisible(false)}>
        <View style={styles.modalBackground}>
          <View style={styles.modalContainer}>
            <Text style={[styles.modalTitle, { color: '#1F4F59' }]}>Create New Split</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="e.g., Dinner at Luigi's" placeholderTextColor="#94A3B8" />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Total Amount</Text>
                <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="e.g., 1200" placeholderTextColor="#94A3B8" keyboardType="numeric" />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Split Type</Text>
                <View style={styles.splitTypeContainer}>
                  <TouchableOpacity style={[styles.splitTypeButton, splitType === 'EQUAL' && { backgroundColor: '#1F4F59' }]} onPress={() => setSplitType('EQUAL')}>
                    <Text style={[styles.splitTypeButtonText, splitType === 'EQUAL' && { color: '#FFFFFF' }]}>Equal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.splitTypeButton, splitType === 'CUSTOM' && { backgroundColor: '#1F4F59' }]} onPress={() => setSplitType('CUSTOM')}>
                    <Text style={[styles.splitTypeButtonText, splitType === 'CUSTOM' && { color: '#FFFFFF' }]}>Custom</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Select Friends</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {(friends || []).map((friend, index) => {
                    const avatarBgColor = AVATAR_PALETTE[index % AVATAR_PALETTE.length];
                    return (
                      <TouchableOpacity key={friend.id} style={[styles.friendSelectButton, selectedFriends.includes(friend.id) && { borderColor: '#1F4F59', backgroundColor: 'rgba(31, 79, 89, 0.1)' }]} onPress={() => toggleSelectFriend(friend.id)}>
                        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: avatarBgColor, justifyContent: 'center', alignItems: 'center', marginRight: 6 }}>
                          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>{friend.full_name.charAt(0).toUpperCase()}</Text>
                        </View>
                        <Text style={styles.friendName}>{friend.full_name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              {splitType === 'CUSTOM' && (
                <View style={styles.customSharesContainer}>
                  <Text style={styles.label}>Custom Shares</Text>
                  {selectedFriends.map((friendId) => (
                    <View key={friendId} style={styles.customShareRow}>
                      <Text style={styles.friendName}>{friends.find((f) => f.id === friendId)?.full_name}</Text>
                      <TextInput style={styles.customShareInput} value={customShares[friendId]} onChangeText={(val) => handleCustomShareChange(friendId, val)} placeholder="0.00" placeholderTextColor="#94A3B8" keyboardType="numeric" />
                    </View>
                  ))}
                </View>
              )}
              <TouchableOpacity style={[styles.createSplitButton, { backgroundColor: '#1F4F59' }]} onPress={handleInitiateCreateSplit}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700', textAlign: 'center' }}>Create Split</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeButton} onPress={() => setFormVisible(false)}>
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ADD FRIEND MODAL */}
      <Modal visible={addFriendModalVisible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={() => setAddFriendModalVisible(false)}>
        <View style={styles.modalBackground}>
          <View style={styles.modalContainer}>
            <Text style={[styles.modalTitle, { color: '#1F4F59' }]}>Add New Friend</Text>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Friend's Full Name</Text>
              <TextInput style={styles.input} value={newFriendName} onChangeText={setNewFriendName} placeholder="e.g., John Doe" placeholderTextColor="#94A3B8" />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput style={styles.input} value={newFriendEmail} onChangeText={setNewFriendEmail} placeholder="e.g., alex@gmail.com" placeholderTextColor="#94A3B8" keyboardType="email-address" autoCapitalize="none" />
            </View>
            <TouchableOpacity style={[styles.addFriendButton, { backgroundColor: '#1F4F59' }]} onPress={handleAddFriend}>
              <Text style={{ color: '#FFFFFF', fontWeight: '700', textAlign: 'center' }}>Add Friend</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeButton} onPress={() => setAddFriendModalVisible(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SETTLE PAYMENT INPUT MODAL */}
      <Modal visible={settleAmountModalVisible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={() => setSettleAmountModalVisible(false)}>
        <View style={styles.modalBackground}>
          <View style={styles.modalContainer}>
            <Text style={[styles.modalTitle, { color: '#1F4F59' }]}>Settle Payment</Text>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Amount Paid</Text>
              <TextInput style={styles.input} value={paymentInputAmount} onChangeText={setPaymentInputAmount} placeholder="e.g., 500" placeholderTextColor="#94A3B8" keyboardType="numeric" />
            </View>
            <TouchableOpacity style={[styles.settlePaymentButton, { backgroundColor: '#1F4F59' }]} onPress={handleConfirmSettlePayment}>
              <Text style={{ color: '#FFFFFF', fontWeight: '700', textAlign: 'center' }}>Confirm Payment</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeButton} onPress={() => setSettleAmountModalVisible(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ALERT MODAL */}
      <Modal visible={alertConfig.visible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={() => setAlertConfig({ ...alertConfig, visible: false })}>
        <View style={styles.modalBackground}>
          <View style={styles.alertContainer}>
            <Text style={[styles.alertTitle, { color: '#1F4F59' }]}>{alertConfig.title}</Text>
            <Text style={styles.alertMessage}>{alertConfig.message}</Text>
            <TouchableOpacity style={[styles.alertButton, { backgroundColor: '#1F4F59' }]} onPress={() => setAlertConfig({ ...alertConfig, visible: false })}>
              <Text style={{ color: '#FFFFFF', fontWeight: '700', textAlign: 'center' }}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}  