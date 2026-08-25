// app/(spenderTabs)/split.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
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
  split_friends: SplitMember[];
}

interface BudgetOption {
  id: string;
  remaining_amount: number;
  allowance_id: string;
  categories: {
    name: string;
  };
}

interface CustomShareMap {
  [friendId: string]: string;
}

export default function SplitExpenseScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [activeSplits, setActiveSplits] = useState<ActiveSplit[]>([]);

  // Form Bottom Sheet Toggle
  const [formModalVisible, setFormModalVisible] = useState(false);

  // Transaction States
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);

  // Split Calculation Mode States
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal');
  const [customSelfShare, setCustomSelfShare] = useState('');
  const [customFriendShares, setCustomFriendShares] = useState<CustomShareMap>({});

  // Settlement Modal States
  const [settleModalVisible, setSettleModalVisible] = useState(false);
  const [currentSplitToSettle, setCurrentSplitToSettle] = useState<ActiveSplit | null>(null);

  // Add Friend Modal States
  const [addFriendModalVisible, setAddFriendModalVisible] = useState(false);
  const [newFriendName, setNewFriendName] = useState('');
  const [newFriendEmail, setNewFriendEmail] = useState('');
  const [addingFriend, setAddingFriend] = useState(false);

  // Budget Category Selection States
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [budgets, setBudgets] = useState<BudgetOption[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>('');
  const [pendingSettleData, setPendingSettleData] = useState<{
    memberId: string;
    friendName: string;
    amount: number;
    description: string;
  } | null>(null);

  // DATASET SYNCHRONIZATION
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

      // 2. Fetch Active Splits
      const { data: splitsData } = await supabase
        .from('split_expenses')
        .select(`
          id, description, total_amount, personal_share, created_at,
          split_friends ( id, friend_id, owed_amount, status, friends ( full_name ) )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (splitsData) setActiveSplits(splitsData as unknown as ActiveSplit[]);

    } catch (error: any) {
      console.error('Error compiling metrics:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch budgets belonging strictly to ACTIVE allowances (current date between start_date and end_date)
  const fetchAvailableBudgets = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('budgets')
        .select(`
          id,
          remaining_amount,
          allowance_id,
          categories ( name ),
          allowances!inner (
            start_date,
            end_date
          )
        `)
        .eq('user_id', user.id)
        .gt('remaining_amount', 0)
        .lte('allowances.start_date', today)
        .gte('allowances.end_date', today);

      if (error) throw error;
      if (data) setBudgets(data as unknown as BudgetOption[]);
    } catch (error: any) {
      console.error('Error fetching active allowance budgets:', error.message);
    }
  };

  const onRefresh = useCallback(() => {
    fetchData(true);
  }, []);

  const handleAddFriend = async () => {
    if (!newFriendName.trim() || !newFriendEmail.trim()) {
      Alert.alert('Validation Error', 'Palihug og fill-up sa ngalan ug email sa imong amigo dae.');
      return;
    }

    try {
      setAddingFriend(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('friends')
        .insert({
          user_id: user.id,
          full_name: newFriendName.trim(),
          email: newFriendEmail.trim()
        });

      if (error) throw error;

      Alert.alert('Success 🎉', 'Nadugang na imong amigo!');
      setNewFriendName('');
      setNewFriendEmail('');
      setAddFriendModalVisible(false);
      fetchData();
    } catch (error: any) {
      Alert.alert('Error adding friend', error.message);
    } finally {
      setAddingFriend(false);
    }
  };

  const calculateCustomTotals = () => {
    const selfAmount = parseFloat(customSelfShare) || 0;
    const friendsTotal = selectedFriendIds.reduce((sum, id) => {
      return sum + (parseFloat(customFriendShares[id]) || 0);
    }, 0);
    return selfAmount + friendsTotal;
  };

  const handleProcessSplit = async () => {
    const parsedTotal = parseFloat(totalAmount);
    if (!description.trim() || isNaN(parsedTotal) || parsedTotal <= 0) {
      Alert.alert('Validation Error', 'Palihug og butang sa description ug saktong total amount.');
      return;
    }

    if (selectedFriendIds.length === 0) {
      Alert.alert('Missing Friends', 'Palihug og pili og bisan usa ka amigo nga ka-split.');
      return;
    }

    let selfShareAmount = 0;
    const memberInserts: { friend_id: string; owed_amount: number; status: 'unpaid' }[] = [];

    if (splitType === 'equal') {
      const totalPeople = selectedFriendIds.length + 1;
      const shareAmount = parsedTotal / totalPeople;
      selfShareAmount = shareAmount;

      selectedFriendIds.forEach(fId => {
        memberInserts.push({
          friend_id: fId,
          owed_amount: shareAmount,
          status: 'unpaid'
        });
      });
    } else {
      const computedTotal = calculateCustomTotals();

      if (Math.abs(computedTotal - parsedTotal) > 0.01) {
        Alert.alert(
          'Math Mismatch ⚠️',
          `Ang sum sa custom shares (₱${computedTotal.toFixed(2)}) dili katugma sa Total Gross Amount (₱${parsedTotal.toFixed(2)}). Palihug og tan-aw sa mga kwarta.`
        );
        return;
      }

      selfShareAmount = parseFloat(customSelfShare) || 0;

      for (const fId of selectedFriendIds) {
        const friendAmount = parseFloat(customFriendShares[fId]) || 0;
        if (friendAmount <= 0) {
          const friendObj = friends.find(f => f.id === fId);
          Alert.alert('Invalid Amount', `Palihug og butang sa saktong share ni ${friendObj?.full_name || 'imong amigo'}.`);
          return;
        }

        memberInserts.push({
          friend_id: fId,
          owed_amount: friendAmount,
          status: 'unpaid'
        });
      }
    }

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: splitExpense, error: splitError } = await supabase
        .from('split_expenses')
        .insert({
          user_id: user.id,
          description: description.trim(),
          total_amount: parsedTotal,
          personal_share: selfShareAmount
        })
        .select()
        .single();

      if (splitError) throw splitError;

      const formattedMembers = memberInserts.map(m => ({
        ...m,
        split_expense_id: splitExpense.id
      }));

      const { error: membersError } = await supabase
        .from('split_friends')
        .insert(formattedMembers);

      if (membersError) throw membersError;

      Alert.alert('Success 🎉', 'Naseave na ang split calculation!');

      setDescription('');
      setTotalAmount('');
      setSelectedFriendIds([]);
      setCustomSelfShare('');
      setCustomFriendShares({});
      setSplitType('equal');
      setFormModalVisible(false);
      fetchData();

    } catch (error: any) {
      Alert.alert('Error processing split', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const initiateSettlement = (memberId: string, friendName: string, amount: number) => {
    setPendingSettleData({
      memberId,
      friendName,
      amount,
      description: currentSplitToSettle?.description || 'Split Expense'
    });
    fetchAvailableBudgets();
    setBudgetModalVisible(true);
  };

  const processSettlementWithBudget = async () => {
    if (!selectedBudgetId || !pendingSettleData) {
      Alert.alert('Validation Error', 'Palihug og pili og budget category nga kuhaan.');
      return;
    }

    const chosenBudget = budgets.find(b => b.id === selectedBudgetId);
    if (!chosenBudget) return;

    if (pendingSettleData.amount > chosenBudget.remaining_amount) {
      Alert.alert(
        'Insufficient Budget Balance',
        `Dili madawat! Ang nahabilin sa kini nga category kay ₱${chosenBudget.remaining_amount.toFixed(2)} ra, apan ang bayranan kay ₱${pendingSettleData.amount.toFixed(2)}.`
      );
      return;
    }

    try {
      setSubmitting(true);

      const { error: expenseError } = await supabase
        .from('expenses')
        .insert({
          budget_id: chosenBudget.id,
          allowance_id: chosenBudget.allowance_id,
          amount: pendingSettleData.amount,
          description: `Split share: ${pendingSettleData.description}`,
          spent_at: new Date().toISOString()
        });

      if (expenseError) throw expenseError;

      const newRemaining = chosenBudget.remaining_amount - pendingSettleData.amount;
      const { error: budgetUpdateError } = await supabase
        .from('budgets')
        .update({ remaining_amount: newRemaining })
        .eq('id', chosenBudget.id);

      if (budgetUpdateError) throw budgetUpdateError;

      const { error: splitError } = await supabase
        .from('split_friends')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', pendingSettleData.memberId);

      if (splitError) throw splitError;

      Alert.alert('Settled 🎉', `Nabayran na ang share ni ${pendingSettleData.friendName} ug na-deduct na sa imong budget & expense records!`);

      setBudgetModalVisible(false);
      setSettleModalVisible(false);
      setSelectedBudgetId('');
      setPendingSettleData(null);
      fetchData();

    } catch (error: any) {
      Alert.alert('Processing Error', error.message);
    } finally {
      setSubmitting(false);
    }
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

  const getAvatarBg = (name: string) => {
    const colors = ['#E2F1E7', '#FFF9E6', '#FFEBEB', '#EBF3FF', '#ECEBFF', '#FFF0FA'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.modernHeader}>
        <View style={styles.headerLeft}>
          <Text style={styles.modernHeaderTitle}>Split the Bill</Text>
        </View>

        <TouchableOpacity 
          style={styles.quickFormTrigger} 
          onPress={() => setFormModalVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.quickFormTriggerText}>Setup Split</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        keyboardShouldPersistTaps="handled" 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#10B981']} tintColor="#10B981" />
        }
      >
        {/* Friends Directory */}
        <View style={styles.friendsSection}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Friends Directory</Text>
            <Text style={styles.sectionCount}>{friends.length} active</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalFriendsScroll}>
            <TouchableOpacity style={styles.avatarContainer} onPress={() => setAddFriendModalVisible(true)} activeOpacity={0.7}>
              <View style={styles.addCircle}>
                <Ionicons name="add" size={22} color="#64748B" />
              </View>
              <Text style={styles.avatarName} numberOfLines={1}>Add New</Text>
            </TouchableOpacity>

            {friends.map((friend) => {
              const firstLetter = friend.full_name.charAt(0).toUpperCase();
              return (
                <View key={friend.id} style={styles.avatarContainer}>
                  <View style={[styles.friendAvatar, { backgroundColor: getAvatarBg(friend.full_name) }]}>
                    <Text style={styles.avatarLetter}>{firstLetter}</Text>
                  </View>
                  <Text style={styles.avatarName} numberOfLines={1}>
                    {friend.full_name.split(' ')[0]}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* Active Shared Streams */}
        <View style={{ marginTop: 12 }}>
          <Text style={styles.sectionTitle}>Active Shared Streams</Text>

          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#10B981" />
            </View>
          ) : activeSplits.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="file-tray-outline" size={40} color="#CBD5E1" />
              <Text style={styles.emptyText}>No active group bills logged yet.</Text>
            </View>
          ) : (
            activeSplits.map((split) => {
              const unpaidCount = split.split_friends.filter(m => m.status === 'unpaid').length;

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
                        <Ionicons name="checkmark-circle" size={16} color="#10B981" />
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

      {/* FORM MODAL (SETUP SPLIT WITH CUSTOM MATH) */}
      <Modal animationType="slide" transparent={true} visible={formModalVisible} onRequestClose={() => setFormModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.formDrawerContainer}>
            <View style={styles.pullBar} />

            <View style={styles.modalHeader}>
              <Text style={styles.drawerTitle}>Setup Split Calculation</Text>
              <TouchableOpacity style={styles.closeCircle} onPress={() => setFormModalVisible(false)}>
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>What is this bill for?</Text>
              <TextInput style={styles.input} placeholder="e.g., Coffee, Dinner checkout, Taxi fare" placeholderTextColor="#94A3B8" value={description} onChangeText={setDescription} />

              <Text style={styles.label}>Total Gross Amount (₱)</Text>
              <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#94A3B8" keyboardType="numeric" value={totalAmount} onChangeText={setTotalAmount} />

              <Text style={styles.label}>Split Type</Text>
              <View style={styles.tabContainer}>
                <TouchableOpacity 
                  style={[styles.tabBtn, splitType === 'equal' && styles.tabBtnActive]} 
                  onPress={() => setSplitType('equal')}
                >
                  <Text style={[styles.tabBtnText, splitType === 'equal' && styles.tabBtnTextActive]}>Equal Split</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.tabBtn, splitType === 'custom' && styles.tabBtnActive]} 
                  onPress={() => setSplitType('custom')}
                >
                  <Text style={[styles.tabBtnText, splitType === 'custom' && styles.tabBtnTextActive]}>Custom Amount</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Select Members to Split With</Text>
              <View style={styles.inlineChecklist}>
                {friends.map((friend) => {
                  const isSelected = selectedFriendIds.includes(friend.id);
                  return (
                    <TouchableOpacity
                      key={friend.id}
                      style={[styles.checkChip, isSelected && styles.checkChipSelected]}
                      onPress={() => {
                        if (isSelected) {
                          setSelectedFriendIds(selectedFriendIds.filter(id => id !== friend.id));
                          const updated = { ...customFriendShares };
                          delete updated[friend.id];
                          setCustomFriendShares(updated);
                        } else {
                          setSelectedFriendIds([...selectedFriendIds, friend.id]);
                        }
                      }}
                    >
                      <Ionicons name={isSelected ? "checkbox" : "square-outline"} size={16} color={isSelected ? "#108d87" : "#64748B"} />
                      <Text style={[styles.checkChipText, isSelected && styles.checkChipTextSelected]}>
                        {friend.full_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {friends.length === 0 && (
                  <Text style={styles.emptyInlineText}>No friends added yet in directory.</Text>
                )}
              </View>

              {/* CUSTOM SHARE INPUTS */}
              {splitType === 'custom' && selectedFriendIds.length > 0 && (
                <View style={styles.customSection}>
                  <Text style={styles.customSectionTitle}>Set Individual Shares (₱)</Text>

                  <View style={styles.customRow}>
                    <Text style={styles.customMemberName}>Your Share ( You )</Text>
                    <TextInput
                      style={styles.customInput}
                      placeholder="0.00"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numeric"
                      value={customSelfShare}
                      onChangeText={setCustomSelfShare}
                    />
                  </View>

                  {selectedFriendIds.map(fId => {
                    const friend = friends.find(f => f.id === fId);
                    return (
                      <View key={fId} style={styles.customRow}>
                        <Text style={styles.customMemberName} numberOfLines={1}>{friend?.full_name}</Text>
                        <TextInput
                          style={styles.customInput}
                          placeholder="0.00"
                          placeholderTextColor="#94A3B8"
                          keyboardType="numeric"
                          value={customFriendShares[fId] || ''}
                          onChangeText={(val) => setCustomFriendShares({ ...customFriendShares, [fId]: val })}
                        />
                      </View>
                    );
                  })}
                </View>
              )}

              {/* PREVIEW BANNERS */}
              {splitType === 'equal' && previewShare > 0 && (
                <View style={styles.previewBanner}>
                  <Ionicons name="calculator" size={18} color="#108d87" />
                  <Text style={styles.previewText}>
                    Split math: <Text style={{fontWeight: '700'}}>₱{previewShare.toFixed(2)}</Text> each split across {previewTotalPeople} people.
                  </Text>
                </View>
              )}

              {splitType === 'custom' && parseFloat(totalAmount) > 0 && (
                <View style={[
                  styles.previewBanner, 
                  Math.abs(calculateCustomTotals() - parseFloat(totalAmount)) > 0.01 && { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }
                ]}>
                  <Ionicons 
                    name="calculator" 
                    size={18} 
                    color={Math.abs(calculateCustomTotals() - parseFloat(totalAmount)) <= 0.01 ? "#108d87" : "#EF4444"} 
                  />
                  <Text style={[
                    styles.previewText,
                    Math.abs(calculateCustomTotals() - parseFloat(totalAmount)) > 0.01 && { color: '#991B1B' }
                  ]}>
                    Total Allocated: <Text style={{fontWeight: '700'}}>₱{calculateCustomTotals().toFixed(2)}</Text> / ₱{parseFloat(totalAmount || '0').toFixed(2)}
                  </Text>
                </View>
              )}

              <TouchableOpacity style={styles.submitBtn} onPress={handleProcessSplit} disabled={submitting} activeOpacity={0.8}>
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="pie-chart" size={16} color="#FFFFFF" />
                    <Text style={styles.submitBtnText}>Confirm & Process Split</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ADD FRIEND MODAL */}
      <Modal animationType="fade" transparent={true} visible={addFriendModalVisible} onRequestClose={() => setAddFriendModalVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.alertModalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ADD NEW FRIEND</Text>
              <TouchableOpacity onPress={() => setAddFriendModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Full Name</Text>
            <TextInput style={styles.input} placeholder="e.g., James Doe" placeholderTextColor="#94A3B8" value={newFriendName} onChangeText={setNewFriendName} />

            <Text style={styles.label}>Email Address</Text>
            <TextInput style={styles.input} placeholder="e.g., james@example.com" placeholderTextColor="#94A3B8" keyboardType="email-address" autoCapitalize="none" value={newFriendEmail} onChangeText={setNewFriendEmail} />

            <TouchableOpacity style={[styles.submitBtn, { marginTop: 20, backgroundColor: '#108d87' }]} onPress={handleAddFriend} disabled={addingFriend}>
              {addingFriend ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Add Friend</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SETTLE DRAWER MODAL */}
      <Modal animationType="slide" transparent={true} visible={settleModalVisible} onRequestClose={() => setSettleModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>Settle: {currentSplitToSettle?.description}</Text>
              <TouchableOpacity onPress={() => setSettleModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>Select a member who has completed their transfer to settle their balance:</Text>

            <FlatList
              data={currentSplitToSettle?.split_friends}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={styles.settleMemberRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.settleMemberName} numberOfLines={1}>{item.friends?.full_name}</Text>
                    <Text style={styles.settleMemberAmount}>Owes: ₱{item.owed_amount.toFixed(2)}</Text>
                  </View>

                  {item.status === 'unpaid' ? (
                    <TouchableOpacity 
                      style={styles.settleActionBtn} 
                      onPress={() => initiateSettlement(item.id, item.friends?.full_name, item.owed_amount)} 
                      activeOpacity={0.8}
                    >
                      <Text style={styles.settleActionBtnText}>Mark Paid</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.memberPaidBadge}>
                      <Ionicons name="checkmark" size={14} color="#10B981" />
                      <Text style={styles.memberPaidText}>Paid</Text>
                    </View>
                  )}
                </View>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ACTIVE ALLOWANCE BUDGET SELECTION MODAL */}
      <Modal animationType="slide" transparent={true} visible={budgetModalVisible} onRequestClose={() => setBudgetModalVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.alertModalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Active Budget</Text>
              <TouchableOpacity onPress={() => setBudgetModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              Pilia asa nga budget category i-deduct ang share nga ₱{pendingSettleData?.amount.toFixed(2)}:
            </Text>

            <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
              {budgets.length === 0 ? (
                <Text style={styles.emptyInlineText}>Walay active allowance budget nga may natabilin nga balance.</Text>
              ) : (
                budgets.map((b) => {
                  const isSelected = selectedBudgetId === b.id;
                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={[styles.budgetChipOption, isSelected && styles.budgetChipSelected]}
                      onPress={() => setSelectedBudgetId(b.id)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.budgetName}>{b.categories?.name}</Text>
                        <Text style={styles.budgetBalance}>Remaining: ₱{b.remaining_amount.toFixed(2)}</Text>
                      </View>
                      <Ionicons 
                        name={isSelected ? "radio-button-on" : "radio-button-off"} 
                        size={20} 
                        color={isSelected ? "#108d87" : "#64748B"} 
                      />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity 
              style={[styles.submitBtn, { marginTop: 16 }]} 
              onPress={processSettlementWithBudget}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Confirm Deduction & Settle</Text>
              )}
            </TouchableOpacity>
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
  modernHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 44 : 20,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modernHeaderTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  quickFormTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#108d87',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 4,
  },
  quickFormTriggerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  scrollContent: { 
    paddingBottom: 40, 
    paddingHorizontal: 24, 
    paddingTop: 16 
  },
  friendsSection: {
    marginBottom: 24,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionCount: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  sectionTitle: { 
    fontSize: 15, 
    fontWeight: '700', 
    color: '#0F172A', 
    letterSpacing: -0.2 
  },
  horizontalFriendsScroll: {
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    alignItems: 'center',
    marginRight: 20,
    width: 60,
  },
  addCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginBottom: 6,
  },
  friendAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  avatarLetter: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155'
  },
  avatarName: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    textAlign: 'center'
  },
  formDrawerContainer: {
    backgroundColor: '#FFFFFF', 
    borderTopLeftRadius: 28, 
    borderTopRightRadius: 28, 
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    maxHeight: '85%'
  },
  pullBar: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  closeCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: { 
    fontSize: 13, 
    fontWeight: '600', 
    color: '#64748B', 
    marginTop: 16, 
    marginBottom: 6 
  },
  input: { 
    borderWidth: 1, 
    borderColor: '#E2E8F0', 
    padding: 12, 
    borderRadius: 12, 
    backgroundColor: '#F8FAFC', 
    fontSize: 15, 
    color: '#0F172A',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginTop: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabBtnTextActive: {
    color: '#108d87',
  },
  inlineChecklist: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  checkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1'
  },
  checkChipSelected: {
    borderColor: '#108d87',
    backgroundColor: '#E6F4F3'
  },
  checkChipText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500'
  },
  checkChipTextSelected: {
    color: '#108d87',
    fontWeight: '600'
  },
  customSection: {
    marginTop: 16,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  customSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 12,
  },
  customMemberName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  customInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    width: 90,
    textAlign: 'right',
    fontSize: 14,
    color: '#0F172A',
  },
  emptyInlineText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
    paddingVertical: 8
  },
  previewBanner: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#E6F4F3', 
    padding: 14, 
    borderRadius: 12, 
    gap: 10, 
    marginTop: 18,
    marginBottom: 4, 
    borderWidth: 1, 
    borderColor: '#B2DFDB' 
  },
  previewText: { 
    fontSize: 13, 
    color: '#004D40', 
    flex: 1 
  },
  submitBtn: { 
    backgroundColor: '#108d87', 
    padding: 14, 
    borderRadius: 24, 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  submitBtnText: { 
    color: '#FFFFFF', 
    fontSize: 15, 
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
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyText: { 
    color: '#94A3B8', 
    fontSize: 14, 
    textAlign: 'center', 
  },
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(15, 23, 42, 0.4)', 
    justifyContent: 'flex-end' 
  },
  modalOverlayCenter: { 
    flex: 1, 
    backgroundColor: 'rgba(15, 23, 42, 0.4)', 
    justifyContent: 'center',
    padding: 24
  },
  alertModalContainer: {
    backgroundColor: '#FFFFFF', 
    borderRadius: 24, 
    padding: 24, 
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
    marginBottom: 12 
  },
  modalTitle: { 
    fontSize: 16, 
    fontWeight: '800', 
    color: '#0F172A', 
    flex: 1, 
  },
  modalSub: { 
    fontSize: 14, 
    color: '#64748B', 
    marginBottom: 16, 
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
  },
  budgetChipOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    marginBottom: 8,
  },
  budgetChipSelected: {
    borderColor: '#108d87',
    backgroundColor: '#E6F4F3',
  },
  budgetName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  budgetBalance: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
});