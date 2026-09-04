import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
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
import { styles as splitStyles } from './split.style';

// ---------------------------------------------------------------------------
// UNIFIED COLOR PALETTE & LIGHT PASTEL CARD THEMES (SYNCHRONIZED WITH home.tsx)
// ---------------------------------------------------------------------------
const COLORS = {
  deepTeal: '#1F4F59',
  cyan: '#54C9CC',
  cyanLight: '#7EDDE0',
  olive: '#7EA00E',
  yellowGreen: '#DCD964',
  darkOlive: '#213502',
  bg: '#F4F8F4',
  card: '#FFFFFF',
  white: '#FFFFFF',
  textMuted: '#7E8F82',
};

const CARD_THEMES = [
  { bg: '#E6F0F2', text: '#1F4F59', iconBg: '#54C9CC', iconColor: '#FFFFFF' },
  { bg: '#F4F8E8', text: '#213502', iconBg: '#7EA00E', iconColor: '#FFFFFF' },
  { bg: '#FAFAD8', text: '#213502', iconBg: '#DCD964', iconColor: '#213502' },
];

interface BudgetOption {
  id: string;
  allowance_id: string;
  allocated_amount: number;
  remaining_amount: number;
  spent_amount: number;
  remaining_percent: number;
  spent_percent: number;
  categories: {
    id: string;
    name: string;
    icon: string;
    color: string;
  };
}

export default function SpenderExpensesScreen() {
  const router = useRouter();

  const { scannedName, scannedAmount, scannedCategory } = useLocalSearchParams<{
    scannedName?: string;
    scannedAmount?: string;
    scannedCategory?: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [budgets, setBudgets] = useState<BudgetOption[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<BudgetOption | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  // Sub-Header & Aggregates
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [totalAllocated, setTotalAllocated] = useState<number>(0);
  const [totalRemaining, setTotalRemaining] = useState<number>(0);
  const [totalSpent, setTotalSpent] = useState<number>(0);

  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchActiveBudgets = useCallback(async (shouldAutoSelect = false, targetCategory?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const todayStr = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('budgets')
        .select(`
          id,
          allocated_amount,
          allowance_id,
          allowances!inner (
            id,
            start_date,
            end_date
          ),
          categories:category_id (
            id,
            name,
            icon,
            color
          ),
          expenses (
            amount
          )
        `)
        .eq('user_id', user.id)
        .gte('allowances.end_date', todayStr);

      if (error) throw error;

      let totalAllocatedAll = 0;
      let totalRemainingAll = 0;
      let totalSpentAll = 0;
      let calculatedDaysLeft: number | null = null;

      const validBudgets: BudgetOption[] = (data || [])
        .filter((b: any) => b.categories && b.allowances && Number(b.allocated_amount) > 0)
        .map((b: any) => {
          const allocated = Number(b.allocated_amount) || 0;

          const totalSpentCat = (b.expenses || []).reduce(
            (sum: number, exp: { amount: number }) => sum + (Number(exp.amount) || 0),
            0
          );

          const calculatedRemaining = Math.max(0, allocated - totalSpentCat);
          const remPercent = allocated > 0 ? Math.min(100, Math.max(0, (calculatedRemaining / allocated) * 100)) : 0;
          const spentPercent = allocated > 0 ? Math.min(100, Math.max(0, (totalSpentCat / allocated) * 100)) : 0;

          totalAllocatedAll += allocated;
          totalRemainingAll += calculatedRemaining;
          totalSpentAll += totalSpentCat;

          if (b.allowances?.end_date) {
            const endDate = new Date(b.allowances.end_date);
            const today = new Date();
            const diffTime = endDate.getTime() - today.getTime();
            const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
            if (calculatedDaysLeft === null || diffDays < calculatedDaysLeft) {
              calculatedDaysLeft = diffDays;
            }
          }

          return {
            id: b.id,
            allowance_id: b.allowance_id,
            allocated_amount: allocated,
            remaining_amount: calculatedRemaining,
            spent_amount: totalSpentCat,
            remaining_percent: remPercent,
            spent_percent: spentPercent,
            categories: {
              id: b.categories.id,
              name: b.categories.name,
              icon: b.categories.icon || 'folder-outline',
              color: b.categories.color || COLORS.olive,
            }
          };
        });

      // Sort: Highest spent_amount first
      validBudgets.sort((a, b) => b.spent_amount - a.spent_amount);

      setBudgets(validBudgets);
      setDaysRemaining(calculatedDaysLeft);
      setTotalAllocated(totalAllocatedAll);
      setTotalRemaining(totalRemainingAll);
      setTotalSpent(totalSpentAll);

      if (validBudgets.length > 0 && shouldAutoSelect) {
        if (targetCategory) {
          const matchedBudget = validBudgets.find(
            (b) => b.categories.name.toLowerCase().trim() === targetCategory.toLowerCase().trim()
          );
          setSelectedBudget(matchedBudget || validBudgets[0]);
        } else {
          setSelectedBudget(validBudgets[0]);
        }
      } else {
        setSelectedBudget(null);
      }
    } catch (error: any) {
      console.error("Fetch Budgets Error:", error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchActiveBudgets(false);
  }, [fetchActiveBudgets]);

  useEffect(() => {
    const handleInitialSync = async () => {
      setLoading(true);
      const hasScanData = !!(scannedAmount || scannedName || scannedCategory);

      if (scannedAmount) setAmount(scannedAmount);
      if (scannedName) setDescription(`Scanned: ${scannedName}`);

      await fetchActiveBudgets(hasScanData, scannedCategory);

      if (hasScanData) {
        setIsModalOpen(true);
      }
    };

    handleInitialSync();
  }, [scannedAmount, scannedName, scannedCategory, fetchActiveBudgets]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedBudget(null);
    router.setParams({ scannedName: undefined, scannedAmount: undefined, scannedCategory: undefined });
  };

  const handleLogExpense = async () => {
    if (!selectedBudget) {
      Alert.alert("Missing Category", "Please select an active budget category target.");
      return;
    }

    const expenseAmount = parseFloat(amount);
    if (isNaN(expenseAmount) || expenseAmount <= 0) {
      Alert.alert("Invalid Amount", "Please input a positive numeric transaction value.");
      return;
    }

    if (expenseAmount > selectedBudget.remaining_amount) {
      Alert.alert(
        "Insufficient Budget ❌",
        `You cannot spend ₱${expenseAmount.toFixed(2)} because you only have ₱${selectedBudget.remaining_amount.toFixed(2)} remaining inside this specific folder.`
      );
      return;
    }

    try {
      setSubmitting(true);

      const { error: insertError } = await supabase
        .from('expenses')
        .insert({
          budget_id: selectedBudget.id,
          allowance_id: selectedBudget.allowance_id,
          amount: expenseAmount,
          description: description.trim() || 'Uncategorized Expense',
          spent_at: new Date().toISOString()
        });

      if (insertError) throw insertError;

      Alert.alert("Success", `Your transaction of ₱${expenseAmount.toFixed(2)} was securely captured.`);

      setAmount('');
      setDescription('');
      handleCloseModal();
      await fetchActiveBudgets(false);

    } catch (error: any) {
      Alert.alert("Transaction Aborted", error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCardPress = (item: BudgetOption) => {
    router.push({
      pathname: '/(spenderTabs)/Budgetcategorydetails',
      params: {
        budgetId: item.id,
        categoryName: item.categories.name,
        categoryIcon: item.categories.icon,
        categoryColor: item.categories.color,
        allocatedAmount: item.allocated_amount.toString(),
        remainingAmount: item.remaining_amount.toString()
      }
    });
  };

  if (loading && budgets.length === 0) {
    return (
      <SafeAreaView style={[styles.container, styles.centeredContent]}>
        <StatusBar style="light" />
        <ActivityIndicator size="small" color={COLORS.yellowGreen} />
      </SafeAreaView>
    );
  }

  const overallDailyLimit = (daysRemaining && daysRemaining > 0)
    ? (totalRemaining / daysRemaining).toFixed(0)
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* HEADER CONTAINER WITH INTEGRATED TOTAL REMAINING BALANCE CARD */}
      <View style={styles.headerContainerWrapper}>
        <View style={styles.modernHeader}>
          <View style={styles.headerLeft}>
            <Ionicons name="wallet-outline" size={26} color={COLORS.cyan} />
            <Text style={styles.modernHeaderTitle}>Select Budget</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push('/(spenderTabs)/statistics')}
            style={styles.quickFormTrigger}
          >
            <Ionicons name="bar-chart-outline" size={18} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        {/* INTEGRATED SUMMARY CARD */}
        {budgets.length > 0 && (
          <View style={styles.headerSummaryCard}>
            <View style={styles.summaryTopRow}>
              <View>
                <Text style={styles.summaryLabel}>TOTAL REMAINING BALANCE</Text>
                <Text style={styles.summaryAmount}>
                  ₱{totalRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={styles.cycleBadge}>
                <Ionicons name="calendar-outline" size={12} color={COLORS.deepTeal} />
                <Text style={styles.cycleBadgeText}>
                  {daysRemaining !== null ? `${daysRemaining} days left` : 'Active'}
                </Text>
              </View>
            </View>

            <View style={styles.summaryStatsRow}>
              <View style={styles.miniStatItem}>
                <Text style={styles.miniStatLabel}>Total Budget</Text>
                <Text style={styles.miniStatValue}>₱{totalAllocated.toLocaleString()}</Text>
              </View>

              <View style={styles.miniStatDivider} />

              <View style={styles.miniStatItem}>
                <Text style={styles.miniStatLabel}>Total Spent</Text>
                <Text style={styles.miniStatValue}>₱{totalSpent.toLocaleString()}</Text>
              </View>

              <View style={styles.miniStatDivider} />

              <View style={styles.miniStatItem}>
                <Text style={styles.miniStatLabel}>Active Folders</Text>
                <Text style={styles.miniStatValue}>{budgets.length} Items</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* LOWER DASHBOARD SECTION */}
      {budgets.length > 0 && (
        <View style={styles.fixedTopSection}>
          {/* INSIGHT BANNER (STAYS ABOVE BUDGET FOLDERS) */}
          {overallDailyLimit && (
            <View style={styles.insightBanner}>
              <View style={styles.insightIconWrapper}>
                <Ionicons name="sparkles" size={14} color={COLORS.olive} />
              </View>
              <Text style={styles.insightText}>
                Overall daily limit: <Text style={styles.insightBold}>₱{overallDailyLimit}/day</Text> across all folders.
              </Text>
            </View>
          )}

          {/* FIXED SECTION TITLE */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Budget Folders</Text>
            <Text style={styles.sectionSubTitle}>Select card to log</Text>
          </View>
        </View>
      )}

      {/* CARDS LIST */}
      {budgets.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyStateContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.olive}
              colors={[COLORS.olive]}
            />
          }
        >
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="wallet-outline" size={28} color={COLORS.textMuted} />
            </View>
            <Text style={styles.emptyText}>No Active Budgets Allocated</Text>
            <Text style={styles.emptySub}>
              To populate transactional items, configure and allocate capital tokens via your Home layout first.
            </Text>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={budgets}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollableCardsContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.olive}
              colors={[COLORS.olive]}
            />
          }
          renderItem={({ item, index }) => {
            const allocated = item.allocated_amount;
            const spent = item.spent_amount;
            const remaining = item.remaining_amount;
            const remainingPercent = item.remaining_percent;
            const spentPercentFormatted = Math.round(item.spent_percent);

            const dailyAllowance = (daysRemaining && daysRemaining > 0)
              ? (remaining / daysRemaining).toFixed(0)
              : null;

            let healthStatus = { label: 'Safe', color: '#16A34A', bg: '#DCFCE7' };
            if (remainingPercent <= 15) {
              healthStatus = { label: 'Critical', color: '#DC2626', bg: '#FEE2E2' };
            } else if (remainingPercent <= 40) {
              healthStatus = { label: 'Caution', color: '#D97706', bg: '#FEF3C7' };
            }

            const theme = CARD_THEMES[index % CARD_THEMES.length];

            return (
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => handleCardPress(item)}
                style={[
                  styles.unstackedBudgetCard,
                  { backgroundColor: theme.bg }
                ]}
              >
                {/* Header Row */}
                <View style={styles.cardHeaderRow}>
                  <View style={[styles.iconContainer, { backgroundColor: theme.iconBg }]}>
                    {/* @ts-ignore */}
                    <Ionicons name={item.categories.icon || 'folder-outline'} size={18} color={theme.iconColor} />
                  </View>

                  <View style={styles.titleWrapper}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.categoryTitle, { color: theme.text }]} numberOfLines={1}>
                        {item.categories.name}
                      </Text>
                      <View style={[styles.miniHealthBadge, { backgroundColor: healthStatus.bg }]}>
                        <Text style={[styles.miniHealthBadgeText, { color: healthStatus.color }]}>
                          {healthStatus.label}
                        </Text>
                      </View>
                    </View>

                    {dailyAllowance && (
                      <Text style={styles.dailyLimitText}>
                        ~₱{dailyAllowance}/day safe limit
                      </Text>
                    )}
                  </View>

                  <View style={[styles.spentBadge, { backgroundColor: 'rgba(0,0,0,0.03)' }]}>
                    <Text style={[styles.spentBadgeText, { color: theme.text }]}>
                      {spentPercentFormatted}% Spent
                    </Text>
                  </View>
                </View>

                {/* Progress Bar */}
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${remainingPercent}%`, backgroundColor: theme.iconBg }
                    ]}
                  />
                </View>

                {/* Stats Row */}
                <View style={styles.statsRow}>
                  <View style={styles.statCol}>
                    <Text style={[styles.statLabel, { color: theme.text }]}>TOTAL</Text>
                    <Text style={[styles.statValue, { color: theme.text }]}>
                      ₱{allocated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>

                  <View style={[styles.statCol, { alignItems: 'center' }]}>
                    <Text style={[styles.statLabel, { color: theme.text }]}>SPENT</Text>
                    <Text style={[styles.statValue, { color: theme.text }]}>
                      ₱{spent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>

                  <View style={[styles.statCol, { alignItems: 'flex-end' }]}>
                    <Text style={[styles.statLabel, { color: theme.text }]}>REMAINING</Text>
                    <Text style={[styles.statValue, { color: theme.text }]}>
                      ₱{remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Expense Modal */}
      <Modal
        visible={isModalOpen}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={handleCloseModal}
          />

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContent}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={{ flex: 1 }}>
                <View style={styles.modalDragHandle} />

                <View style={styles.header}>
                  <View style={styles.headerRow}>
                    <View>
                      <Text style={styles.headerTitle}>Log New Expense</Text>
                      {selectedBudget && (
                        <View style={[styles.modernCategoryBadge, { backgroundColor: '#E6F0F2' }]}>
                          {/* @ts-ignore */}
                          <Ionicons name={selectedBudget.categories.icon || 'folder-outline'} size={14} color={COLORS.deepTeal} />
                          <Text style={styles.modernCategoryBadgeText}>
                            {selectedBudget.categories.name}
                          </Text>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.closeModalHeaderIcon}
                      activeOpacity={0.7}
                      onPress={handleCloseModal}
                    >
                      <Ionicons name="close" size={18} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>

                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={styles.formContainer}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.modernAmountContainer}>
                    <Text style={styles.modernAmountLabel}>AMOUNT SPENT</Text>
                    <View style={styles.amountInputRow}>
                      <Text style={styles.currencySymbol}>₱</Text>
                      <TextInput
                        style={styles.amountInput}
                        placeholder="0.00"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                        value={amount}
                        onChangeText={setAmount}
                        editable={!submitting}
                        autoFocus
                      />
                    </View>
                    {selectedBudget && (
                      <View style={styles.remainingBalanceRow}>
                        <Ionicons name="wallet-outline" size={13} color={COLORS.textMuted} />
                        <Text style={styles.remainingBalanceText}>
                          Folder Limit: ₱{selectedBudget.remaining_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Description / Remarks</Text>
                    <View style={styles.textInputWrapper}>
                      <Ionicons name="document-text-outline" size={16} color={COLORS.textMuted} style={{ marginRight: 10 }} />
                      <TextInput
                        style={styles.textInput}
                        placeholder="What did you purchase?"
                        placeholderTextColor={COLORS.textMuted}
                        value={description}
                        onChangeText={setDescription}
                        editable={!submitting}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.submitButton, submitting && styles.disabledButton]}
                    onPress={handleLogExpense}
                    disabled={submitting}
                    activeOpacity={0.8}
                  >
                    {submitting ? (
                      <ActivityIndicator color={COLORS.white} size="small" />
                    ) : (
                      <>
                        <Text style={styles.submitButtonText}>Save Transaction</Text>
                        <Ionicons name="arrow-forward" size={16} color={COLORS.white} />
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

const budgetStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  centeredContent: { justifyContent: 'center', alignItems: 'center' },
  emptyStateContainer: { flexGrow: 1, justifyContent: 'center' },

  /* --- HEADER & INTEGRATED TOTAL REMAINING BALANCE CARD --- */
  headerContainerWrapper: {
    backgroundColor: COLORS.deepTeal,
    paddingBottom: 16,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  modernHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 16 : 12,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modernHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: -0.3,
  },
  quickFormTrigger: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerSummaryCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.8,
  },
  summaryAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.deepTeal,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  cycleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E6F0F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cycleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.deepTeal,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  miniStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  miniStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  miniStatValue: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.darkOlive,
  },
  miniStatDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#E2E8F0',
  },

  /* --- LOWER FIXED DASHBOARD CONTAINER --- */
  fixedTopSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
    backgroundColor: COLORS.bg,
  },
  insightBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    gap: 8,
  },
  insightIconWrapper: {
    backgroundColor: '#DCFCE7',
    padding: 4,
    borderRadius: 20,
  },
  insightText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.olive,
    fontWeight: '500',
  },
  insightBold: {
    fontWeight: '800',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.darkOlive,
    letterSpacing: -0.3,
  },
  sectionSubTitle: {
    fontSize: 12,
    color: COLORS.textMuted,
  },

  /* --- SCROLLABLE CARDS AREA --- */
  scrollableCardsContainer: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 40,
  },
  unstackedBudgetCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  titleWrapper: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  dailyLimitText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
    marginTop: 1,
  },
  miniHealthBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  miniHealthBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  spentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  spentBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statCol: {
    flex: 1,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
    opacity: 0.6,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(13, 34, 4, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: '75%',
    paddingTop: 12,
    shadowColor: COLORS.darkOlive,
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 24,
  },
  modalDragHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    alignSelf: 'center',
    marginBottom: 6,
  },
  closeModalHeaderIcon: {
    backgroundColor: '#F1F5F9',
    padding: 6,
    borderRadius: 50,
  },
  modernCategoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
    gap: 4,
  },
  modernCategoryBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.deepTeal },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: COLORS.darkOlive, letterSpacing: -0.5 },
  formContainer: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: Platform.OS === 'ios' ? 40 : 56 },
  modernAmountContainer: {
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modernAmountLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 1 },
  amountInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 4 },
  currencySymbol: { fontSize: 28, fontWeight: '700', color: COLORS.darkOlive, marginRight: 4 },
  amountInput: { flex: 1, fontSize: 32, fontWeight: '700', color: COLORS.darkOlive, letterSpacing: -1 },
  remainingBalanceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 },
  remainingBalanceText: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.darkOlive, marginBottom: 6 },
  textInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 12, height: 46 },
  textInput: { flex: 1, fontSize: 13, color: COLORS.darkOlive, fontWeight: '500' },
  submitButton: {
    backgroundColor: COLORS.deepTeal,
    height: 48,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    shadowColor: COLORS.deepTeal, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4
  },
  disabledButton: { opacity: 0.6 },
  submitButtonText: { color: COLORS.white, fontWeight: '700', fontSize: 15, letterSpacing: -0.2 },
  emptyState: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 36, gap: 12 },
  emptyIconContainer: { width: 56, height: 56, borderRadius: 16, backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  emptyText: { fontSize: 16, fontWeight: '700', color: COLORS.darkOlive, letterSpacing: -0.4 },
  emptySub: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20, fontWeight: '400' },
});

const styles = { ...budgetStyles, ...splitStyles };