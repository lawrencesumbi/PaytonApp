// app/(sponsorTabs)/monitoring.tsx
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StatusBar as NativeStatusBar,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../../lib/supabase';

// PASTEL CARD ACCENTS: CYP/TEAL, GREEN, YELLOW
const CARD_PASTELS = [
  { bg: '#EDF7F7', border: '#D5EBEA', accent: '#2BB0AD' }, // Soft Cyan / Teal
  { bg: '#F1F8EE', border: '#E1EFE0', accent: '#6B9E3A' }, // Sage Green
  { bg: '#FCF9E8', border: '#F5EECB', accent: '#CCA42B' }, // Warm Light Yellow
];

const UI_COLORS = {
  bg: '#FAFAF9',
  surface: '#FFFFFF',
  textMain: '#1E293B',
  textMuted: '#64748B',
  border: '#F1F5F9',
  pillActiveBg: '#1E293B',
};

interface SpenderMonitoringInfo {
  id: string; // spender_id
  full_name: string;
  email: string;
  avatar_url: string | null;
  allowance_id: string;
  allowance_name: string;
  total_allowance: number;
  total_allocated: number;
  total_spent: number;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  themeIndex?: number; // Added to track exact pastel index
}

interface ExpenseHistoryItem {
  id: string;
  description: string;
  amount: number;
  category_name: string;
  spent_at: string;
}

export default function MonitoringScreen() {
  const [spenders, setSpenders] = useState<SpenderMonitoringInfo[]>([]);

  const [selectedSpender, setSelectedSpender] = useState<SpenderMonitoringInfo | null>(null);
  const [expenses, setExpenses] = useState<ExpenseHistoryItem[]>([]);
  const [filteredExpenses, setFilteredExpenses] = useState<ExpenseHistoryItem[]>([]);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('ALL');

  const [loadingSpenders, setLoadingSpenders] = useState(true);
  const [loadingExpenses, setLoadingExpenses] = useState(false);

  // 1. FETCH MASTER LIST OF ACTIVE SPENDERS WITH ALLOWANCE-SPECIFIC TOTALS
  const fetchMonitoredSpenders = async (showLoadingIndicator = true) => {
    try {
      if (showLoadingIndicator) setLoadingSpenders(true);
      const { data: { user: currentSponsor } } = await supabase.auth.getUser();
      if (!currentSponsor) return;

      const today = new Date().toISOString().split('T')[0];

      // Fetch all allowances for the logged-in sponsor
      const { data: allowancesData, error: allowanceError } = await supabase
        .from('allowances')
        .select(`
          id,
          allowance_name,
          amount,
          start_date,
          end_date,
          received_at,
          spender_id,
          profiles!spender_id (
            full_name,
            email,
            avatar_url
          )
        `)
        .eq('sponsor_id', currentSponsor.id)
        .order('received_at', { ascending: false });

      if (allowanceError) throw allowanceError;

      if (!allowancesData || allowancesData.length === 0) {
        setSpenders([]);
        return;
      }

      // Filter for strictly active allowances directly after fetching
      const activeAllowances = allowancesData.filter((allowance: any) => {
        const startDate = allowance.start_date;
        const endDate = allowance.end_date;
        return Boolean(startDate && endDate && startDate <= today && endDate >= today);
      });

      if (activeAllowances.length === 0) {
        setSpenders([]);
        return;
      }

      const spenderIds = activeAllowances
        .map((a: any) => a.spender_id)
        .filter(Boolean);

      let budgetsMap: Record<string, any[]> = {};

      if (spenderIds.length > 0) {
        const { data: budgetsData, error: budgetsError } = await supabase
          .from('budgets')
          .select(`
            id,
            user_id,
            allocated_amount,
            expenses (
              amount,
              allowance_id
            )
          `)
          .in('user_id', spenderIds);

        if (budgetsError) console.error("Budgets fetch error:", budgetsError.message);

        if (budgetsData) {
          budgetsData.forEach((b: any) => {
            if (!budgetsMap[b.user_id]) budgetsMap[b.user_id] = [];
            budgetsMap[b.user_id].push(b);
          });
        }
      }

      // Format combined data & filter metrics per ALLOWANCE ID
      const formattedSpenders: SpenderMonitoringInfo[] = activeAllowances.map((allowance: any, index: number) => {
        const userBudgets = budgetsMap[allowance.spender_id] || [];

        let totalAllocated = 0;
        let totalSpent = 0;

        userBudgets.forEach((budget: any) => {
          const expensesList = budget.expenses || [];

          const allowanceExpenses = expensesList.filter(
            (exp: any) => exp.allowance_id === allowance.id
          );

          const budgetSpent = allowanceExpenses.reduce(
            (sum: number, exp: any) => sum + Number(exp.amount || 0),
            0
          );

          totalSpent += budgetSpent;

          if (allowanceExpenses.length > 0) {
            totalAllocated += Number(budget.allocated_amount || 0);
          }
        });

        return {
          id: allowance.spender_id,
          full_name: allowance.profiles?.full_name || 'Spender User',
          email: allowance.profiles?.email || 'No Email Registered',
          avatar_url: allowance.profiles?.avatar_url || null,
          allowance_id: allowance.id,
          allowance_name: allowance.allowance_name || 'Allowance',
          total_allowance: Number(allowance.amount || 0),
          total_allocated: totalAllocated,
          total_spent: totalSpent,
          start_date: allowance.start_date,
          end_date: allowance.end_date,
          is_active: true,
          themeIndex: index % CARD_PASTELS.length
        };
      });

      formattedSpenders.sort((a, b) => {
        const dateA = new Date(a.start_date || 0).getTime();
        const dateB = new Date(b.start_date || 0).getTime();
        return dateB - dateA;
      });

      setSpenders(formattedSpenders);
    } catch (error: any) {
      console.error("Fetch Monitored Spenders Error:", error.message);
    } finally {
      setLoadingSpenders(false);
    }
  };

  // 2. FETCH SPECIFIC TRANSACTIONS FILTERED BY ALLOWANCE ID
  const fetchSpenderExpenses = async (spenderId: string, allowanceId: string) => {
    try {
      setLoadingExpenses(true);

      const { data: budgetsData, error: budgetError } = await supabase
        .from('budgets')
        .select(`
          id,
          categories (
            name
          ),
          expenses!inner (
            id,
            description,
            amount,
            spent_at,
            allowance_id
          )
        `)
        .eq('user_id', spenderId)
        .eq('expenses.allowance_id', allowanceId);

      if (budgetError && budgetError.code !== 'PGRST116') {
        console.error("Fetch Spender Expenses Error:", budgetError.message);
      }

      const allExpenses: ExpenseHistoryItem[] = [];

      (budgetsData || []).forEach((budget: any) => {
        const categoryName = budget.categories?.name || 'General Expense';
        const expensesList = budget.expenses || [];

        expensesList.forEach((exp: any) => {
          allExpenses.push({
            id: exp.id,
            description: exp.description || 'No Description',
            amount: Number(exp.amount || 0),
            spent_at: exp.spent_at || new Date().toISOString(),
            category_name: categoryName
          });
        });
      });

      allExpenses.sort((a, b) => b.spent_at.localeCompare(a.spent_at));
      setExpenses(allExpenses);
      applyCategoryFilter(activeCategoryFilter, allExpenses);
    } catch (error: any) {
      console.error("Fetch Spender Expenses Error:", error.message);
    } finally {
      setLoadingExpenses(false);
    }
  };

  useEffect(() => {
    fetchMonitoredSpenders();
  }, []);

  // Filtering Expenses List by Category Pills
  const applyCategoryFilter = (category: string, list = expenses) => {
    setActiveCategoryFilter(category);
    if (category === 'ALL') {
      setFilteredExpenses(list);
    } else {
      setFilteredExpenses(list.filter(exp => 
        exp.category_name.toLowerCase().includes(category.toLowerCase())
      ));
    }
  };

  const handleSelectSpender = (spender: SpenderMonitoringInfo) => {
    setSelectedSpender(spender);
    setActiveCategoryFilter('ALL');
    fetchSpenderExpenses(spender.id, spender.allowance_id);
  };

  const handleBackToList = () => {
    setSelectedSpender(null);
    setExpenses([]);
    setFilteredExpenses([]);
    setActiveCategoryFilter('ALL');
    fetchMonitoredSpenders(true);
  };

  const getCategoryIcon = (category: string) => {
    switch (category?.toLowerCase()) {
      case 'food':
      case 'food & dining': return 'fast-food-outline';
      case 'travel':
      case 'transport': return 'car-outline';
      case 'education':
      case 'books': return 'book-outline';
      case 'bills':
      case 'utilities': return 'receipt-outline';
      default: return 'cart-outline';
    }
  };

  const formatAllowancePeriod = (startDate: string | null, endDate: string | null) => {
    if (!startDate && !endDate) return 'No Date Set';

    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

    if (startDate && endDate) {
      const start = new Date(startDate).toLocaleDateString('en-US', options);
      const end = new Date(endDate).toLocaleDateString('en-US', { ...options, year: 'numeric' });
      return `${start} - ${end}`;
    }

    if (startDate) {
      return `From ${new Date(startDate).toLocaleDateString('en-US', { ...options, year: 'numeric' })}`;
    }

    return `Until ${new Date(endDate!).toLocaleDateString('en-US', { ...options, year: 'numeric' })}`;
  };

  const formatExpenseDate = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Helper to extract the active theme pastel for selected spender
  const activeSpenderTheme = selectedSpender
    ? CARD_PASTELS[selectedSpender.themeIndex ?? 0]
    : CARD_PASTELS[0];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>

        {/* VIEW 1: DRILLDOWN TRANSACTION LEDGER WITH EXPANDED PASTEL DETAILED CARD */}
        {selectedSpender ? (
          <View style={{ flex: 1 }}>
            <TouchableOpacity style={styles.backButton} onPress={handleBackToList}>
              <Ionicons name="arrow-back" size={18} color={UI_COLORS.textMain} />
              <Text style={styles.backButtonText}>Back to Overview</Text>
            </TouchableOpacity>

            <View style={[
              styles.detailCard, 
              { 
                backgroundColor: activeSpenderTheme.bg, 
                borderColor: activeSpenderTheme.border 
              }
            ]}>
              <View style={styles.ccHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.ccTypeLabel, { color: activeSpenderTheme.accent }]}>
                    {selectedSpender.allowance_name.toUpperCase()}
                  </Text>
                  <Text style={styles.ccHolderNameCompact}>{selectedSpender.full_name}</Text>
                  <Text style={styles.ccEmailText}>
                    {formatAllowancePeriod(selectedSpender.start_date, selectedSpender.end_date)}
                  </Text>
                </View>

                <View style={styles.ccRightWidgets}>
                  {selectedSpender.avatar_url ? (
                    <Image source={{ uri: selectedSpender.avatar_url }} style={styles.avatarCircle} />
                  ) : (
                    <View style={[
                      styles.avatarPlaceholder, 
                      { backgroundColor: '#FFFFFF', borderColor: activeSpenderTheme.border }
                    ]}>
                      <Text style={[styles.avatarText, { color: activeSpenderTheme.accent }]}>
                        {selectedSpender.full_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* LARGER METRICS BADGES WITH DYNAMIC PASTEL MATCHING */}
              <View style={styles.metricsRow}>
                <View style={[styles.metricBadge, { backgroundColor: '#FFFFFF', borderColor: activeSpenderTheme.border }]}>
                  <Text style={[styles.ccMiniLabel, { color: UI_COLORS.textMuted }]}>ALLOWANCE</Text>
                  <Text style={[styles.ccMiniValue, { color: UI_COLORS.textMain }]}>
                    ₱{selectedSpender.total_allowance.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </Text>
                </View>

                <View style={[styles.metricBadge, { backgroundColor: '#FFFFFF', borderColor: activeSpenderTheme.border }]}>
                  <Text style={[styles.ccMiniLabel, { color: UI_COLORS.textMuted }]}>SPENT</Text>
                  <Text style={[styles.ccMiniValue, { color: '#C5221F' }]}>
                    ₱{selectedSpender.total_spent.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </Text>
                </View>

                <View style={[styles.metricBadge, { backgroundColor: '#FFFFFF', borderColor: activeSpenderTheme.border }]}>
                  <Text style={[styles.ccMiniLabel, { color: activeSpenderTheme.accent }]}>REMAINING</Text>
                  <Text style={[styles.ccMiniValue, { color: activeSpenderTheme.accent }]}>
                    ₱{Math.max(0, selectedSpender.total_allowance - selectedSpender.total_spent).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Filter Transactions</Text>

            <View style={{ height: 38, marginBottom: 12 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
                {['ALL', 'Food', 'Transport', 'Bills', 'Education'].map((cat) => {
                  const isActive = activeCategoryFilter === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.filterPill, isActive && styles.filterPillActive]}
                      onPress={() => applyCategoryFilter(cat)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                        {cat === 'ALL' ? 'All Categories' : cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {loadingExpenses ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="small" color={UI_COLORS.textMain} />
              </View>
            ) : filteredExpenses.length === 0 ? (
              <View style={styles.emptyExpensesBlock}>
                <View style={styles.emptyIconWrapper}>
                  <Ionicons name="receipt-outline" size={28} color={UI_COLORS.textMuted} />
                </View>
                <Text style={styles.emptyExpensesText}>No transactions in this category.</Text>
              </View>
            ) : (
              <FlatList
                data={filteredExpenses}
                keyExtractor={(item) => item.id}
                refreshing={loadingExpenses}
                showsVerticalScrollIndicator={false}
                onRefresh={() => fetchSpenderExpenses(selectedSpender.id, selectedSpender.allowance_id)}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <View style={styles.expenseListItem}>
                    <View style={styles.expenseItemLeft}>
                      <View style={styles.iconCircle}>
                        <Ionicons name={getCategoryIcon(item.category_name)} size={16} color={UI_COLORS.textMuted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.expenseItemName} numberOfLines={1}>{item.description}</Text>
                        <Text style={styles.expenseItemCategory}>
                          {item.category_name} • {formatExpenseDate(item.spent_at)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.expenseItemAmount}>- ₱{item.amount.toFixed(2)}</Text>
                  </View>
                )}
              />
            )}
          </View>
        ) : (

          /* VIEW 2: MONITORING OVERVIEW SCREEN */
          <View style={{ flex: 1 }}>
            <Text style={styles.mainTitle}>Spender Monitoring</Text>
            <Text style={styles.mainSubtitle}>Select a dependent below to inspect their ledger updates.</Text>

            {/* SINGLE "ALL SPENDERS" FILTER PILL */}
            <View style={{ height: 38, marginBottom: 16 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
                <View style={[styles.filterPill, styles.filterPillActive]}>
                  <Text style={styles.filterPillTextActive}>
                    All Spenders ({spenders.length})
                  </Text>
                </View>
              </ScrollView>
            </View>

            {loadingSpenders ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="small" color={UI_COLORS.textMain} />
              </View>
            ) : spenders.length === 0 ? (
              <View style={styles.emptySpendersBlock}>
                <View style={styles.emptyIconWrapper}>
                  <Ionicons name="analytics-outline" size={32} color={UI_COLORS.textMuted} />
                </View>
                <Text style={styles.emptySpendersText}>No spenders found</Text>
                <Text style={styles.emptySubtext}>
                  There are currently no active allowances assigned.
                </Text>
              </View>
            ) : (
              <FlatList
                data={spenders}
                keyExtractor={(item) => item.allowance_id || item.id}
                refreshing={loadingSpenders}
                showsVerticalScrollIndicator={false}
                onRefresh={() => fetchMonitoredSpenders(true)}
                contentContainerStyle={styles.listContent}
                renderItem={({ item, index }) => {
                  const remainingAmount = Math.max(0, item.total_allowance - item.total_spent);
                  const remainingPercentage = item.total_allowance > 0
                    ? Math.min(Math.max((remainingAmount / item.total_allowance) * 100, 0), 100)
                    : 0;

                  // INLINE COLOR MATCHING FROM CARD_PASTELS THEME (Teal, Green, Yellow)
                  const theme = CARD_PASTELS[index % CARD_PASTELS.length];

                  return (
                    <TouchableOpacity onPress={() => handleSelectSpender(item)} activeOpacity={0.85}>
                      <View style={[
                        styles.overviewCard, 
                        { backgroundColor: theme.bg, borderColor: theme.border }
                      ]}>
                        <View style={styles.ccHeaderRow}>
                          <View style={{ flex: 1, marginRight: 12 }}>
                            <Text style={[styles.overviewTypeLabel, { color: theme.accent }]}>
                              {item.allowance_name.toUpperCase()}
                            </Text>
                            <Text style={styles.overviewHolderName}>{item.full_name}</Text>
                            <Text style={styles.overviewDateText}>
                              {formatAllowancePeriod(item.start_date, item.end_date)}
                            </Text>
                          </View>

                          <View style={styles.overviewRightCol}>
                            {item.avatar_url ? (
                              <Image source={{ uri: item.avatar_url }} style={styles.overviewAvatarCircle} />
                            ) : (
                              <View style={[styles.overviewAvatarPlaceholder, { backgroundColor: '#FFFFFF', borderColor: theme.border }]}>
                                <Text style={[styles.overviewAvatarText, { color: theme.accent }]}>
                                  {item.full_name.charAt(0).toUpperCase()}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {/* EXPANDED PROGRESS SECTION */}
                        <View style={styles.overviewProgressWrapper}>
                          <View style={styles.overviewProgressRow}>
                            <Text style={styles.overviewSubLabel}>Remaining Balance</Text>
                            <Text style={[styles.overviewProgressText, { color: theme.accent }]}>
                              ₱{remainingAmount.toLocaleString('en-US')} / ₱{item.total_allowance.toLocaleString('en-US')}
                            </Text>
                          </View>
                          <View style={styles.overviewProgressBarTrack}>
                            <View
                              style={[
                                styles.overviewProgressBarFill,
                                {
                                  width: `${remainingPercentage}%`,
                                  backgroundColor: theme.accent
                                }
                              ]}
                            />
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.bg, paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0 },
  content: { flex: 1, paddingHorizontal: 16 },
  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 40 },
  listContent: { paddingBottom: 100 },
  mainTitle: { fontSize: 22, fontWeight: '700', color: UI_COLORS.textMain, marginTop: 12 },
  mainSubtitle: { fontSize: 13, color: UI_COLORS.textMuted, marginTop: 2, marginBottom: 12, lineHeight: 18 },

  filterBar: { flexDirection: 'row', gap: 8, paddingRight: 16, alignItems: 'center' },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: UI_COLORS.surface,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
  },
  filterPillActive: {
    backgroundColor: UI_COLORS.pillActiveBg,
    borderColor: UI_COLORS.pillActiveBg,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: UI_COLORS.textMuted,
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },

  /* OVERVIEW CARD STYLING */
  overviewCard: {
    padding: 20,
    borderRadius: 20,
    marginBottom: 14,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  overviewTypeLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  overviewHolderName: {
    fontSize: 19,
    fontWeight: '700',
    color: UI_COLORS.textMain,
    marginTop: 3,
  },
  overviewDateText: {
    fontSize: 12,
    color: UI_COLORS.textMuted,
    marginTop: 3,
  },
  overviewRightCol: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  overviewAvatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  overviewAvatarPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  overviewAvatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  overviewProgressWrapper: {
    marginTop: 18,
  },
  overviewProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  overviewSubLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: UI_COLORS.textMuted,
  },
  overviewProgressText: {
    fontSize: 13,
    fontWeight: '700',
  },
  overviewProgressBarTrack: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  overviewProgressBarFill: {
    height: '100%',
    borderRadius: 4,
  },

  /* EXPANDED DETAILED LEDGER CARD STYLING */
  detailCard: {
    padding: 20,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  ccHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ccRightWidgets: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  ccTypeLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  ccEmailText: {
    fontSize: 12,
    color: UI_COLORS.textMuted,
    marginTop: 3,
  },
  ccHolderNameCompact: {
    fontSize: 20,
    fontWeight: '700',
    color: UI_COLORS.textMain,
    marginTop: 3,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  metricBadge: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  ccMiniLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  ccMiniValue: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },

  backButton: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, marginTop: 4 },
  backButtonText: { fontSize: 13, fontWeight: '600', color: UI_COLORS.textMuted },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: UI_COLORS.textMuted, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 },
  expenseListItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: UI_COLORS.surface, padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: UI_COLORS.border },
  expenseItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 },
  iconCircle: { width: 32, height: 32, borderRadius: 8, backgroundColor: UI_COLORS.bg, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: UI_COLORS.border },
  expenseItemName: { fontSize: 13, fontWeight: '600', color: UI_COLORS.textMain },
  expenseItemCategory: { fontSize: 11, color: UI_COLORS.textMuted, marginTop: 1 },
  expenseItemAmount: { fontSize: 13, fontWeight: '700', color: '#C5221F' },
  emptySpendersBlock: { flex: 0.8, justifyContent: 'center', alignItems: 'center' },
  emptyIconWrapper: { width: 56, height: 56, borderRadius: 16, backgroundColor: UI_COLORS.surface, justifyContent: 'center', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: UI_COLORS.border },
  emptySpendersText: { fontSize: 14, fontWeight: '600', color: UI_COLORS.textMain },
  emptyExpensesBlock: { flex: 0.3, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  emptyExpensesText: { fontSize: 13, fontWeight: '600', color: UI_COLORS.textMuted },
  emptySubtext: { fontSize: 12, color: UI_COLORS.textMuted, textAlign: 'center', marginTop: 4, paddingHorizontal: 32, lineHeight: 16 },
});