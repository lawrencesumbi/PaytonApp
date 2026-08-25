import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Friend = {
  id: string;
  full_name: string;
};

type ActiveSplitFriend = {
  id: string;
  split_expense_id: string;
  friend_id: string;
  owed_amount: number;
  status: string; // 'pending' or 'settled' / 'paid'
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
  remaining_amount: number;
  allowance_id: string;
  categories?: {
    name: string;
  };
  allowances?: {
    id: string;
    start_date: string;
    end_date: string;
  };
};

export default function SplitScreen() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Safe Default Array States
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

  // Settlement Modal State
  const [settleModalVisible, setSettleModalVisible] = useState<boolean>(false);
  const [selectedSplitForSettle, setSelectedSplitForSettle] = useState<ActiveSplit | null>(null);
  const [pendingSettlement, setPendingSettlement] = useState<{
    splitFriendId: string;
    owedAmount: number;
    friendName: string;
  } | null>(null);

  // Budget Selection Modal State
  const [budgetModalVisible, setBudgetModalVisible] = useState<boolean>(false);
  const [isCreatingSplit, setIsCreatingSplit] = useState<boolean>(false);
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
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser) {
      setUser(currentUser);
      await fetchData(currentUser.id);
    }
    setLoading(false);
  };

  // Safe Isolated Fetching Function aligned with ERD Schema
  const fetchData = async (userId: string) => {
    // 1. Fetch Friends List
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

    // 3. Fetch Budgets with Active Allowance check
    try {
      const { data: budgetData, error: budgetErr } = await supabase
        .from('budgets')
        .select(`
          id,
          user_id,
          category_id,
          allocated_amount,
          remaining_amount,
          allowance_id,
          categories (
            name
          ),
          allowances (
            id,
            start_date,
            end_date
          )
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

  // ADD FRIEND
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

  // FORM CONTROLS
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

  // PRE-PROCESS SPLIT CREATION
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
      const totalParticipants = (selectedFriends?.length || 0) + 1;
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

    setIsCreatingSplit(true);
    setFormVisible(false);
    setBudgetModalVisible(true);
  };

  // PROCESS TRANSACTION AFTER SELECTING BUDGET
  const handleSelectBudgetAndProcess = async (selectedBudgetId: string) => {
    if (!user) return;
    setBudgetModalVisible(false);
    setLoading(true);

    try {
      const { data: budgetData, error: budgetErr } = await supabase
        .from('budgets')
        .select(`
          id, 
          remaining_amount, 
          allowance_id,
          allowances (
            id, 
            start_date, 
            end_date
          )
        `)
        .eq('id', selectedBudgetId)
        .single();

      if (budgetErr || !budgetData) {
        showAlert('Error', 'Could not verify budget status.');
        setLoading(false);
        return;
      }

      // CREATING NEW SPLIT
      if (isCreatingSplit && pendingSplitPayload) {
        const splitAmount = pendingSplitPayload.total_amount;

        if (budgetData.remaining_amount < splitAmount) {
          showAlert('Insufficient Budget', 'The selected budget category does not have enough balance.');
          setLoading(false);
          return;
        }

        // 1. Insert into 'expenses'
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

        // 2. Update 'budgets' remaining amount
        const newBalance = budgetData.remaining_amount - splitAmount;
        const { error: updateBudgetErr } = await supabase
          .from('budgets')
          .update({ remaining_amount: newBalance })
          .eq('id', selectedBudgetId);

        if (updateBudgetErr) throw updateBudgetErr;

        // 3. Insert into 'split_expenses'
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

        // 4. Insert into 'split_friends'
        const friendInserts = (pendingSplitPayload.friends || []).map((f: any) => ({
          split_expense_id: splitExp.id,
          friend_id: f.friend_id,
          owed_amount: f.owed_amount,
          status: 'pending',
          updated_at: new Date().toISOString(),
        }));

        const { error: friendsErr } = await supabase.from('split_friends').insert(friendInserts);

        if (friendsErr) throw friendsErr;

        showAlert('Success', 'Split expense saved and deducted from budget!');
        setIsCreatingSplit(false);
        setPendingSplitPayload(null);
        resetForm();
        fetchData(user.id);
      }

      // SETTLING A SHARE
      else if (pendingSettlement) {
        const { error: settleErr } = await supabase
          .from('split_friends')
          .update({ status: 'settled', updated_at: new Date().toISOString() })
          .eq('id', pendingSettlement.splitFriendId);

        if (settleErr) throw settleErr;

        showAlert('Success', `Settled ${pendingSettlement.friendName}'s share!`);
        setPendingSettlement(null);
        setSettleModalVisible(false);
        fetchData(user.id);
      }
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to process transaction.');
    } finally {
      setLoading(false);
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

  const getAvatarColor = (name: string) => {
    const colors = ['#E0F2FE', '#DCFCE7', '#FEF3C7', '#F3E8FF', '#FFE4E6'];
    let hash = 0;
    for (let i = 0; i < (name?.length || 0); i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

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
          onPress={() => {
            setIsCreatingSplit(true);
            setFormVisible(true);
          }}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.quickFormTriggerText}>New Split</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#108d87" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
              const allPaid = sfList.length > 0 && sfList.every((sf) => sf.status === 'settled' || sf.status === 'paid');

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
          )}
        </ScrollView>
      )}

      {/* CREATE SPLIT DRAWER */}
      <Modal visible={formVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.formDrawerContainer}>
            <View style={styles.pullBar} />
            <View style={styles.modalHeader}>
              <Text style={styles.drawerTitle}>Create Split Expense</Text>
              <TouchableOpacity style={styles.closeCircle} onPress={() => setFormVisible(false)}>
                <Ionicons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Dinner with Friends"
                value={description}
                onChangeText={setDescription}
              />

              <Text style={styles.label}>Total Amount (₱)</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
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
                          name={isSelected ? 'checkbox' : 'square-outline'}
                          size={16}
                          color={isSelected ? '#108d87' : '#64748B'}
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
                  <Ionicons name="information-circle-outline" size={20} color="#004D40" />
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

      {/* SELECT BUDGET MODAL */}
      <Modal visible={budgetModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.alertModalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Budget Category</Text>
              <TouchableOpacity style={styles.closeCircle} onPress={() => setBudgetModalVisible(false)}>
                <Ionicons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              {isCreatingSplit
                ? 'Select category to deduct the total expense:'
                : 'Select category for settlement:'}
            </Text>

            {(availableBudgets?.length || 0) === 0 ? (
              <Text style={styles.emptyText}>No active budget categories available.</Text>
            ) : (
              (availableBudgets || []).map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={styles.budgetChipOption}
                  onPress={() => handleSelectBudgetAndProcess(b.id)}
                >
                  <View>
                    <Text style={styles.budgetName}>{b.categories?.name || b.name || 'Budget Category'}</Text>
                    <Text style={styles.budgetBalance}>Remaining: ₱{b.remaining_amount?.toFixed(2)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#108d87" />
                </TouchableOpacity>
              ))
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
                <Ionicons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.input, { marginTop: 12 }]}
              placeholder="Friend's Full Name"
              value={newFriendName}
              onChangeText={setNewFriendName}
            />

            <TouchableOpacity style={styles.submitBtn} onPress={handleAddFriend}>
              <Text style={styles.submitBtnText}>Save Friend</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MANAGE SHARES & SETTLEMENT MODAL */}
      <Modal visible={settleModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedSplitForSettle?.description}</Text>
              <TouchableOpacity style={styles.closeCircle} onPress={() => setSettleModalVisible(false)}>
                <Ionicons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>Track paid shares or mark friend as settled:</Text>

            <FlatList
              data={selectedSplitForSettle?.split_friends || []}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isPaid = item.status === 'settled' || item.status === 'paid';
                return (
                  <View style={styles.settleMemberRow}>
                    <View>
                      <Text style={styles.settleMemberName}>{item.friends?.full_name || 'Friend'}</Text>
                      <Text style={styles.settleMemberAmount}>Owes: ₱{item.owed_amount?.toFixed(2)}</Text>
                    </View>

                    {isPaid ? (
                      <View style={styles.memberPaidBadge}>
                        <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                        <Text style={styles.memberPaidText}>Paid</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.settleActionBtn}
                        onPress={() => {
                          setIsCreatingSplit(false);
                          setPendingSettlement({
                            splitFriendId: item.id,
                            owedAmount: item.owed_amount,
                            friendName: item.friends?.full_name || 'Friend',
                          });
                          setBudgetModalVisible(true);
                        }}
                      >
                        <Text style={styles.settleActionBtnText}>Mark Paid</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }}
            />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
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
    paddingTop: 16,
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
    letterSpacing: -0.2,
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
    color: '#334155',
  },
  avatarName: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    textAlign: 'center',
  },
  formDrawerContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    maxHeight: '85%',
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
    marginBottom: 6,
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
    borderColor: '#E2E8F0',
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
    borderColor: '#CBD5E1',
  },
  checkChipSelected: {
    borderColor: '#108d87',
    backgroundColor: '#E6F4F3',
  },
  checkChipText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  checkChipTextSelected: {
    color: '#108d87',
    fontWeight: '600',
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
    paddingVertical: 8,
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
    borderColor: '#B2DFDB',
  },
  previewText: {
    fontSize: 13,
    color: '#004D40',
    flex: 1,
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
    fontWeight: '600',
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  historyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyDesc: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.1,
  },
  historyMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  settleOpenBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  settleOpenBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  fullySettledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fullySettledText: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '600',
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
    justifyContent: 'flex-end',
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    padding: 24,
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
    maxHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
    borderBottomColor: '#F1F5F9',
  },
  settleMemberName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  settleMemberAmount: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  settleActionBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  settleActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  memberPaidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  memberPaidText: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '600',
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