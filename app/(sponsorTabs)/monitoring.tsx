// app/(sponsorTabs)/monitoring.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
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
  active_allowance_id: string | null;
  allowance_name: string;
  total_allowance: number;
  total_allocated: number;
  total_spent: number;
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
  
  const [selectedSpender, setSelectedSpender] = useState<SpenderMonitoringInfo | null>(null);
  const [expenses, setExpenses] = useState<ExpenseHistoryItem[]>([]);
  const [filteredExpenses, setFilteredExpenses] = useState<ExpenseHistoryItem[]>([]);
  const [searchExpenseQuery, setSearchExpenseQuery] = useState('');
  
  const [loadingSpenders, setLoadingSpenders] = useState(true);
  const [loadingExpenses, setLoadingExpenses] = useState(false);

  // 1. FETCH MASTER LIST OF SPENDERS
  const fetchMonitoredSpenders = async (showLoadingIndicator = true) => {
    try {
      if (showLoadingIndicator) setLoadingSpenders(true);
      const { data: { user: currentSponsor } } = await supabase.auth.getUser();
      if (!currentSponsor) return;

      const { data: allowancesData, error: allowanceError } = await supabase
        .from('allowances')
        .select(`
          id,
          allowance_name,
          amount,
          spender_id,
          profiles!spender_id (
            full_name,
            email
          )
        `)
        .eq('sponsor_id', currentSponsor.id);

      if (allowanceError) throw allowanceError;

      if (!allowancesData || allowancesData.length === 0) {
        setSpenders([]);
        setFilteredSpenders([]);
        return;
      }

      const formattedSpenders: SpenderMonitoringInfo[] = await Promise.all(
        allowancesData.map(async (allowance: any) => {
          const { data: budgetsData } = await supabase
            .from('budgets')
            .select(`
              id, 
              allocated_amount,
              expenses (
                amount
              )
            `)
            .eq('user_id', allowance.spender_id);
            
          const userBudgets = budgetsData || [];
          const totalAllocated = userBudgets.reduce((sum, b) => sum + Number(b.allocated_amount || 0), 0);
          
          let totalSpent = 0;
          userBudgets.forEach((budget: any) => {
            const expensesList = budget.expenses || [];
            totalSpent += expensesList.reduce((sum: number, exp: any) => sum + Number(exp.amount || 0), 0);
          });

          return {
            id: allowance.spender_id,
            full_name: allowance.profiles?.full_name || 'Spender User',
            email: allowance.profiles?.email || 'No Email Registered',
            active_allowance_id: allowance.id,
            allowance_name: allowance.allowance_name || 'Active Allowance',
            total_allowance: Number(allowance.amount || 0),
            total_allocated: totalAllocated,
            total_spent: totalSpent
          };
        })
      );

      setSpenders(formattedSpenders);
      filterSpenders(searchSpenderQuery, formattedSpenders);
    } catch (error: any) {
      console.error("Fetch Monitored Spenders Error:", error.message);
    } finally {
      setLoadingSpenders(false);
    }
  };

  // 2. FETCH SPECIFIC TRANSACTIONS
  const fetchSpenderExpenses = async (spenderId: string) => {
    try {
      setLoadingExpenses(true);
      
      const { data: categoriesData } = await supabase
        .from('categories')
        .select('id, name');

      const categoryMap: { [key: string]: string } = {};
      (categoriesData || []).forEach(cat => {
        categoryMap[cat.id] = cat.name || 'Food & Dining';
      });

      const { data: budgetsData, error: budgetError } = await supabase
        .from('budgets')
        .select(`
          id,
          category_id,
          expenses (
            id,
            description,
            amount,
            spent_at
          )
        `)
        .eq('user_id', spenderId);

      if (budgetError) throw budgetError;

      const allExpenses: ExpenseHistoryItem[] = [];

      (budgetsData || []).forEach((budget: any) => {
        const catId = budget.category_id;
        const expensesList = budget.expenses || [];
        
        expensesList.forEach((exp: any) => {
          allExpenses.push({
            id: exp.id,
            description: exp.description || 'No Description',
            amount: Number(exp.amount),
            spent_at: exp.spent_at || new Date().toISOString(),
            category_name: categoryMap[catId] || 'Food & Dining'
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

  // Search Spenders Logic
  const handleSpenderSearch = (text: string) => {
    setSearchSpenderQuery(text);
    filterSpenders(text, spenders);
  };

  const filterSpenders = (query: string, list: SpenderMonitoringInfo[]) => {
    if (!query.trim()) {
      setFilteredSpenders(list);
    } else {
      const filtered = list.filter(spender => 
        spender.full_name.toLowerCase().includes(query.toLowerCase()) ||
        spender.email.toLowerCase().includes(query.toLowerCase())
      );
      setFilteredSpenders(filtered);
    }
  };

  // Search Expenses/Transactions Logic
  const handleExpenseSearch = (text: string) => {
    setSearchExpenseQuery(text);
    filterExpenses(text, expenses);
  };

  const filterExpenses = (query: string, list: ExpenseHistoryItem[]) => {
    if (!query.trim()) {
      setFilteredExpenses(list);
    } else {
      const filtered = list.filter(exp => 
        exp.description.toLowerCase().includes(query.toLowerCase()) ||
        exp.category_name.toLowerCase().includes(query.toLowerCase())
      );
      setFilteredExpenses(filtered);
    }
  };

  const handleSelectSpender = (spender: SpenderMonitoringInfo) => {
    setSelectedSpender(spender);
    setSearchExpenseQuery(''); // reset search input kung magbalhin og spender
    fetchSpenderExpenses(spender.id);
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        
        {/* VIEW 1: DRILLDOWN TRANSACTION LEDGER */}
        {selectedSpender ? (
          <View style={{ flex: 1 }}>
            <TouchableOpacity style={styles.backButton} onPress={handleBackToList}>
              <Ionicons name="arrow-back" size={18} color="#1E293B" />
              <Text style={styles.backButtonText}>Back to Dashboard</Text>
            </TouchableOpacity>

            {/* COMPACT GRADIENT GREEN DETAIL CARD */}
            <LinearGradient 
              colors={['#065F46', '#022C22']} 
              start={{ x: 0, y: 0 }} 
              end={{ x: 1, y: 1 }} 
              style={styles.creditCardDetail}
            >
              {/* Gi-tapad ang Details, Chip, ug Wifi Icon para makadaginot sa space */}
              <View style={styles.ccHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ccTypeLabel}>{selectedSpender.allowance_name.toUpperCase()}</Text>
                  <Text style={styles.ccHolderNameCompact}>{selectedSpender.full_name}</Text>
                  <Text style={styles.ccEmailText}>{selectedSpender.email}</Text>
                </View>
                <View style={styles.ccRightWidgets}>
                  <View style={styles.ccChip} />
                  <Ionicons name="wifi" size={18} color="rgba(255,255,255,0.5)" style={{ transform: [{ rotate: '90deg' }] }} />
                </View>
              </View>

              <View style={styles.ccBalanceContainerCompact}>
                <Text style={styles.ccBalanceLabel}>REMAINING BALANCE</Text>
                <Text style={styles.ccBalanceValue}>
                  ₱{(selectedSpender.total_allowance - selectedSpender.total_allocated).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Text>
              </View>

              <View style={styles.ccFooterCompact}>
                <View style={{ alignItems: 'flex-start' }}>
                  <Text style={styles.ccMiniLabel}>TOTAL ALLOWANCE</Text>
                  <Text style={styles.ccMiniValue}>₱{selectedSpender.total_allowance.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
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

            {/* TRANSACTIONS SEARCH BAR */}
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
                onRefresh={() => fetchSpenderExpenses(selectedSpender.id)}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <View style={styles.expenseListItem}>
                    <View style={styles.expenseItemLeft}>
                      <View style={styles.iconCircle}>
                        <Ionicons name={getCategoryIcon(item.category_name)} size={16} color="#475569" />
                      </View>
                      <View>
                        <Text style={styles.expenseItemName}>{item.description}</Text> 
                        <Text style={styles.expenseItemCategory}>{item.category_name}</Text>
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

            {/* SPENDER SEARCH BAR */}
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
                  {searchSpenderQuery ? "No results found" : "No Monitored Allowances"}
                </Text>
                <Text style={styles.emptySubtext}>
                  {searchSpenderQuery ? "Try checking the spelling or use a different keyword." : "Monitor your Spender's Expenses in real time."}
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredSpenders}
                keyExtractor={(item) => item.id}
                refreshing={loadingSpenders}
                showsVerticalScrollIndicator={false}
                onRefresh={() => fetchMonitoredSpenders(true)}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => {
                  const remaining = item.total_allowance - item.total_allocated;
                  return (
                    <TouchableOpacity onPress={() => handleSelectSpender(item)}>
                      {/* COMPACT OVERVIEW GRADIENT CARD */}
                      <LinearGradient 
                        colors={['#047857', '#064E3B']} 
                        start={{ x: 0, y: 0 }} 
                        end={{ x: 1, y: 1 }} 
                        style={styles.creditCardOverview}
                      >
                        <View style={styles.ccHeaderRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.ccTypeLabel}>{item.allowance_name.toUpperCase()}</Text>
                            <Text style={styles.ccHolderName}>{item.full_name}</Text>
                          </View>
                          <View style={styles.ccRightWidgets}>
                            <View style={[styles.ccChip, { width: 32, height: 24 }]} />
                            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
                          </View>
                        </View>

                        <View style={styles.ccMetricsContainerCompact}>
                          <View>
                            <Text style={styles.ccLabelText}>REMAINING BALANCE</Text>
                            <Text style={styles.ccBalanceOverviewText}>₱{remaining.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.ccLabelText}>TOTAL ALLOWANCE</Text>
                            <Text style={styles.ccAllowanceOverviewText}>₱{item.total_allowance.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
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
  mainSubtitle: { fontSize: 13, color: '#64748B', marginTop: 4, marginBottom: 16, lineHeight: 18 },
  
  // SEARCH BAR STYLES
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

  // COMPACT CARD STYLES
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
    gap: 10,
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
    marginTop: 1,
    opacity: 0.9,
  },
  ccHolderName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 2,
  },
  ccHolderNameCompact: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 1,
  },
  ccChip: {
    width: 34,
    height: 25,
    backgroundColor: '#ffd900',
    borderRadius: 5,
    opacity: 0.85,
    borderWidth: 1,
    borderColor: '#CBD5E1'
  },
  ccBalanceContainerCompact: {
    marginVertical: 12,
  },
  ccBalanceLabel: {
    fontSize: 9,
    color: '#A7F3D0',
    fontWeight: '600',
    letterSpacing: 1
  },
  ccBalanceValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#6EE7B7',
    marginTop: 2
  },
  ccMetricsContainerCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
    paddingTop: 10
  },
  ccLabelText: {
    fontSize: 9,
    color: '#A7F3D0',
    fontWeight: '600',
    letterSpacing: 0.8
  },
  ccBalanceOverviewText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6EE7B7',
    marginTop: 1
  },
  ccAllowanceOverviewText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 1
  },
  ccFooterCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
    paddingTop: 10,
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

  // COMMON UI ELEMENTS
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, marginTop: 8 },
  backButtonText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  sectionTitle: { fontSize: 11, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 8, paddingLeft: 2 },
  expenseListItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 12, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  expenseItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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