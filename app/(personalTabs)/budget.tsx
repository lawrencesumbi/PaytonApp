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
const PEEK_STEP = 14;
const MAX_PEEKS = 3;
const MAX_SLOTS = MAX_PEEKS + 1;
const ANIM_FRONT_Y = MAX_PEEKS * PEEK_STEP;

// ---- Green to Blue Gradient Harmony ----
// Front card is a soft, inviting mint, while the deeper peeking cards
// fade beautifully into rich, deep ocean blues.
const STACK_PALETTE = [
  { bg: '#E0F8F2', text: '#0F172A' }, // 1. Soft Mint (Front accent)
  { bg: '#7ECFC0', text: '#0F172A' }, // 2. Teal
  { bg: '#56C5B6', text: '#0F172A' }, // 3. Aqua
  { bg: '#3AAFAF', text: '#FFFFFF' }, // 4. Sky Blue
  { bg: '#2891C6', text: '#FFFFFF' }, // 5. Royal Blue
  { bg: '#1B4F72', text: '#FFFFFF' }, // 6. Deep Navy (Back)
];

export default function SpenderExpensesScreen() {
  const router = useRouter();
  const { scannedName, scannedAmount } = useLocalSearchParams<{ scannedName?: string; scannedAmount?: string }>();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [budgets, setBudgets] = useState<BudgetOption[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<BudgetOption | null>(null);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [topCardId, setTopCardId] = useState<string | null>(null);
  
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isAnimating = useRef(false);
  
  const slots = useRef(
    Array.from({ length: MAX_SLOTS }).map((_, i) => ({
      y: new Animated.Value(ANIM_FRONT_Y - (i * PEEK_STEP)),
      x: new Animated.Value(i === 0 ? 0 : i * 8),
      s: new Animated.Value(1),
    }))
  ).current;

  const fetchActiveBudgets = useCallback(async (shouldAutoSelect = false) => {
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
      
      if (validBudgets.length > 0 && shouldAutoSelect) {
        setSelectedBudget(validBudgets[0]);
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
      if (scannedAmount) setAmount(scannedAmount);
      if (scannedName) setDescription(`Scanned: ${scannedName}`);
      await fetchActiveBudgets(true);
      if (hasScanData) setIsModalOpen(true);
    };
    handleInitialSync();
  }, [scannedAmount, scannedName, fetchActiveBudgets]);

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

      Alert.alert("Success ", `₱${expenseAmount.toFixed(2)} captured.`);
      setAmount(''); setDescription(''); setIsModalOpen(false);
      await fetchActiveBudgets(false);
      const updatedBudget = budgets.find(b => b.id === selectedBudget.id);
      if (updatedBudget) setSelectedBudget({ ...updatedBudget, remaining_amount: newRemaining });
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectBudget = (tappedItem: BudgetOption) => {
    if (isAnimating.current || tappedItem.id === selectedBudget?.id) return;
    isAnimating.current = true;

    setTopCardId(tappedItem.id);

    const visualItems = [
      selectedBudget, 
      ...budgets.filter(b => b.id !== selectedBudget?.id).slice(0, MAX_PEEKS)
    ];
    const tappedIndex = visualItems.findIndex(b => b?.id === tappedItem.id);

    if (tappedIndex === -1) {
      isAnimating.current = false;
      return;
    }

    const tappedSlot = slots[tappedIndex];
    const frontSlot = slots[0];

    const targetY = ANIM_FRONT_Y - (tappedIndex * PEEK_STEP);
    const targetX = tappedIndex * 8;

    Animated.parallel([
      Animated.spring(tappedSlot.y, { toValue: ANIM_FRONT_Y, useNativeDriver: true, tension: 60, friction: 12 }),
      Animated.spring(tappedSlot.x, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }),
    ]).start();

    Animated.sequence([
      Animated.spring(tappedSlot.s, { toValue: 1.06, useNativeDriver: true, tension: 100, friction: 10 }),
      Animated.spring(tappedSlot.s, { toValue: 1, useNativeDriver: true, tension: 100, friction: 10 })
    ]).start();

    Animated.parallel([
      Animated.spring(frontSlot.y, { toValue: targetY, useNativeDriver: true, tension: 60, friction: 12 }),
      Animated.spring(frontSlot.x, { toValue: targetX, useNativeDriver: true, tension: 60, friction: 12 }),
    ]).start();

    setTimeout(() => {
      setSelectedBudget(tappedItem);
      setTopCardId(null);
      isAnimating.current = false;
    }, 320);
  };

  const handleFrontCardPress = () => {
    if (isAnimating.current) return;
    isAnimating.current = true;

    const frontSlot = slots[0];

    Animated.parallel([
      Animated.spring(frontSlot.y, { toValue: ANIM_FRONT_Y + 35, useNativeDriver: true, tension: 80, friction: 12 }),
      Animated.spring(frontSlot.s, { toValue: 1.07, useNativeDriver: true, tension: 80, friction: 12 }),
    ]).start();

    const pushBackAnims = slots.slice(1).map((slot, i) =>
      Animated.spring(slot.y, { toValue: ANIM_FRONT_Y - ((i + 1) * PEEK_STEP) - 12, useNativeDriver: true, tension: 100, friction: 15 })
    );
    Animated.parallel(pushBackAnims).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.spring(frontSlot.y, { toValue: ANIM_FRONT_Y, useNativeDriver: true, tension: 60, friction: 10 }),
        Animated.spring(frontSlot.s, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
        ...slots.slice(1).map((slot, i) =>
          Animated.spring(slot.y, { toValue: ANIM_FRONT_Y - ((i + 1) * PEEK_STEP), useNativeDriver: true, tension: 60, friction: 12 })
        )
      ]).start(() => {
        isAnimating.current = false;
      });
    }, 250); 
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading && budgets.length === 0) {
    return (
      <SafeAreaView style={[styles.container, styles.centeredContent]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="small" color="#10B981" />
      </SafeAreaView>
    );
  }

  const remainingPercent = selectedBudget 
    ? Math.max(0, Math.min(100, (selectedBudget.remaining_amount / selectedBudget.allocated_amount) * 100)) 
    : 0;

  const otherBudgets = budgets.filter(b => b.id !== selectedBudget?.id);
  const peekBudgets = otherBudgets.slice(0, MAX_PEEKS);
  const hiddenCount = otherBudgets.length - peekBudgets.length;

  const visualItems = [selectedBudget, ...peekBudgets];

  const analyticsData = budgets
    .map(b => {
      const spent = b.allocated_amount - b.remaining_amount;
      const pct = b.allocated_amount > 0 ? Math.max(0, Math.min(100, (spent / b.allocated_amount) * 100)) : 0;
      return { id: b.id, name: b.categories.name, color: b.categories.color, spent, pct };
    })
    .sort((a, b) => b.spent - a.spent);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Budget</Text>
      </View>

      {selectedBudget ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
          <View style={[styles.stackWrapper, { height: ANIM_FRONT_Y + CARD_HEIGHT + 40, marginTop: 120 }]}>
            {visualItems.map((item, index) => {
              if (!item) return null;
              
              const slot = slots[index];
              const isFront = index === 0;
              
              const paletteIndex = isFront ? 0 : index - 1;
              const activePalette = STACK_PALETTE[paletteIndex % STACK_PALETTE.length];
              const zIdx = item.id === topCardId ? MAX_SLOTS + 10 : MAX_SLOTS - index;

              return (
                <Animated.View
                  key={item.id}
                  style={[
                    styles.absCardContainer,
                    {
                      transform: [
                        { translateY: slot.y },
                        { translateX: slot.x },
                        { scale: slot.s }
                      ],
                      zIndex: zIdx,
                    }
                  ]}
                >
                  {isFront ? (
                    <TouchableOpacity 
                      activeOpacity={0.9} 
                      onPress={handleFrontCardPress} 
                      style={{ flex: 1 }}
                    >
                      <View style={styles.summaryCard}>
                        <View style={styles.summaryHeader}>
                          <View style={styles.summaryLeft}>
                            <View style={[styles.summaryIconWrap, { backgroundColor: `${activePalette.bg}40` }]}>
                              <Ionicons name={item.categories.icon || 'wallet-outline'} size={24} color={activePalette.bg} />
                            </View>
                            <Text style={styles.summaryTitle}>{item.categories.name}</Text>
                          </View>
                          <View style={styles.summaryRight}>
                            <Text style={styles.summaryAmount}>₱{item.allocated_amount.toLocaleString()}</Text>
                            <Text style={[styles.summaryPercentage, { color: activePalette.bg }]}>● {remainingPercent.toFixed(0)}%</Text>
                          </View>
                        </View>
                        
                        <View style={[styles.progressTrack, { backgroundColor: `${activePalette.bg}20` }]}>
                          <View style={[styles.progressFill, { width: `${remainingPercent}%`, backgroundColor: activePalette.bg }]} />
                        </View>

                        <View style={styles.summaryFooter}>
                          <View style={styles.footerStat}>
                            <Text style={styles.footerStatLabel}>Spent</Text>
                            <Text style={styles.footerStatValue}>₱{(item.allocated_amount - item.remaining_amount).toLocaleString()}</Text>
                          </View>
                          <View style={[styles.footerStat, { alignItems: 'center' }]}>
                            <Text style={styles.footerStatLabel}>Remaining</Text>
                            <Text style={[styles.footerStatValue, { color: activePalette.bg }]}>₱{item.remaining_amount.toLocaleString()}</Text>
                          </View>
                          <View style={[styles.footerStat, { alignItems: 'flex-end' }]}>
                            <Text style={styles.footerStatLabel}>Total</Text>
                            <Text style={styles.footerStatValue}>₱{item.allocated_amount.toLocaleString()}</Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity activeOpacity={0.9} onPress={() => handleSelectBudget(item)} style={{ flex: 1 }}>
                      <View style={[styles.peekCard, { backgroundColor: activePalette.bg }]}>
                        <View style={styles.peekCardHeader}>
                          <View style={[styles.peekIconWrap, { backgroundColor: `${activePalette.text}30` }]}>
                            <Ionicons name={item.categories.icon || 'wallet-outline'} size={16} color={activePalette.text} />
                          </View>
                          <Text style={[styles.peekCardName, { color: activePalette.text }]} numberOfLines={1}>{item.categories.name}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  )}
                </Animated.View>
              );
            })}
          </View>

          {hiddenCount > 0 && (
            <Text style={styles.hiddenCountHint}>+{hiddenCount} more folder{hiddenCount > 1 ? 's' : ''} in the stack</Text>
          )}

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
              transactions.map((item) => (
                <View key={item.id} style={styles.transactionItem}>
                  <View style={styles.txIconWrap}>
                    <Ionicons name="receipt-outline" size={18} color="#64748B" />
                  </View>
                  <View style={styles.txInfo}>
                    <Text style={styles.txName} numberOfLines={1}>{item.description}</Text>
                    <Text style={styles.txDate}>{formatDate(item.spent_at)}</Text>
                  </View>
                  <Text style={styles.txAmount}>-₱{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                </View>
              ))
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
              <View style={{ flex: 1 }}>
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
                <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.formContainer} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
                      <Ionicons name="document-text-outline" size={18} color="#94A3B8" style={{ marginRight: 10 }} />
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

  // ========== ANIMATED STACK ==========
  stackWrapper: {
    marginHorizontal: 24,
    position: 'relative',
  },
  absCardContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: CARD_HEIGHT,
  },
  peekCard: {
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 18,
  },
  peekCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  peekIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  peekCardName: { fontSize: 14, fontWeight: '700', flex: 1 },
  hiddenCountHint: {
    textAlign: 'center',
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 10,
  },

  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    height: '100%',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  summaryIconWrap: { width: 50, height: 50, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  summaryTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', flex: 1 },
  summaryRight: { alignItems: 'flex-end' },
  summaryAmount: { fontSize: 24, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  summaryPercentage: { fontSize: 14, color: '#64748B', marginTop: 6, fontWeight: '600' },
  
  progressTrack: { height: 10, borderRadius: 10, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 10 },

  summaryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  footerStat: { flex: 1 },
  footerStatLabel: { fontSize: 12, color: '#94A3B8', fontWeight: '600', marginBottom: 4, textTransform: 'uppercase' },
  footerStatValue: { fontSize: 16, fontWeight: '700', color: '#0F172A' },

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
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  txIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  txInfo: { flex: 1 },
  txName: { fontSize: 15, fontWeight: '600', color: '#0F172A', marginBottom: 2 },
  txDate: { fontSize: 13, color: '#94A3B8' },
  txAmount: { fontSize: 16, fontWeight: '700', color: '#EF4444' },

  emptyTxState: { alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyTxText: { marginTop: 12, fontSize: 15, color: '#94A3B8', fontWeight: '500' },

  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 60,
    height: 60,
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
  modalDragHandle: { width: 36, height: 4, backgroundColor: '#E2E8F0', borderRadius: 10, alignSelf: 'center', marginBottom: 6 },
  closeModalHeaderIcon: { backgroundColor: '#F1F5F9', padding: 8, borderRadius: 50 },
  modernCategoryBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 6, gap: 5 },
  modernCategoryBadgeText: { fontSize: 12, fontWeight: '600' },
  modalHeader: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  modalTitle: { fontSize: 22, fontWeight: '700', color: '#0F172A', letterSpacing: -0.5 },
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
  textInput: { flex: 1, fontSize: 14, color: '#0F172A', fontWeight: '500' },
  submitButton: { backgroundColor: '#0F172A', height: 54, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 12, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 },
  disabledButton: { opacity: 0.6 },
  submitButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16, letterSpacing: -0.2 },
});