import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

// ─── Reference uses one flat neutral tone for every avatar (no photo, no
// initials) rather than per-person colors — matching that exactly here ───
const AVATAR_FLAT_COLOR = '#D8C9A3';

// Reference's group cluster icon always uses the same blue / pink / purple
// trio, not a per-group random set — so this is fixed, not hash-based.
const CLUSTER_COLORS: [string, string, string] = ['#7FA8E8', '#F19BC4', '#B7A4E0'];

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

// A friend's aggregate unpaid balance across every active split — purely a
// frontend calculation over the `activeSplits` data you already fetch, not
// a new backend query.
function getFriendOwedTotal(splits: ActiveSplit[], friendId: string): number {
  let total = 0;
  splits.forEach((s) => {
    s.split_members.forEach((m) => {
      if (m.friend_id === friendId && m.status === 'unpaid') total += m.owed_amount;
    });
  });
  return total;
}

// ─── Avatar — flat, uniform-colored circle with a status dot sitting on
// the top-right edge, matching the reference exactly (no initials/photo) ───
function Avatar({ size = 40, selected = false, showDot = false }: { size?: number; selected?: boolean; showDot?: boolean }) {
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.avatarCircle,
          { width: size, height: size, borderRadius: size / 2 },
          selected && styles.avatarSelected,
        ]}
      />
      {showDot && (
        <View
          style={[
            styles.avatarDot,
            { backgroundColor: selected ? '#22C55E' : '#9CA3AF' },
          ]}
        />
      )}
    </View>
  );
}

// ─── Group-style cluster icon (3 overlapping colored circles: blue, pink,
// purple), matching the reference's "Your Groups" avatar exactly ───
function GroupClusterIcon() {
  return (
    <View style={styles.clusterBox}>
      <View style={[styles.clusterDot, { backgroundColor: CLUSTER_COLORS[0], left: 2, top: 2 }]} />
      <View style={[styles.clusterDot, { backgroundColor: CLUSTER_COLORS[1], left: 16, top: 2 }]} />
      <View style={[styles.clusterDot, { backgroundColor: CLUSTER_COLORS[2], left: 9, top: 14 }]} />
    </View>
  );
}

export default function SplitExpenseScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [budgets, setBudgets] = useState<UserBudget[]>([]);
  const [activeSplits, setActiveSplits] = useState<ActiveSplit[]>([]);

  // Transaction States
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [selectedBudgetId, setSelectedBudgetId] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);

  // Expand/Collapse for "New Split" form
  const [showForm, setShowForm] = useState(false);

  // Frontend-only search + "See all" expand toggles — filter/display logic
  // over data already fetched, no new Supabase calls.
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllSplits, setShowAllSplits] = useState(false);
  const [showAllFriends, setShowAllFriends] = useState(false);

  // Settlement Modal States
  const [settleModalVisible, setSettleModalVisible] = useState(false);
  const [currentSplitToSettle, setCurrentSplitToSettle] = useState<ActiveSplit | null>(null);

  const fetchData = async (isRefreshing = false) => {
    try {
      if (isRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: friendsData } = await supabase
        .from('friends')
        .select('id, full_name, email')
        .eq('user_id', user.id)
        .order('full_name', { ascending: true });
      if (friendsData) setFriends(friendsData);

      const { data: budgetsData } = await supabase
        .from('budgets')
        .select(`id, allocated_amount, remaining_amount, categories ( name )`)
        .eq('user_id', user.id);
      if (budgetsData) setBudgets(budgetsData as any);

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
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    fetchData(true);
  }, []);

  const toggleFriendSelection = (id: string) => {
    if (selectedFriendIds.includes(id)) {
      setSelectedFriendIds(selectedFriendIds.filter((fId) => fId !== id));
    } else {
      setSelectedFriendIds([...selectedFriendIds, id]);
      // Selecting a friend (from the avatar strip or the list below) opens
      // the split form if it isn't already open — mirrors the reference's
      // "tap to act" flow instead of requiring a separate button first.
      setShowForm(true);
    }
  };

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

    const selectedBudget = budgets.find((b) => b.id === selectedBudgetId);
    if (!selectedBudget || Number(selectedBudget.remaining_amount) < shareAmount) {
      Alert.alert(
        'Insufficient Balance',
        `Your personal share is ₱${shareAmount.toFixed(2)}, but this budget only has ₱${Number(selectedBudget?.remaining_amount || 0).toFixed(2)} remaining.`
      );
      return;
    }

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const newRemaining = Number(selectedBudget.remaining_amount) - shareAmount;
      const { error: budgetError } = await supabase
        .from('budgets')
        .update({ remaining_amount: newRemaining })
        .eq('id', selectedBudgetId);
      if (budgetError) throw budgetError;

      const { error: expenseError } = await supabase.from('expenses').insert({
        budget_id: selectedBudgetId,
        description: `Split: ${description.trim()} (Your Share)`,
        amount: shareAmount,
        spent_at: new Date().toISOString(),
      });
      if (expenseError) throw expenseError;

      const { data: splitExpense, error: splitError } = await supabase
        .from('split_expenses')
        .insert({
          user_id: user.id,
          budget_id: selectedBudgetId,
          description: description.trim(),
          total_amount: parsedTotal,
          personal_share: shareAmount,
        })
        .select()
        .single();
      if (splitError) throw splitError;

      const memberInserts = selectedFriendIds.map((fId) => ({
        split_expense_id: splitExpense.id,
        friend_id: fId,
        owed_amount: shareAmount,
        status: 'unpaid',
      }));

      const { error: membersError } = await supabase.from('split_members').insert(memberInserts);
      if (membersError) throw membersError;

      Alert.alert('Success', `Expense shared! Everyone owes ₱${shareAmount.toFixed(2)}.`);

      setDescription('');
      setTotalAmount('');
      setSelectedBudgetId('');
      setSelectedFriendIds([]);
      setShowForm(false);
      fetchData();
    } catch (error: any) {
      Alert.alert('Error processing split', error.message);
    } finally {
      setSubmitting(false);
    }
  };

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

              Alert.alert('Settled', `${friendName}'s share has been paid.`);
              setSettleModalVisible(false);
              fetchData();
            } catch (error: any) {
              Alert.alert('Processing Error', error.message);
            }
          },
        },
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

  // Frontend-only filtering/derivations over already-fetched data.
  const filteredSplits = useMemo(
    () => activeSplits.filter((s) => s.description.toLowerCase().includes(searchQuery.toLowerCase())),
    [activeSplits, searchQuery]
  );
  const visibleSplits = showAllSplits ? filteredSplits : filteredSplits.slice(0, 2);

  const filteredFriends = useMemo(
    () =>
      friends.filter(
        (f) =>
          f.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.email.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [friends, searchQuery]
  );
  const visibleFriends = showAllFriends ? filteredFriends : filteredFriends.slice(0, 4);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* ─── Header — back arrow + centered title, matching the reference ─── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={() => router.back()}
          activeOpacity={0.6}
        >
          <Ionicons name="arrow-back" size={22} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Split</Text>
      </View>

      {/* ─── Search bar + compose (new split) button ─── */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search friends or splits"
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <TouchableOpacity
          style={styles.composeBtn}
          onPress={() => setShowForm((v) => !v)}
          activeOpacity={0.7}
        >
          <Ionicons name={showForm ? 'close' : 'create-outline'} size={20} color="#1E293B" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#10B981']} tintColor="#94A3B8" />
        }
      >
        {/* ─── New Split form (expanded from the compose button) ─── */}
        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Split Details</Text>

            <Text style={styles.formLabel}>What is this for?</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g., Dinner, Grab ride, Groceries"
              placeholderTextColor="#B0BEC5"
              value={description}
              onChangeText={setDescription}
            />

            <Text style={styles.formLabel}>Total Amount</Text>
            <View style={styles.amountInputWrapper}>
              <Text style={styles.amountPrefix}>₱</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor="#B0BEC5"
                keyboardType="numeric"
                value={totalAmount}
                onChangeText={setTotalAmount}
              />
            </View>

            <Text style={styles.formLabel}>From Budget</Text>
            <View style={styles.budgetChipsRow}>
              {budgets.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.budgetChip, selectedBudgetId === b.id && styles.budgetChipActive]}
                  onPress={() => setSelectedBudgetId(b.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.budgetChipText, selectedBudgetId === b.id && styles.budgetChipTextActive]}>
                    {b.categories?.name}
                  </Text>
                  <Text style={[styles.budgetChipSub, selectedBudgetId === b.id && styles.budgetChipSubActive]}>
                    ₱{Number(b.remaining_amount).toFixed(0)} left
                  </Text>
                </TouchableOpacity>
              ))}
              {budgets.length === 0 && <Text style={styles.emptySmallText}>No budgets found</Text>}
            </View>

            {selectedFriendIds.length > 0 && (
              <Text style={styles.formSelectedHint}>
                Splitting with {selectedFriendIds.length} friend{selectedFriendIds.length > 1 ? 's' : ''} — pick more below
              </Text>
            )}

            {previewShare > 0 && (
              <View style={styles.previewBar}>
                <Ionicons name="calculator-outline" size={16} color="#10B981" />
                <Text style={styles.previewText}>
                  <Text style={{ fontWeight: '700' }}>₱{previewShare.toFixed(2)}</Text> each · {previewTotalPeople} people
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.formSubmitBtn, submitting && styles.formSubmitBtnDisabled]}
              onPress={handleProcessSplit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.formSubmitBtnText}>Split Now</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* ─── Active Splits (reference's "Your Groups") ─── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>Active Splits</Text>
          {filteredSplits.length > 2 && (
            <TouchableOpacity onPress={() => setShowAllSplits((v) => !v)}>
              <Text style={styles.seeAllText}>{showAllSplits ? 'Show less' : 'See all'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#10B981" />
          </View>
        ) : visibleSplits.length === 0 ? (
          <Text style={styles.emptyRowText}>
            {searchQuery ? 'No splits match your search.' : 'No active splits yet — create one above.'}
          </Text>
        ) : (
          visibleSplits.map((split) => {
            const unpaidCount = split.split_members.filter((m) => m.status === 'unpaid').length;
            const isFullySettled = unpaidCount === 0;

            return (
              <TouchableOpacity
                key={split.id}
                style={styles.listRow}
                onPress={() => openSettleModal(split)}
                activeOpacity={0.7}
                disabled={isFullySettled}
              >
                <GroupClusterIcon />
                <View style={styles.listRowInfo}>
                  <Text style={styles.listRowTitle} numberOfLines={1}>{split.description}</Text>
                  <Text style={styles.listRowSub} numberOfLines={1}>
                    {isFullySettled ? 'Fully settled' : `${unpaidCount} unpaid · ₱${split.personal_share.toFixed(0)} your share`}
                  </Text>
                </View>
                <Text style={styles.listRowTime}>{formatTime(split.created_at)}</Text>
              </TouchableOpacity>
            );
          })
        )}

        {/* ─── Split With (reference's "Your Friends" avatar strip) ─── */}
        <View style={[styles.sectionHeader, { marginTop: 28 }]}>
          <Text style={styles.sectionHeaderText}>Split With</Text>
          {filteredFriends.length > 4 && (
            <TouchableOpacity onPress={() => setShowAllFriends((v) => !v)}>
              <Text style={styles.seeAllText}>{showAllFriends ? 'Show less' : 'See all'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {friends.length === 0 ? (
          <View style={styles.emptyStateCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="people-outline" size={26} color="#CBD5E1" />
            </View>
            <Text style={styles.emptyTitle}>No friends yet</Text>
            <Text style={styles.emptySubtitle}>Add friends from the Friends tab to start splitting expenses.</Text>
            <TouchableOpacity style={styles.emptyActionBtn} onPress={() => router.push('/friends')} activeOpacity={0.7}>
              <Text style={styles.emptyActionBtnText}>Go to Friends</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.avatarStrip}>
              {friends.map((friend) => {
                const isSelected = selectedFriendIds.includes(friend.id);
                return (
                  <TouchableOpacity
                    key={friend.id}
                    style={styles.avatarStripItem}
                    onPress={() => toggleFriendSelection(friend.id)}
                    activeOpacity={0.7}
                  >
                    <Avatar size={64} selected={isSelected} showDot />
                    <Text style={styles.avatarStripName} numberOfLines={1}>
                      {friend.full_name.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Full friends list, per-friend owed balance shown as subtitle */}
            {visibleFriends.map((friend) => {
              const isSelected = selectedFriendIds.includes(friend.id);
              const owed = getFriendOwedTotal(activeSplits, friend.id);
              return (
                <TouchableOpacity
                  key={friend.id}
                  style={styles.listRow}
                  onPress={() => toggleFriendSelection(friend.id)}
                  activeOpacity={0.7}
                >
                  <Avatar size={48} selected={isSelected} showDot />
                  <View style={styles.listRowInfo}>
                    <Text style={styles.listRowTitle} numberOfLines={1}>{friend.full_name}</Text>
                    <Text style={styles.listRowSub} numberOfLines={1}>{friend.email}</Text>
                  </View>
                  <Text style={[styles.listRowOwed, owed === 0 && styles.listRowOwedZero]}>
                    {owed > 0 ? `Owes ₱${owed.toFixed(0)}` : 'Settled'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ─── Settlement Modal (unchanged) ─── */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={settleModalVisible}
        onRequestClose={() => setSettleModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setSettleModalVisible(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandleBar} />

            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle} numberOfLines={1}>{currentSplitToSettle?.description}</Text>
                <Text style={styles.modalSubtitle}>Tap "Mark Paid" when a friend sends their share</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSettleModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {currentSplitToSettle && (
              <View style={styles.modalSummary}>
                <View style={styles.modalSummaryItem}>
                  <Text style={styles.modalSummaryLabel}>Total</Text>
                  <Text style={styles.modalSummaryValue}>₱{currentSplitToSettle.total_amount.toFixed(2)}</Text>
                </View>
                <View style={styles.modalSummaryDivider} />
                <View style={styles.modalSummaryItem}>
                  <Text style={styles.modalSummaryLabel}>Each Share</Text>
                  <Text style={styles.modalSummaryValue}>₱{currentSplitToSettle.personal_share.toFixed(2)}</Text>
                </View>
                <View style={styles.modalSummaryDivider} />
                <View style={styles.modalSummaryItem}>
                  <Text style={styles.modalSummaryLabel}>Remaining</Text>
                  <Text style={[styles.modalSummaryValue, { color: '#EF4444' }]}>
                    ₱{(currentSplitToSettle.personal_share * currentSplitToSettle.split_members.filter((m) => m.status === 'unpaid').length).toFixed(2)}
                  </Text>
                </View>
              </View>
            )}

            <FlatList
              data={currentSplitToSettle?.split_members}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 8 }}
              renderItem={({ item }) => (
                <View style={styles.settleMemberRow}>
                  <Avatar size={40} />
                  <View style={styles.settleMemberInfo}>
                    <Text style={styles.settleMemberName} numberOfLines={1}>{item.friends?.full_name}</Text>
                    <Text style={styles.settleMemberAmount}>Owes ₱{item.owed_amount.toFixed(2)}</Text>
                  </View>
                  {item.status === 'unpaid' ? (
                    <TouchableOpacity
                      style={styles.markPaidBtn}
                      onPress={() => handleSettleFriend(item.id, item.friends?.full_name, item.owed_amount)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.markPaidBtnText}>Mark Paid</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.paidRowBadge}>
                      <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                      <Text style={styles.paidRowText}>Paid</Text>
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
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  // ─── Header — back arrow + centered title, matching the reference ───
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 36 : 12,
    paddingBottom: 16,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 30, fontWeight: '800', color: '#0F172A', letterSpacing: -0.6 },
  headerBackBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ─── Search + compose ───
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 52,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A' },
  composeBtn: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },

  scrollContent: { paddingBottom: 40 },

  // ─── Section Headers ───
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  sectionHeaderText: { fontSize: 26, fontWeight: '800', color: '#0F172A', letterSpacing: -0.4 },
  seeAllText: { fontSize: 14, color: '#8A9A6B', fontWeight: '600' },

  // ─── Plain list rows (splits + friends, matching reference's flat style) ───
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 14,
  },
  listRowInfo: { flex: 1 },
  listRowTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  listRowSub: { fontSize: 13, color: '#94A3B8', marginTop: 2 },
  listRowTime: { fontSize: 12, color: '#B0B8C1' },
  listRowOwed: { fontSize: 12, fontWeight: '700', color: '#EF4444' },
  listRowOwedZero: { color: '#10B981' },
  emptyRowText: { paddingHorizontal: 20, fontSize: 13, color: '#94A3B8', paddingVertical: 8 },

  // ─── Group cluster icon (fixed blue / pink / purple trio) ───
  clusterBox: { width: 44, height: 44 },
  clusterDot: { position: 'absolute', width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#FFFFFF' },

  // ─── Avatar — flat, uniform tone, dot on the top-right edge ───
  avatarCircle: { backgroundColor: AVATAR_FLAT_COLOR },
  avatarSelected: { borderWidth: 2, borderColor: '#22C55E' },
  avatarDot: {
    position: 'absolute',
    width: 15,
    height: 15,
    borderRadius: 8,
    top: -2,
    right: -2,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  // ─── Avatar strip ───
  avatarStrip: { paddingHorizontal: 20, gap: 20, paddingBottom: 16 },
  avatarStripItem: { alignItems: 'center', width: 68 },
  avatarStripName: { fontSize: 13, fontWeight: '600', color: '#334155', marginTop: 8 },

  // ─── Form Card ───
  formCard: {
    backgroundColor: '#F8FAFC',
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 18,
    marginBottom: 24,
  },
  formTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 4, letterSpacing: -0.2 },
  formLabel: { fontSize: 13, fontWeight: '600', color: '#64748B', marginTop: 14, marginBottom: 6 },
  formInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    fontSize: 15,
    color: '#0F172A',
  },
  amountInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  amountPrefix: { fontSize: 16, fontWeight: '700', color: '#64748B', paddingLeft: 14 },
  amountInput: { flex: 1, padding: 12, paddingStart: 6, fontSize: 15, color: '#0F172A' },
  budgetChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  budgetChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: 100,
  },
  budgetChipActive: { backgroundColor: '#ECFDF5', borderColor: '#10B981' },
  budgetChipText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  budgetChipTextActive: { color: '#059669' },
  budgetChipSub: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  budgetChipSubActive: { color: '#6EE7B7' },
  formSelectedHint: { fontSize: 12, color: '#8A9A6B', fontWeight: '600', marginTop: 12 },
  previewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 10,
    gap: 8,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  previewText: { fontSize: 13, color: '#166534', flex: 1 },
  formSubmitBtn: { backgroundColor: '#10B981', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 18 },
  formSubmitBtnDisabled: { opacity: 0.6 },
  formSubmitBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  emptySmallText: { fontSize: 13, color: '#94A3B8', paddingVertical: 8 },

  // ─── Empty states ───
  emptyStateCard: {
    backgroundColor: '#F8FAFC',
    marginHorizontal: 20,
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  emptyActionBtn: { backgroundColor: '#FFFFFF', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  emptyActionBtnText: { fontSize: 13, fontWeight: '600', color: '#475569' },

  // ─── Modal (Bottom Sheet) ───
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.25)' },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'android' ? 32 : 24,
    maxHeight: '75%',
  },
  modalHandleBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginBottom: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3, maxWidth: '85%' },
  modalSubtitle: { fontSize: 13, color: '#94A3B8', marginTop: 4, lineHeight: 18 },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  modalSummary: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  modalSummaryItem: { flex: 1, alignItems: 'center' },
  modalSummaryLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '500', marginBottom: 4 },
  modalSummaryValue: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  modalSummaryDivider: { width: 1, backgroundColor: '#E2E8F0', marginHorizontal: 8 },

  settleMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9'
  },
  settleMemberInfo: { flex: 1, marginLeft: 12, marginRight: 8 },
  settleMemberName: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  settleMemberAmount: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  markPaidBtn: { backgroundColor: '#10B981', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
  markPaidBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  paidRowBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#ECFDF5', borderRadius: 8 },
  paidRowText: { fontSize: 12, fontWeight: '600', color: '#059669' },
});