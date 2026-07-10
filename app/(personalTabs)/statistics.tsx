// app/(spenderTabs)/statistics.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StatusBar as NativeStatusBar,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { Circle, Path, Svg } from 'react-native-svg';
import { supabase } from '../../lib/supabase';

interface TransactionItem {
  id: string;
  amount: number;
  description: string;
  spent_at: string;
  budgets: {
    categories: {
      name: string;
      icon: string;
      color: string;
    } | null;
  } | null;
}

type FilterPeriod = 'Day' | 'Week' | 'Month' | 'Year';

export default function StatisticsScreen() {
  const router = useRouter();
  const [period, setPeriod] = useState<FilterPeriod>('Week');
  const [loading, setLoading] = useState(true);
  const [totalSpendings, setTotalSpendings] = useState(0);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);

  const fetchStatisticsData = useCallback(async (selectedPeriod: FilterPeriod) => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let dateLimit = new Date();
      // I-reset ang oras ngadto sa pinakasugod sa adlaw (12:00 AM / 00:00:00)
      dateLimit.setHours(0, 0, 0, 0);

      if (selectedPeriod === 'Day') {
        // Sugod karong adlawa ra gyud. Walay minusan nga adlaw aron dili maapil ang kagahapon.
      } else if (selectedPeriod === 'Week') {
        // Sugod sa adlaw nga DOMINGGO niining kasamtangan nga semana
        const currentDay = dateLimit.getDay(); // 0 = Sunday, 1 = Monday, etc.
        dateLimit.setDate(dateLimit.getDate() - currentDay);
      } else if (selectedPeriod === 'Month') {
        // Sugod sa Unang Adlaw (Day 1) niining bulana ra gyud
        dateLimit.setDate(1);
      } else if (selectedPeriod === 'Year') {
        // Sugod sa Enero 1 niining kasamtangan nga tuig
        dateLimit.setMonth(0);
        dateLimit.setDate(1);
      }

      const { data, error } = await supabase
        .from('expenses')
        .select(`
          id,
          amount,
          description,
          spent_at,
          budgets (
            categories (
              name,
              icon,
              color
            )
          )
        `)
        .gte('spent_at', dateLimit.toISOString())
        .order('spent_at', { ascending: false });

      if (error) throw error;

      const validExpenses = (data || []) as unknown as TransactionItem[];
      setTransactions(validExpenses);

      const total = validExpenses.reduce((sum, item) => sum + item.amount, 0);
      setTotalSpendings(total);
    } catch (error: any) {
      console.error('Fetch Statistics Error:', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatisticsData(period);
  }, [period, fetchStatisticsData]);

  const formatTransactionDate = (dateString: string) => {
    const tDate = new Date(dateString);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (tDate.toDateString() === today.toDateString()) return 'TODAY';
    if (tDate.toDateString() === yesterday.toDateString()) return 'YESTERDAY';
    
    return tDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
  };

  const chartPaths = {
    Day: {
      pathData: "M0,95 Q40,115 100,80 T150,55 T260,85 T400,65",
      activeColor: "#A3E635", 
      circleCX: 150,
      circleCY: 55,
      tooltipLeft: "23%", 
      dateLeft: "JULY 15",
      dateRight: "JULY 16",
      labelDate: "July 16",
      trendText: "vs yesterday"
    },
    Week: {
      pathData: "M0,75 Q50,110 110,60 T180,42 T275,70 T400,55",
      activeColor: "#38BDF8", 
      circleCX: 180,
      circleCY: 42,
      tooltipLeft: "30%",
      dateLeft: "WEEK 1",
      dateRight: "WEEK 2",
      labelDate: "this week",
      trendText: "vs last week"
    },
    Month: {
      pathData: "M0,65 Q60,95 120,50 T210,32 T290,60 T400,45",
      activeColor: "#FB923C", 
      circleCX: 210,
      circleCY: 32,
      tooltipLeft: "38%",
      dateLeft: "JUN",
      dateRight: "JUL",
      labelDate: "July",
      trendText: "vs last month"
    },
    Year: {
      pathData: "M0,85 Q45,105 115,70 T240,28 T310,75 T400,50",
      activeColor: "#E879F9", 
      circleCX: 240,
      circleCY: 28,
      tooltipLeft: "45%",
      dateLeft: "2025",
      dateRight: "2026",
      labelDate: "2026",
      trendText: "vs last year"
    },
  };

  const currentActive = chartPaths[period];
  const simulatedAmount = (totalSpendings * 0.12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Header Row */}
      <View style={styles.headerContainer}>
        <TouchableOpacity 
          onPress={() => router.replace('/(personalTabs)/budget')} 
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Statistics</Text>
        <View style={styles.headerPlaceholder} /> 
      </View>

      {/* Period Filter Tabs */}
      <View style={styles.tabContainer}>
        {(['Day', 'Week', 'Month', 'Year'] as FilterPeriod[]).map((p) => (
          <TouchableOpacity
            key={p}
            onPress={() => setPeriod(p)}
            style={[
              styles.tabButton, 
              period === p && { backgroundColor: chartPaths[p].activeColor }
            ]}
          >
            <Text style={[styles.tabText, period === p && styles.activeTabText]}>
              {p}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* TOTAL SPENDINGS CONTAINER */}
      <View style={styles.spendingContainer}>
        <Text style={styles.spendingLabel}>TOTAL SPENDINGS</Text>
        <Text style={styles.spendingAmount}>
          ₱{totalSpendings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
        <View style={styles.trendBadge}>
          <Ionicons name="trending-up" size={12} color="#EF4444" />
          <Text style={styles.trendText}>+12.4% {currentActive.trendText}</Text>
        </View>
      </View>

      {/* Curved Graph Simulation Section */}
      <View style={styles.graphSectionWrapper}>
        <View style={styles.chartContainer}>
          <Svg height="120" width="100%">
            <Path d={chartPaths.Day.pathData} fill="none" stroke={period === 'Day' ? chartPaths.Day.activeColor : '#164E63'} strokeWidth={period === 'Day' ? "3.5" : "2"} strokeOpacity={period === 'Day' ? 1 : 0.2} />
            <Path d={chartPaths.Week.pathData} fill="none" stroke={period === 'Week' ? chartPaths.Week.activeColor : '#164E63'} strokeWidth={period === 'Week' ? "3.5" : "2"} strokeOpacity={period === 'Week' ? 1 : 0.2} />
            <Path d={chartPaths.Month.pathData} fill="none" stroke={period === 'Month' ? chartPaths.Month.activeColor : '#164E63'} strokeWidth={period === 'Month' ? "3.5" : "2"} strokeOpacity={period === 'Month' ? 1 : 0.2} />
            <Path d={chartPaths.Year.pathData} fill="none" stroke={period === 'Year' ? chartPaths.Year.activeColor : '#164E63'} strokeWidth={period === 'Year' ? "3.5" : "2"} strokeOpacity={period === 'Year' ? 1 : 0.2} />
            
            <Circle cx={currentActive.circleCX} cy={currentActive.circleCY} r="11" fill="none" stroke={currentActive.activeColor} strokeWidth="3.5" />
            <Circle cx={currentActive.circleCX} cy={currentActive.circleCY} r="5.5" fill="#FFFFFF" />
          </Svg>
          
          <View style={[styles.tooltipContainer, { left: currentActive.tooltipLeft }]}>
            <View style={[styles.tooltipArrow, { borderBottomColor: currentActive.activeColor }]} />
            
            <View style={[styles.tooltipBubble, { backgroundColor: currentActive.activeColor }]}>
              <Text style={styles.tooltipAmountText}>₱{simulatedAmount}</Text>
            </View>
            
            <Text style={styles.transactionMetaText}>
              Transaction Amount:{'\n'}
              <Text style={styles.transactionMetaSubText}>₱{simulatedAmount} on {currentActive.labelDate}</Text>
            </Text>
          </View>
        </View>

        {/* X-AXIS TIMESTAMPS */}
        <View style={styles.xAxisContainer}>
          <View style={styles.xAxisLabelGroup}>
            <Text style={styles.xAxisLabelTop}>{currentActive.dateLeft.split(' ')[0]}</Text>
            <Text style={styles.xAxisLabelBottom}>{currentActive.dateLeft.split(' ')[1] || '15'}</Text>
          </View>
          <View style={[styles.xAxisLabelGroup, { alignItems: 'flex-end' }]}>
            <Text style={styles.xAxisLabelTop}>{currentActive.dateRight.split(' ')[0]}</Text>
            <Text style={styles.xAxisLabelBottom}>{currentActive.dateRight.split(' ')[1] || '16'}</Text>
          </View>
        </View>
      </View>

      {/* Transaction History Bottom Sheet */}
      <View style={styles.historyContainer}>
        <View style={styles.dragIndicator} />
        
        <View style={styles.historyHeaderRow}>
          <Text style={styles.historyTitle}>Transaction History</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/(personalTabs)/transaction')}>
            <Text style={styles.viewAllText}>View all {'>'}</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color="#0F172A" style={{ marginTop: 30 }} />
        ) : transactions.length === 0 ? (
          <Text style={styles.emptyText}>No transactions logged for this duration.</Text>
        ) : (
          <FlatList
            data={transactions}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
            renderItem={({ item }) => {
              const category = item.budgets?.categories;
              return (
                <View style={styles.transactionCard}>
                  <View style={styles.leftRow}>
                    <View style={[styles.avatarIcon, { backgroundColor: category?.color ? `${category.color}15` : '#F1F5F9' }]}>
                      <Ionicons name={(category?.icon as any) || 'document-text-outline'} size={18} color={category?.color || '#64748B'} />
                    </View>
                    <View style={styles.textMetadata}>
                      <Text style={styles.itemName} numberOfLines={1}>{item.description}</Text>
                      <Text style={styles.itemTime}>{formatTransactionDate(item.spent_at)}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.rightRow}>
                    <Text style={styles.itemAmount}>-₱{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                    <Text style={styles.itemCategoryName}>{category?.name || 'Expense'}</Text>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#061F1A',
    paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0 
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backButton: { padding: 6, marginLeft: -6 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', textAlign: 'center', letterSpacing: -0.3 },
  headerPlaceholder: { width: 32 },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 24,
    borderRadius: 24,
    padding: 4,
    marginTop: 8,
  },
  tabButton: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 20 },
  tabText: { color: 'rgba(255,255,255,0.4)', fontWeight: '600', fontSize: 13 },
  activeTabText: { color: '#061F1A', fontWeight: '700' },
  spendingContainer: { 
    alignItems: 'center', 
    marginTop: 20, 
    marginBottom: 4,
    paddingHorizontal: 24
  },
  spendingLabel: { 
    color: 'rgba(255,255,255,0.4)', 
    fontSize: 11, 
    fontWeight: '700',
    letterSpacing: 1 
  },
  spendingAmount: { 
    color: '#FFFFFF', 
    fontSize: 32, 
    fontWeight: '800', 
    marginTop: 4, 
    letterSpacing: -0.8 
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)', 
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 6,
    gap: 4
  },
  trendText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '600'
  },
  graphSectionWrapper: {
    marginVertical: 10,
    position: 'relative'
  },
  chartContainer: { 
    height: 185, 
    width: '100%', 
    paddingHorizontal: 10, 
    position: 'relative',
  },
  tooltipContainer: {
    position: 'absolute',
    top: 65, 
    alignItems: 'center',
    width: 150,
  },
  tooltipArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 6,
    borderStyle: 'solid',
    backgroundColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  tooltipBubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 110,
  },
  tooltipAmountText: { color: '#061F1A', fontSize: 16, fontWeight: '700' },
  transactionMetaText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 13,
    fontWeight: '500'
  },
  transactionMetaSubText: {
    color: '#FFFFFF',
    fontWeight: '600'
  },
  xAxisContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginTop: -15,
    marginBottom: 8
  },
  xAxisLabelGroup: { flexDirection: 'column' },
  xAxisLabelTop: { color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  xAxisLabelBottom: { color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '600', marginTop: 2, textAlign: 'center' },
  historyContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  historyHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  historyTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  viewAllText: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  emptyText: { color: '#94A3B8', textAlign: 'center', marginTop: 30, fontSize: 13 },
  transactionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  leftRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 0.7 },
  avatarIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  textMetadata: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  itemTime: { fontSize: 11, color: '#94A3B8', fontWeight: '500', marginTop: 2 },
  rightRow: { alignItems: 'flex-end', flex: 0.3 },
  itemAmount: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  itemCategoryName: { fontSize: 11, color: '#94A3B8', marginTop: 2, fontWeight: '400' },
});