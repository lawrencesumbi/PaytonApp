import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    DimensionValue,
    StatusBar as NativeStatusBar,
    Platform,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { supabase } from '../../lib/supabase';

type TimeFrame = 'days' | 'weeks' | 'months';

interface CategoryStat {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  allocated: number;
  spent: number;
  remaining: number;
  percentageSpent: number;
  expenseCount: number;
}

interface ChartBarData {
  label: string;
  amount: number;
  percentage: number;
}

// Updated color palette based on the palette reference image
const CATEGORY_COLORS = [
  '#54C9CC', // Cyan
  '#1F4F59', // Dark Teal
  '#7EA00E', // Olive Green
  '#DCD964', // Light Yellow-Green
  '#213502', // Deep Forest Green
];

export default function StatisticsScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('weeks');

  const [totalSpent, setTotalSpent] = useState(0);
  const [chartData, setChartData] = useState<ChartBarData[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);

  const getFilterStartDate = (filter: TimeFrame): string => {
    const now = new Date();
    if (filter === 'days') {
      now.setDate(now.getDate() - 6);
    } else if (filter === 'weeks') {
      now.setDate(now.getDate() - 27);
    } else if (filter === 'months') {
      now.setMonth(now.getMonth() - 5);
      now.setDate(1);
    }
    return now.toISOString().split('T')[0];
  };

  const fetchStatistics = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const startDate = getFilterStartDate(timeFrame);

      const { data: expensesData, error: expenseError } = await supabase
        .from('expenses')
        .select(`
          id,
          amount,
          spent_at,
          budgets!inner (
            user_id,
            allocated_amount,
            categories:category_id (
              id,
              name,
              icon
            )
          )
        `)
        .eq('budgets.user_id', user.id)
        .gte('spent_at', startDate)
        .order('spent_at', { ascending: true });

      if (expenseError) throw expenseError;

      const rawExpenses = expensesData || [];
      let overallSum = 0;
      const catMap: { [key: string]: CategoryStat } = {};

      rawExpenses.forEach((exp: any) => {
        const amt = Number(exp.amount) || 0;
        overallSum += amt;

        const category = exp.budgets?.categories;
        if (category) {
          const catId = category.id;
          const allocated = Number(exp.budgets.allocated_amount) || 0;

          if (catMap[catId]) {
            catMap[catId].spent += amt;
            catMap[catId].expenseCount += 1;
          } else {
            catMap[catId] = {
              categoryId: catId,
              categoryName: category.name || 'General',
              categoryIcon: category.icon || 'folder-outline',
              allocated,
              spent: amt,
              remaining: 0,
              percentageSpent: 0,
              expenseCount: 1,
            };
          }
        }
      });

      const compiledCats: CategoryStat[] = Object.values(catMap).map((cat) => {
        const remaining = cat.allocated - cat.spent;
        return {
          ...cat,
          remaining,
          percentageSpent: cat.allocated > 0 ? Math.min(100, (cat.spent / cat.allocated) * 100) : 0,
        };
      }).sort((a, b) => b.spent - a.spent);

      setCategoryStats(compiledCats);
      setTotalSpent(overallSum);

      const aggregatedBars = buildChartBars(rawExpenses, timeFrame);
      setChartData(aggregatedBars);

    } catch (err: any) {
      console.error('Fetch Analytics Error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [timeFrame]);

  useEffect(() => {
    fetchStatistics();
  }, [fetchStatistics]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchStatistics();
  }, [fetchStatistics]);

  const buildChartBars = (expenses: any[], filter: TimeFrame): ChartBarData[] => {
    const bars: ChartBarData[] = [];
    const now = new Date();

    if (filter === 'days') {
      const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const dayStr = d.toISOString().split('T')[0];
        const dayLabel = daysOfWeek[d.getDay()];

        const total = expenses
          .filter((e) => e.spent_at?.startsWith(dayStr))
          .reduce((sum, e) => sum + Number(e.amount), 0);

        bars.push({ label: dayLabel, amount: total, percentage: 0 });
      }
    } else if (filter === 'weeks') {
      for (let i = 3; i >= 0; i--) {
        const weekEnd = new Date();
        weekEnd.setDate(now.getDate() - i * 7);
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekEnd.getDate() - 6);

        const total = expenses
          .filter((e) => {
            const date = new Date(e.spent_at);
            return date >= weekStart && date <= weekEnd;
          })
          .reduce((sum, e) => sum + Number(e.amount), 0);

        bars.push({ label: `Wk ${4 - i}`, amount: total, percentage: 0 });
      }
    } else if (filter === 'months') {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthLabel = monthNames[d.getMonth()];

        const total = expenses
          .filter((e) => {
            const expDate = new Date(e.spent_at);
            return expDate.getMonth() === d.getMonth() && expDate.getFullYear() === d.getFullYear();
          })
          .reduce((sum, e) => sum + Number(e.amount), 0);

        bars.push({ label: monthLabel, amount: total, percentage: 0 });
      }
    }

    const maxAmount = Math.max(...bars.map((b) => b.amount), 1);
    return bars.map((b) => ({
      ...b,
      percentage: Math.min(100, Math.max(12, (b.amount / maxAmount) * 100)),
    }));
  };

  const renderPieChart = () => {
    if (totalSpent === 0 || categoryStats.length === 0) return null;

    const radius = 80;
    const center = 100;
    let cumulativeAngle = 0;

    return (
      <View style={styles.pieChartContainer}>
        <Svg height="200" width="200" viewBox="0 0 200 200">
          <G rotation="-90" origin="100, 100">
            {categoryStats.map((cat, index) => {
              const sliceAngle = (cat.spent / totalSpent) * 360;
              if (sliceAngle === 0) return null;

              const startAngle = cumulativeAngle;
              const endAngle = cumulativeAngle + sliceAngle;
              cumulativeAngle += sliceAngle;

              const isFullCircle = sliceAngle >= 359.9;
              const actualEndAngle = isFullCircle ? startAngle + 359.99 : endAngle;

              const startRad = (Math.PI * startAngle) / 180;
              const endRad = (Math.PI * actualEndAngle) / 180;

              const x1 = center + radius * Math.cos(startRad);
              const y1 = center + radius * Math.sin(startRad);
              const x2 = center + radius * Math.cos(endRad);
              const y2 = center + radius * Math.sin(endRad);

              const largeArcFlag = sliceAngle > 180 ? 1 : 0;
              const pathData = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

              return (
                <Path
                  key={cat.categoryId}
                  d={pathData}
                  fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                />
              );
            })}
          </G>
        </Svg>

        <View style={styles.legendContainer}>
          {categoryStats.map((cat, index) => {
            const shareOfTotal = totalSpent > 0 ? (cat.spent / totalSpent) * 100 : 0;
            const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];

            return (
              <View key={cat.categoryId} style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={styles.legendText} numberOfLines={1}>
                  {cat.categoryName}
                </Text>
                <Text style={styles.legendPercentage}>{shareOfTotal.toFixed(1)}%</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  if (loading && categoryStats.length === 0) {
    return (
      <SafeAreaView style={[styles.container, styles.centeredContent]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="small" color="#54C9CC" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.headerBar}>
        <TouchableOpacity 
          activeOpacity={0.7} 
          onPress={() => router.push('/budget')} 
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Spending Analytics</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#54C9CC" colors={['#54C9CC']} />
        }
      >
        <View style={styles.filterSegmentContainer}>
          {(['days', 'weeks', 'months'] as TimeFrame[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              activeOpacity={0.8}
              onPress={() => setTimeFrame(tab)}
              style={[styles.filterSegmentBtn, timeFrame === tab && styles.filterSegmentBtnActive]}
            >
              <Text style={[styles.filterSegmentText, timeFrame === tab && styles.filterSegmentTextActive]}>
                {tab.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>TOTAL EXPENSES LOGGED</Text>
          <Text style={styles.summaryAmount}>
            ₱{totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>

          <View style={styles.chartContainer}>
            <View style={styles.chartBarsRow}>
              {chartData.map((bar, index) => {
                const barColor = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
                return (
                  <View key={index} style={styles.barCol}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: `${bar.percentage}%` as DimensionValue,
                            backgroundColor: bar.amount > 0 ? barColor : '#E2E8F0',
                          },
                        ]}
                      >
                        {bar.amount > 0 && (
                          <Text style={styles.insideBarText}>
                            {bar.percentage.toFixed(0)}%
                          </Text>
                        )}
                      </View>
                    </View>
                    <Text style={styles.barLabel}>{bar.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Category Spending Graph</Text>
          <Text style={styles.sectionSubtitle}>
            Distribution across {categoryStats.length} categories
          </Text>
        </View>

        {categoryStats.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="pie-chart-outline" size={40} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No Transactions Recorded</Text>
            <Text style={styles.emptySub}>
              Logged expenses in this time period will automatically populate statistics graphs here.
            </Text>
          </View>
        ) : (
          <View style={styles.pieCard}>
            {renderPieChart()}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFBFD' },
  centeredContent: { justifyContent: 'center', alignItems: 'center' },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (NativeStatusBar.currentHeight ? NativeStatusBar.currentHeight + 12 : 28) : 16,
    paddingBottom: 14,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', letterSpacing: -0.3 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  filterSegmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  filterSegmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  filterSegmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  filterSegmentText: { fontSize: 12, fontWeight: '700', color: '#64748B', letterSpacing: 0.5 },
  filterSegmentTextActive: { color: '#54C9CC' },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  summaryLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8 },
  summaryAmount: { fontSize: 30, fontWeight: '800', color: '#0F172A', letterSpacing: -0.8, marginTop: 4 },
  chartContainer: { marginTop: 24 },
  chartBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 180,
    paddingTop: 10,
  },
  barCol: { 
    flex: 1, 
    alignItems: 'center', 
    height: '100%', 
    justifyContent: 'flex-end' 
  },
  barTrack: {
    width: 32,
    height: '85%',
    backgroundColor: '#F1F5F9',
    borderRadius: 999,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: { 
    width: '100%', 
    borderRadius: 999, 
    alignItems: 'center', 
    justifyContent: 'flex-end', 
    paddingBottom: 8 
  },
  insideBarText: { 
    fontSize: 10, 
    fontWeight: '800', 
    color: '#FFFFFF' 
  },
  barLabel: { 
    fontSize: 12, 
    fontWeight: '600', 
    color: '#64748B', 
    marginTop: 8 
  },
  sectionHeader: { marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  sectionSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: '500' },
  pieCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    alignItems: 'center',
  },
  pieChartContainer: {
    width: '100%',
    alignItems: 'center',
  },
  legendContainer: {
    marginTop: 20,
    width: '100%',
    gap: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  legendText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  legendPercentage: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  emptyContainer: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  emptySub: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 20 },
});