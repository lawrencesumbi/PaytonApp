// app/(sponsorTabs)/monitoring.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StatusBar as NativeStatusBar,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../../lib/supabase';

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
  const [filteredSpenders, setFilteredSpenders] = useState<SpenderMonitoringInfo[]>([]);
  const [searchSpenderQuery, setSearchSpenderQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'inactive'>('active');

  const [selectedSpender, setSelectedSpender] = useState<SpenderMonitoringInfo | null>(null);
  const [expenses, setExpenses] = useState<ExpenseHistoryItem[]>([]);
  const [filteredExpenses, setFilteredExpenses] = useState<ExpenseHistoryItem[]>([]);
  const [searchExpenseQuery, setSearchExpenseQuery] = useState('');

  const [loadingSpenders, setLoadingSpenders] = useState(true);
  const [loadingExpenses, setLoadingExpenses] = useState(false);

  // 1. FETCH MASTER LIST OF SPENDERS WITH ALLOWANCE-SPECIFIC TOTALS
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
        setFilteredSpenders([]);
        return;
      }

      const spenderIds = allowancesData
        .map((a: any) => a.spender_id)
        .filter(Boolean);

      let budgetsMap: Record<string, any[]> = {};

      if (spenderIds.length > 0) {
        // Query budgets and fetch allowance_id together with expenses
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
      const formattedSpenders: SpenderMonitoringInfo[] = allowancesData.map((allowance: any) => {
        const userBudgets = budgetsMap[allowance.spender_id] || [];

        let totalAllocated = 0;
        let totalSpent = 0;

        userBudgets.forEach((budget: any) => {
          const expensesList = budget.expenses || [];

          // Only accumulate expenses linked to THIS allowance instance
          const allowanceExpenses = expensesList.filter(
            (exp: any) => exp.allowance_id === allowance.id
          );

          const budgetSpent = allowanceExpenses.reduce(
            (sum: number, exp: any) => sum + Number(exp.amount || 0),
            0
          );

          totalSpent += budgetSpent;

          // If budget allocation needs to be counted only when there are transactions/linkage
          if (allowanceExpenses.length > 0) {
            totalAllocated += Number(budget.allocated_amount || 0);
          }
        });

        const startDate = allowance.start_date;
        const endDate = allowance.end_date;
        const isActive = Boolean(
          startDate && endDate && startDate <= today && endDate >= today
        );

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
          start_date: startDate,
          end_date: endDate,
          is_active: isActive
        };
      });

      formattedSpenders.sort((a, b) => {
        const dateA = new Date(a.start_date || 0).getTime();
        const dateB = new Date(b.start_date || 0).getTime();
        return dateB - dateA;
      });

      setSpenders(formattedSpenders);
      filterSpenders(searchSpenderQuery, activeTab, formattedSpenders);
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
        // Suppress error if no inner expenses match
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
      filterExpenses(searchExpenseQuery, allExpenses);
    } catch (error: any) {
      console.error("Fetch Spender Expenses Error:", error.message);
    } finally {
      setLoadingExpenses(false);
    }
  };

  useEffect(() => {
    fetchMonitoredSpenders();
  }, []);

  const handleTabChange = (tab: 'active' | 'inactive') => {
    setActiveTab(tab);
    filterSpenders(searchSpenderQuery, tab, spenders);
  };

  const handleSpenderSearch = (text: string) => {
    setSearchSpenderQuery(text);
    filterSpenders(text, activeTab, spenders);
  };

  const filterSpenders = (query: string, tab: 'active' | 'inactive', list: SpenderMonitoringInfo[]) => {
    let result = list.filter(item => (tab === 'active' ? item.is_active : !item.is_active));

    if (query.trim()) {
      const lower = query.toLowerCase();
      result = result.filter(spender =>
        spender.full_name.toLowerCase().includes(lower) ||
        spender.email.toLowerCase().includes(lower)
      );
    }

    setFilteredSpenders(result);
  };

  const handleExpenseSearch = (text: string) => {
    setSearchExpenseQuery(text);
    filterExpenses(text, expenses);
  };

  const filterExpenses = (query: string, list: ExpenseHistoryItem[]) => {
    if (!query.trim()) {
      setFilteredExpenses(list);
    } else {
      const lower = query.toLowerCase();
      const filtered = list.filter(exp =>
        exp.description.toLowerCase().includes(lower) ||
        exp.category_name.toLowerCase().includes(lower)
      );
      setFilteredExpenses(filtered);
    }
  };

  const handleSelectSpender = (spender: SpenderMonitoringInfo) => {
    setSelectedSpender(spender);
    setSearchExpenseQuery('');
    fetchSpenderExpenses(spender.id, spender.allowance_id);
  };

  const handleBackToList = () => {
    setSelectedSpender(null);
    setExpenses([]);
    setFilteredExpenses([]);
    setSearchExpenseQuery('');
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>

        {/* VIEW 1: DRILLDOWN TRANSACTION LEDGER */}
        {selectedSpender ? (
          <View style={{ flex: 1 }}>
            <TouchableOpacity style={styles.backButton} onPress={handleBackToList}>
              <Ionicons name="arrow-back" size={18} color="#1E293B" />
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>

            <LinearGradient
              colors={selectedSpender.is_active ? ['#065F46', '#022C22'] : ['#475569', '#1E293B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.creditCardDetail}
            >
              <View style={styles.ccHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ccTypeLabel}>
                    {selectedSpender.allowance_name.toUpperCase()} {!selectedSpender.is_active && '(INACTIVE)'}
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
                    <View style={styles.avatarPlaceholder}>
                      <Ionicons name="person" size={20} color={selectedSpender.is_active ? '#047857' : '#475569'} />
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.ccFooterCompact}>
                <View style={styles.ccMiniMetricsRow}>
                  <View style={{ alignItems: 'flex-start' }}>
                    <Text style={styles.ccMiniLabel}>ALLOWANCE</Text>
                    <Text style={styles.ccMiniValue}>₱{selectedSpender.total_allowance.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-start' }}>
                    <Text style={styles.ccMiniLabel}>UNALLOCATED</Text>
                    <Text style={styles.ccMiniValue}>₱{(selectedSpender.total_allowance - selectedSpender.total_allocated).toLocaleString('en-US', { minimumFractionDigits: 0 })}</Text>
                  </View>
                </View>
                <View style={styles.ccMiniMetricsRow}>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.ccMiniLabel}>ALLOCATED</Text>
                    <Text style={[styles.ccMiniValue, { color: '#FCD34D' }]}>
                      ₱{(selectedSpender.total_allocated - selectedSpender.total_spent).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.ccMiniLabel}>SPENT</Text>
                    <Text style={[styles.ccMiniValue, { color: '#FCA5A5' }]}>₱{selectedSpender.total_spent.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
                  </View>
                </View>
              </View>
            </LinearGradient>

            <Text style={styles.sectionTitle}>Recent Transactions</Text>

            <View style={styles.searchContainer}>
              <Ionicons name="search-outline" size={16} color="#64748B" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search transaction description or category..."
                placeholderTextColor="#94A3B8"
                value={searchExpenseQuery}
                onChangeText={handleExpenseSearch}
              />
              {searchExpenseQuery.length > 0 && (
                <TouchableOpacity onPress={() => handleExpenseSearch('')} style={styles.clearButton}>
                  <Ionicons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {loadingExpenses ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="small" color="#0F172A" />
              </View>
            ) : filteredExpenses.length === 0 ? (
              <View style={styles.emptyExpensesBlock}>
                <View style={styles.emptyIconWrapper}>
                  <Ionicons name="receipt-outline" size={32} color="#94A3B8" />
                </View>
                <Text style={styles.emptyExpensesText}>
                  {searchExpenseQuery ? "No matching transactions" : "No recorded transactions found."}
                </Text>
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
                        <Ionicons name={getCategoryIcon(item.category_name)} size={16} color="#475569" />
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

            {/* TAB SELECTOR: ACTIVE VS INACTIVE */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'active' && styles.activeTabButton]}
                onPress={() => handleTabChange('active')}
              >
                <Text style={[styles.tabText, activeTab === 'active' && styles.activeTabText]}>
                  Active
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'inactive' && styles.activeTabButton]}
                onPress={() => handleTabChange('inactive')}
              >
                <Text style={[styles.tabText, activeTab === 'inactive' && styles.activeTabText]}>
                  Inactive
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Ionicons name="search-outline" size={18} color="#64748B" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search spender by name or email..."
                placeholderTextColor="#94A3B8"
                value={searchSpenderQuery}
                onChangeText={handleSpenderSearch}
              />
              {searchSpenderQuery.length > 0 && (
                <TouchableOpacity onPress={() => handleSpenderSearch('')} style={styles.clearButton}>
                  <Ionicons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {loadingSpenders ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="small" color="#0F172A" />
              </View>
            ) : filteredSpenders.length === 0 ? (
              <View style={styles.emptySpendersBlock}>
                <View style={styles.emptyIconWrapper}>
                  <Ionicons name="analytics-outline" size={32} color="#94A3B8" />
                </View>
                <Text style={styles.emptySpendersText}>
                  {searchSpenderQuery ? "No results found" : `No ${activeTab} allowances`}
                </Text>
                <Text style={styles.emptySubtext}>
                  {searchSpenderQuery
                    ? "Try checking the spelling or use a different keyword."
                    : activeTab === 'active'
                    ? "There are currently no active allowances for your spenders."
                    : "No past or outside-period allowances recorded."}
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredSpenders}
                keyExtractor={(item) => item.allowance_id || item.id}
                refreshing={loadingSpenders}
                showsVerticalScrollIndicator={false}
                onRefresh={() => fetchMonitoredSpenders(true)}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => {
                  const remainingAmount = Math.max(0, item.total_allowance - item.total_spent);
                  const remainingPercentage = item.total_allowance > 0
                    ? Math.min(Math.max((remainingAmount / item.total_allowance) * 100, 0), 100)
                    : 0;

                  const cardGradient = item.is_active
                    ? ['#047857', '#064E3B']
                    : ['#475569', '#1E293B'];

                  return (
                    <TouchableOpacity onPress={() => handleSelectSpender(item)}>
                      <LinearGradient
                        colors={cardGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.creditCardOverview}
                      >
                        <View style={styles.ccHeaderRow}>
                          <View style={{ flex: 1, marginRight: 12 }}>
                            <Text style={styles.ccTypeLabel}>
                              {item.allowance_name.toUpperCase()} {!item.is_active && '(INACTIVE)'}
                            </Text>
                            <Text style={styles.ccHolderName}>{item.full_name}</Text>
                            <Text style={styles.ccEmailText}>
                              {formatAllowancePeriod(item.start_date, item.end_date)}
                            </Text>
                          </View>

                          <View style={styles.progressContainer}>
                            <Text style={styles.progressText}>
                              ₱{remainingAmount.toLocaleString('en-US')} / ₱{item.total_allowance.toLocaleString('en-US')}
                            </Text>
                            <View style={styles.progressBarTrack}>
                              <View
                                style={[
                                  styles.progressBarFill,
                                  {
                                    width: `${remainingPercentage}%`,
                                    backgroundColor: remainingPercentage <= 15 ? '#F87171' : '#34D399'
                                  }
                                ]}
                              />
                            </View>
                          </View>
                        </View>
                      </LinearGradient>
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
  container: { flex: 1, backgroundColor: '#FAFBFD', paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0 },
  content: { flex: 1, paddingHorizontal: 20 },
  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 40 },
  listContent: { paddingBottom: 110 },
  mainTitle: { fontSize: 24, fontWeight: '700', color: '#1E293B', marginTop: 12 },
  mainSubtitle: { fontSize: 13, color: '#64748B', marginTop: 4, marginBottom: 12, lineHeight: 18 },

  /* TAB STYLES */
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  activeTabButton: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  activeTabText: {
    color: '#0F172A',
    fontWeight: '700',
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#1E293B', height: '100%' },
  clearButton: { padding: 4 },

  creditCardOverview: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  creditCardDetail: {
    padding: 18,
    borderRadius: 18,
    marginBottom: 16,
    shadowColor: '#022C22',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  ccHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ccRightWidgets: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  progressContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 110,
  },
  progressText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A7F3D0',
    marginBottom: 6,
  },
  progressBarTrack: {
    width: 110,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#34D399',
    borderRadius: 3,
  },

  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#A7F3D0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  ccTypeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#34D399',
    letterSpacing: 1.2,
  },
  ccEmailText: {
    fontSize: 11,
    color: '#A7F3D0',
    marginTop: 2,
    opacity: 0.9,
  },
  ccHolderName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  ccHolderNameCompact: {
    fontSize: 19,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  ccFooterCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: 16,
    gap: 12
  },
  ccMiniMetricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  ccMiniLabel: {
    fontSize: 8,
    color: '#A7F3D0',
    fontWeight: '600',
    letterSpacing: 0.5
  },
  ccMiniValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 1
  },

  backButton: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, marginTop: 8 },
  backButtonText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  sectionTitle: { fontSize: 11, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 8, paddingLeft: 2 },
  expenseListItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 12, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  expenseItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 8 },
  iconCircle: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
  expenseItemName: { fontSize: 13, fontWeight: '600', color: '#1E293B' },
  expenseItemCategory: { fontSize: 11, color: '#64748B', marginTop: 1 },
  expenseItemAmount: { fontSize: 13, fontWeight: '700', color: '#EF4444' },
  emptySpendersBlock: { flex: 0.8, justifyContent: 'center', alignItems: 'center' },
  emptyIconWrapper: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptySpendersText: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  emptyExpensesBlock: { flex: 0.3, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  emptyExpensesText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  emptySubtext: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 4, paddingHorizontal: 32, lineHeight: 18 },
});