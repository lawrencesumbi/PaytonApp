import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    StatusBar as NativeStatusBar,
    Platform,
    Pressable,
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

interface BudgetOption {
  id: string;
  allocated_amount: number;
  remaining_amount: number;
  categories: {
    id: string;
    name: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    color: string;
  };
}

interface TransactionItem {
  id: string;
  amount: number;
  description: string;
  spent_at: string;
}

const CARD_HEIGHT = 196;
const EXPANDED_GAP = 16;
const EXPANDED_SPACING = CARD_HEIGHT + EXPANDED_GAP; 

const PEEK_STEP = 14;       
const MAX_PEEKS = 3;        

const REVEAL_STEP = 130;    
const COMPACT_SCALE = 0.9;  
const FORWARD_SCALE = 1;   

const STACK_PALETTE = [
  { bg: '#E0F8F2', text: '#0F172A' },
  { bg: '#7ECFC0', text: '#0F172A' },
  { bg: '#56C5B6', text: '#0F172A' },
  { bg: '#3AAFAF', text: '#FFFFFF' },
  { bg: '#2891C6', text: '#FFFFFF' },
  { bg: '#1B4F72', text: '#FFFFFF' },
];

export default function PersonalExpensesScreen() {
  const router = useRouter();
  const { scannedName, scannedAmount, openAddExpense } = useLocalSearchParams<{ scannedName?: string; scannedAmount?: string; openAddExpense?: string }>();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [budgets, setBudgets] = useState<BudgetOption[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<BudgetOption | null>(null);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Real scroll position of the stack's own isolated ScrollView. This is
  // the ONLY thing driving the destacking animation — there is no tap
  // toggle, no button, no separate "fan" state. Scrolling IS the trigger.
  const stackScrollY = useRef(new Animated.Value(0)).current;
  const stackScrollRef = useRef<ScrollView>(null);

  const fetchActiveBudgets = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('budgets')
        .select(`id, allocated_amount, remaining_amount, categories ( id, name, icon, color )`)
        .eq('user_id', user.id);

      if (error) throw error;

      const validBudgets = (data || []).filter((b: any) => b.categories) as unknown as BudgetOption[];
      setBudgets(validBudgets);

      if (validBudgets.length > 0) {
        setSelectedBudget((prev) => prev ?? validBudgets[0]);
      }
    } catch (error: any) {
      console.error("Fetch Budgets Error:", error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTransactions = useCallback(async (budgetId: string) => {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('id, amount, description, spent_at')
        .eq('budget_id', budgetId)
        .order('spent_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setTransactions(data || []);
    } catch (error: any) {
      console.error("Fetch Transactions Error:", error.message);
      setTransactions([]);
    }
  }, []);

  useEffect(() => {
    if (selectedBudget?.id) fetchTransactions(selectedBudget.id);
    else setTransactions([]);
  }, [selectedBudget?.id, fetchTransactions]);

  useEffect(() => {
    const handleInitialSync = async () => {
      const hasScanData = !!(scannedAmount || scannedName);
      const hasAddExpenseIntent = openAddExpense === '1';
      if (scannedAmount) setAmount(scannedAmount);
      if (scannedName) setDescription(`Scanned: ${scannedName}`);
      await fetchActiveBudgets();
      if (hasScanData || hasAddExpenseIntent) setIsModalOpen(true);
      // Clear the trigger param once handled so navigating back to this
      // screen later (without the param) doesn't re-open the modal from
      // stale route state.
      if (hasAddExpenseIntent) router.setParams({ openAddExpense: undefined });
    };
    handleInitialSync();
  }, [scannedAmount, scannedName, openAddExpense, fetchActiveBudgets]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedBudget(null);
    router.setParams({ scannedName: undefined, scannedAmount: undefined });
  };

  const handleLogExpense = async () => {
    if (!selectedBudget) return Alert.alert("Missing Category", "Please select an active budget.");
    const expenseAmount = parseFloat(amount);
    if (isNaN(expenseAmount) || expenseAmount <= 0) return Alert.alert("Invalid Amount", "Please input a positive value.");
    if (expenseAmount > selectedBudget.remaining_amount) return Alert.alert("Insufficient Budget ❌", `Only ₱${selectedBudget.remaining_amount.toFixed(2)} remaining.`);

    try {
      setSubmitting(true);
      const { error: insertError } = await supabase.from('expenses').insert({
        budget_id: selectedBudget.id, amount: expenseAmount,
        description: description.trim() || 'Uncategorized Expense', spent_at: new Date().toISOString()
      });
      if (insertError) throw insertError;

      const newRemaining = selectedBudget.remaining_amount - expenseAmount;
      const { error: updateError } = await supabase.from('budgets').update({ remaining_amount: newRemaining }).eq('id', selectedBudget.id);
      if (updateError) throw updateError;

      Alert.alert("Success 🎉", `₱${expenseAmount.toFixed(2)} captured.`);
      setAmount(''); setDescription(''); setIsModalOpen(false);
      await fetchActiveBudgets();
      const updatedBudget = budgets.find(b => b.id === selectedBudget.id);
      if (updatedBudget) setSelectedBudget({ ...updatedBudget, remaining_amount: newRemaining });
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectBudget = (item: BudgetOption) => {
    setSelectedBudget(item);
    stackScrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getDayOfWeek = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { weekday: 'long' });
  };

  if (loading && budgets.length === 0) {
    return (
      <SafeAreaView style={[styles.container, styles.centeredContent]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="small" color="#10B981" />
      </SafeAreaView>
    );
  }

  const otherBudgets = budgets.filter(b => b.id !== selectedBudget?.id);
  const visualItems = selectedBudget ? [selectedBudget, ...otherBudgets] : [];
  const numCards = visualItems.length;
  const maxPeekIndex = Math.min(numCards - 1, MAX_PEEKS);

  const stackViewportHeight = maxPeekIndex * PEEK_STEP + CARD_HEIGHT;

  const stackContentHeight = Math.max(1, numCards - 1) * REVEAL_STEP + numCards * EXPANDED_SPACING + 40;

  const analyticsData = budgets
    .map(b => {
      const spent = b.allocated_amount - b.remaining_amount;
      const pct = b.allocated_amount > 0 ? Math.max(0, Math.min(100, (spent / b.allocated_amount) * 100)) : 0;
      return {
        id: b.id,
        name: b.categories?.name ?? 'Uncategorized',
        color: b.categories?.color ?? '#10B981',
        spent,
        pct
      };
    })
    .sort((a, b) => b.spent - a.spent);

  const allTimeTotal = transactions.reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Budget</Text>
      </View>

      {selectedBudget ? (

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

          {/* ========== SCROLL-DRIVEN DESTACKING STACK ==========
              A real, isolated nested ScrollView. At rest it shows the
              compact peeked deck. Physically scrolling INSIDE this box
              (not the page) is what reveals folders one at a time,
              animating each one forward into a full-size list slot — and
              once revealed, a folder never shrinks back, however far you
              keep scrolling. */}
          <View style={[styles.stackViewport, { height: stackViewportHeight }]}>
            <Animated.ScrollView
              ref={stackScrollRef}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              scrollEventThrottle={16}
              contentContainerStyle={{ height: stackContentHeight }}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: stackScrollY } } }],
                { useNativeDriver: true }
              )}
            >
              {visualItems.map((item, index) => {
                const palette = STACK_PALETTE[index % STACK_PALETTE.length];
                const itemRemainingPct = Math.max(0, Math.min(100, (item.remaining_amount / item.allocated_amount) * 100));

                const cappedIndex = Math.min(index, maxPeekIndex);
                const compactY = (maxPeekIndex - cappedIndex) * PEEK_STEP;

                const expandedY = index * EXPANDED_SPACING;

                if (index === 0) {

                  return (
                    <Animated.View
                      key={item.id}
                      style={[styles.absCard, { transform: [{ translateY: 0 }], zIndex: numCards }]}
                    >
                      <FolderCardBody
                        item={item}
                        palette={palette}
                        remainingPct={itemRemainingPct}
                        isActive={item.id === selectedBudget.id}
                        onPress={() => handleSelectBudget(item)}
                      />
                    </Animated.View>
                  );
                }

                const windowStart = (index - 1) * REVEAL_STEP;
                const windowEnd = index * REVEAL_STEP;

                const translateY = stackScrollY.interpolate({
                  inputRange: [windowStart, windowEnd],
                  outputRange: [compactY, expandedY],
                  extrapolate: 'clamp',
                });

                const scale = stackScrollY.interpolate({
                  inputRange: [windowStart, windowEnd],
                  outputRange: [COMPACT_SCALE, FORWARD_SCALE],
                  extrapolate: 'clamp',
                });

                const opacity = index <= maxPeekIndex
                  ? 1
                  : stackScrollY.interpolate({
                      inputRange: [windowStart, windowStart + REVEAL_STEP * 0.3],
                      outputRange: [0, 1],
                      extrapolate: 'clamp',
                    });

                const zIndex = numCards - index;

                return (
                  <Animated.View
                    key={item.id}
                    style={[
                      styles.absCard,
                      { transform: [{ translateY }, { scale }], opacity, zIndex },
                    ]}
                  >
                    <FolderCardBody
                      item={item}
                      palette={palette}
                      remainingPct={itemRemainingPct}
                      isActive={item.id === selectedBudget.id}
                      onPress={() => handleSelectBudget(item)}
                    />
                  </Animated.View>
                );
              })}
            </Animated.ScrollView>
          </View>

          

          {analyticsData.length > 0 && (
            <View style={styles.analyticsSection}>
              <Text style={styles.sectionTitle}>Spending Analytics</Text>
              <View style={styles.analyticsCard}>
                {analyticsData.map((a) => (
                  <View key={a.id} style={styles.analyticsRow}>
                    <View style={styles.analyticsRowHeader}>
                      <View style={[styles.analyticsDot, { backgroundColor: a.color }]} />
                      <Text style={styles.analyticsLabel} numberOfLines={1}>{a.name}</Text>
                      <Text style={styles.analyticsValue}>₱{a.spent.toLocaleString()}</Text>
                    </View>
                    <View style={styles.analyticsTrack}>
                      <View style={[styles.analyticsFill, { width: `${a.pct}%`, backgroundColor: a.color }]} />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.transactionSection}>
            <Text style={styles.sectionTitle}>Latest Transactions</Text>
            {transactions.length === 0 ? (
              <View style={styles.emptyTxState}>
                <Ionicons name="receipt-outline" size={40} color="#CBD5E1" />
                <Text style={styles.emptyTxText}>No transactions yet</Text>
              </View>
            ) : (
              <>
                {transactions.map((item) => (
                  <View key={item.id} style={styles.transactionItem}>
                    <View style={[styles.txIconWrap, { backgroundColor: `${selectedBudget.categories.color}15` }]}>
                      <Ionicons name={selectedBudget.categories.icon || 'wallet-outline'} size={22} color={selectedBudget.categories.color} />
                    </View>
                    <View style={styles.txInfo}>
                      <Text style={styles.txName} numberOfLines={1}>{item.description}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.txCategory}>{selectedBudget.categories.name}</Text>
                        <Text style={styles.txSeparator}> • </Text>
                        <Text style={styles.txDay}>{getDayOfWeek(item.spent_at)}</Text>
                      </View>
                    </View>
                    <Text style={styles.txAmount}>-₱{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                  </View>
                ))}

                <View style={styles.allTimeFooter}>
                  <Text style={styles.allTimeLabel}>All Time</Text>
                  <Text style={styles.allTimeValue}>₱{allTimeTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                </View>
              </>
            )}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="wallet-outline" size={32} color="#64748B" />
          </View>
          <Text style={styles.emptyText}>No Active Budgets Allocated</Text>
          <Text style={styles.emptySub}>To populate transactional items, configure and allocate capital tokens via your Home layout first.</Text>
        </View>
      )}

      {selectedBudget && (
        <TouchableOpacity activeOpacity={0.8} onPress={() => setIsModalOpen(true)} style={styles.fab}>
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      <Modal visible={isModalOpen} animationType="slide" transparent={true} statusBarTranslucent onRequestClose={() => setIsModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setIsModalOpen(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalContent}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.modalInner}>
                <View style={styles.modalDragHandle} />
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>Log New Expense</Text>
                    {selectedBudget && (
                      <View style={[styles.modernCategoryBadge, { backgroundColor: `${selectedBudget.categories.color}15` }]}>
                        <Ionicons name={selectedBudget.categories.icon || 'folder-outline'} size={14} color={selectedBudget.categories.color} />
                        <Text style={[styles.modernCategoryBadgeText, { color: selectedBudget.categories.color }]}>{selectedBudget.categories.name}</Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity style={styles.closeModalHeaderIcon} activeOpacity={0.7} onPress={() => setIsModalOpen(false)}>
                    <Ionicons name="close" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContainer} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <View style={styles.modernAmountContainer}>
                    <Text style={styles.modernAmountLabel}>AMOUNT SPENT</Text>
                    <View style={styles.amountInputRow}>
                      <Text style={styles.currencySymbol}>₱</Text>
                      <TextInput style={styles.amountInput} placeholder="0.00" placeholderTextColor="#CBD5E1" keyboardType="numeric" value={amount} onChangeText={setAmount} editable={!submitting} autoFocus />
                    </View>
                    {selectedBudget && (
                      <View style={styles.remainingBalanceRow}>
                        <Ionicons name="wallet-outline" size={13} color="#64748B" />
                        <Text style={styles.remainingBalanceText}>Folder Limit: ₱{selectedBudget.remaining_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Description / Remarks</Text>
                    <View style={styles.textInputWrapper}>
                      <Ionicons name="document-text-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                      <TextInput style={styles.textInput} placeholder="What did you purchase?" placeholderTextColor="#94A3B8" value={description} onChangeText={setDescription} editable={!submitting} />
                    </View>
                  </View>
                  <TouchableOpacity style={[styles.submitButton, submitting && styles.disabledButton]} onPress={handleLogExpense} disabled={submitting} activeOpacity={0.8}>
                    {submitting ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
                      <>
                        <Text style={styles.submitButtonText}>Save Transaction</Text>
                        <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
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

function FolderCardBody({
  item,
  palette,
  remainingPct,
  isActive,
  onPress,
}: {
  item: BudgetOption;
  palette: { bg: string; text: string };
  remainingPct: number;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }: any) => [
        styles.cardTouchable,
        (pressed || hovered) && styles.cardPressed,
      ]}
    >
      <View style={styles.folderCard}>
        <View style={styles.folderCardHeader}>
          <View style={styles.folderLeft}>
            <View style={[styles.folderIconWrap, { backgroundColor: `${palette.bg}55` }]}>
              <Ionicons name={item.categories.icon || 'wallet-outline'} size={22} color={palette.bg} />
            </View>
            <View>
              <Text style={styles.folderCategoryLabel}>{item.categories.name}</Text>
              <Text style={styles.folderSubLabel}>{isActive ? 'Active Folder' : 'Tap to select'}</Text>
            </View>
          </View>
          <Text style={styles.folderAmount}>₱{item.allocated_amount.toLocaleString()}</Text>
        </View>

        <View style={[styles.progressTrack, { backgroundColor: `${palette.bg}20` }]}>
          <View style={[styles.progressFill, { width: `${remainingPct}%`, backgroundColor: palette.bg }]} />
        </View>

        <View style={styles.folderFooter}>
          <View style={styles.footerStat}>
            <Text style={styles.footerStatLabel}>Spent</Text>
            <Text style={styles.footerStatValue}>₱{(item.allocated_amount - item.remaining_amount).toLocaleString()}</Text>
          </View>
          <View style={[styles.footerStat, { alignItems: 'center' }]}>
            <Text style={styles.footerStatLabel}>Remaining</Text>
            <Text style={[styles.footerStatValue, { color: palette.bg }]}>₱{item.remaining_amount.toLocaleString()}</Text>
          </View>
          <View style={[styles.footerStat, { alignItems: 'flex-end' }]}>
            <Text style={styles.footerStatLabel}>Total</Text>
            <Text style={styles.footerStatValue}>₱{item.allocated_amount.toLocaleString()}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centeredContent: { justifyContent: 'center', alignItems: 'center' },

  header: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? (NativeStatusBar.currentHeight ? NativeStatusBar.currentHeight + 16 : 34) : 20,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },

  stackViewport: {
    marginHorizontal: 24,
    marginTop: 24,
    overflow: 'hidden',
  },
  absCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: CARD_HEIGHT,
  },
  cardTouchable: { flex: 1, borderRadius: 24 },
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  folderCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  folderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  folderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  folderIconWrap: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  folderCategoryLabel: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  folderSubLabel: { fontSize: 12, color: '#94A3B8', fontWeight: '500', marginTop: 2 },
  folderAmount: { fontSize: 18, fontWeight: '800', color: '#0F172A' },

  progressTrack: { height: 8, borderRadius: 8, overflow: 'hidden', marginTop: 20 },
  progressFill: { height: '100%', borderRadius: 8 },

  folderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  footerStat: { flex: 1 },
  footerStatLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginBottom: 4, textTransform: 'uppercase' },
  footerStatValue: { fontSize: 15, fontWeight: '700', color: '#0F172A' },

  hiddenCountHint: {
    textAlign: 'center',
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 12,
  },

  analyticsSection: { marginTop: 28, paddingHorizontal: 24 },
  analyticsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 16,
  },
  analyticsRow: { gap: 8 },
  analyticsRowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  analyticsDot: { width: 8, height: 8, borderRadius: 4 },
  analyticsLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: '#334155' },
  analyticsValue: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  analyticsTrack: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 6, overflow: 'hidden' },
  analyticsFill: { height: '100%', borderRadius: 6 },

  transactionSection: { marginTop: 28, paddingHorizontal: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 16 },

  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 12,
  },
  txIconWrap: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  txInfo: { flex: 1, justifyContent: 'center' },
  txName: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  txCategory: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  txSeparator: { fontSize: 13, color: '#CBD5E1', marginHorizontal: 4 },
  txDay: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  txAmount: { fontSize: 16, fontWeight: '800', color: '#EF4444', letterSpacing: -0.5 },

  allTimeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  allTimeLabel: { fontSize: 15, fontWeight: '600', color: '#64748B' },
  allTimeValue: { fontSize: 18, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },

  emptyTxState: { alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyTxText: { marginTop: 12, fontSize: 15, color: '#94A3B8', fontWeight: '500' },

  fab: {
  position: 'absolute',
  top: 45,
  right: 24,
  width: 50,
  height: 50,
  borderRadius: 30,
  backgroundColor: '#0F172A',
  justifyContent: 'center',
  alignItems: 'center',
  shadowColor: '#0F172A',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.2,
  shadowRadius: 12,
  elevation: 8,
  zIndex: 50,
},

  emptyState: { flex: 0.7, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 36, gap: 14 },
  emptyIconContainer: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#1E293B', letterSpacing: -0.4 },
  emptySub: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 22, fontWeight: '400' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, height: '75%', paddingTop: 14, shadowColor: '#0F172A', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 24 },
  modalInner: { flex: 1 },
  modalDragHandle: { width: 36, height: 4, backgroundColor: '#E2E8F0', borderRadius: 10, alignSelf: 'center', marginBottom: 6 },
  closeModalHeaderIcon: { backgroundColor: '#F1F5F9', padding: 8, borderRadius: 50 },
  modernCategoryBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 6, gap: 5 },
  modernCategoryBadgeText: { fontSize: 12, fontWeight: '600' },
  modalHeader: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  modalTitle: { fontSize: 22, fontWeight: '700', color: '#0F172A', letterSpacing: -0.5 },
  formScroll: { flex: 1 },
  formContainer: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: Platform.OS === 'ios' ? 40 : 56 },
  modernAmountContainer: { backgroundColor: '#F8FAFC', borderRadius: 20, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#F1F5F9' },
  modernAmountLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', letterSpacing: 1 },
  amountInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 6 },
  currencySymbol: { fontSize: 36, fontWeight: '700', color: '#0F172A', marginRight: 4 },
  amountInput: { flex: 1, fontSize: 40, fontWeight: '700', color: '#0F172A', letterSpacing: -1 },
  remainingBalanceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 4 },
  remainingBalanceText: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  inputGroup: { marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 8 },
  textInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, paddingHorizontal: 14, height: 52 },
  inputIcon: { marginRight: 8 },
  textInput: { flex: 1, fontSize: 14, color: '#0F172A', fontWeight: '500' },
  submitButton: { backgroundColor: '#0F172A', height: 54, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 12, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 },
  disabledButton: { opacity: 0.6 },
  submitButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16, letterSpacing: -0.2 },
});