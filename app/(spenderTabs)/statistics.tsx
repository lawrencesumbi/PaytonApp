import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { styles as splitStyles } from './split.style';

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

interface PeriodOption {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

const CATEGORY_COLORS = [
  '#54C9CC', // Cyan
  '#1F4F59', // Dark Teal
  '#7EA00E', // Olive Green
  '#DCD964', // Light Yellow-Green
  '#213502', // Deep Forest Green
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_WIDTH = 120;
const CENTER_PADDING = (SCREEN_WIDTH - ITEM_WIDTH) / 2;

export default function StatisticsScreen() {
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('months');

  const [periodOptions, setPeriodOptions] = useState<PeriodOption[]>([]);
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState<number>(0);

  const [totalSpent, setTotalSpent] = useState(0);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);

  const scrollToPeriod = useCallback((index: number, animated = true) => {
    if (index < 0) return;
    setSelectedPeriodIndex(index);
    
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({
        offset: index * ITEM_WIDTH,
        animated,
      });
    }, 50);
  }, []);

  const loadActivePeriods = useCallback(async (filter: TimeFrame) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date();
      const currentYear = now.getFullYear();

      const { data: userExpenses } = await supabase
        .from('expenses')
        .select(`
          spent_at,
          budgets!inner ( user_id )
        `)
        .eq('budgets.user_id', user.id);

      const activeDates = (userExpenses || []).map((e: any) => new Date(e.spent_at));

      let list: PeriodOption[] = [];
      let initialIndex = 0;

      if (filter === 'days') {
        const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        for (let i = 13; i >= 0; i--) {
          const d = new Date();
          d.setDate(now.getDate() - i);
          const dayStr = d.toISOString().split('T')[0];
          
          const hasData = activeDates.some(ad => ad.toISOString().split('T')[0] === dayStr);
          if (hasData || i === 0) {
            const label = i === 0 ? 'Today' : `${daysOfWeek[d.getDay()]} ${d.getDate()}`;
            list.push({ id: dayStr, label, startDate: dayStr, endDate: dayStr });
          }
        }
        initialIndex = list.length - 1;
      } else if (filter === 'weeks') {
        const currentMonth = now.getMonth();
        const currentDay = now.getDate();
        const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

        let weekCount = 1;
        let startDay = 1;

        while (startDay <= lastDayOfMonth) {
          let endDay = Math.min(startDay + 6, lastDayOfMonth);
          const startStr = new Date(currentYear, currentMonth, startDay).toISOString().split('T')[0];
          const endStr = new Date(currentYear, currentMonth, endDay).toISOString().split('T')[0];

          const isThisWeek = currentDay >= startDay && currentDay <= endDay;
          const hasData = activeDates.some(ad => {
            const dStr = ad.toISOString().split('T')[0];
            return dStr >= startStr && dStr <= endStr;
          });

          if (hasData || isThisWeek) {
            if (isThisWeek) initialIndex = list.length;
            list.push({
              id: `wk-${weekCount}`,
              label: isThisWeek ? 'This Week' : `Week ${weekCount}`,
              startDate: startStr,
              endDate: endStr,
            });
          }

          startDay += 7;
          weekCount++;
        }
      } else if (filter === 'months') {
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June', 
          'July', 'August', 'September', 'October', 'November', 'December'
        ];

        monthNames.forEach((monthLabel, idx) => {
          const firstDay = new Date(currentYear, idx, 1);
          const lastDay = new Date(currentYear, idx + 1, 0);
          const startStr = firstDay.toISOString().split('T')[0];
          const endStr = lastDay.toISOString().split('T')[0];

          const isCurrentMonth = now.getMonth() === idx;
          const hasData = activeDates.some(ad => {
            const dStr = ad.toISOString().split('T')[0];
            return dStr >= startStr && dStr <= endStr;
          });

          if (hasData || isCurrentMonth) {
            if (isCurrentMonth) initialIndex = list.length;
            list.push({
              id: `mo-${idx}`,
              label: monthLabel,
              startDate: startStr,
              endDate: endStr,
            });
          }
        });
      }

      setPeriodOptions(list);
      const safeIndex = Math.max(0, Math.min(initialIndex, list.length - 1));
      scrollToPeriod(safeIndex, false);

    } catch (err) {
      console.error('Error filtering active periods:', err);
    }
  }, [scrollToPeriod]);

  useEffect(() => {
    loadActivePeriods(timeFrame);
  }, [timeFrame, loadActivePeriods]);

  const fetchStatistics = useCallback(async () => {
    if (periodOptions.length === 0) return;

    try {
      const activePeriod = periodOptions[selectedPeriodIndex] || periodOptions[0];
      if (!activePeriod) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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
        .gte('spent_at', activePeriod.startDate)
        .lte('spent_at', activePeriod.endDate + 'T23:59:59')
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
              categoryIcon: category.icon || 'wallet-outline',
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

    } catch (err: any) {
      console.error('Fetch Analytics Error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [periodOptions, selectedPeriodIndex]);

  useEffect(() => {
    fetchStatistics();
  }, [fetchStatistics]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadActivePeriods(timeFrame);
    await fetchStatistics();
  }, [loadActivePeriods, timeFrame, fetchStatistics]);

  // Slightly adjusted size (175px)
  const renderDonutChart = () => {
    const size = 175;
    const strokeWidth = 18;
    const center = size / 2;
    const radius = center - strokeWidth;

    if (totalSpent === 0 || categoryStats.length === 0) {
      return (
        <View style={styles.donutContainer}>
          <Svg height={size} width={size} viewBox={`0 0 ${size} ${size}`}>
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke="#E2E8F0"
              strokeWidth={strokeWidth}
              fill="transparent"
            />
          </Svg>
          <View style={styles.donutCenterContent}>
            <Text style={styles.donutCenterTitle}>Total Expenses</Text>
            <Text style={styles.donutCenterAmount}>₱0</Text>
          </View>
        </View>
      );
    }

    let accumulatedAngle = 0;
    const gapAngle = categoryStats.length > 1 ? 6 : 0;

    return (
      <View style={styles.donutContainer}>
        <Svg height={size} width={size} viewBox={`0 0 ${size} ${size}`}>
          <G rotation="-90" origin={`${center}, ${center}`}>
            {categoryStats.map((cat, index) => {
              const fraction = cat.spent / totalSpent;
              const sliceAngle = fraction * 360;

              if (sliceAngle <= 0) return null;

              const effectiveAngle = Math.max(0, sliceAngle - gapAngle);
              const startAngle = accumulatedAngle + gapAngle / 2;
              const endAngle = startAngle + effectiveAngle;
              accumulatedAngle += sliceAngle;

              const startRad = (Math.PI * startAngle) / 180;
              const endRad = (Math.PI * endAngle) / 180;

              const x1 = center + radius * Math.cos(startRad);
              const y1 = center + radius * Math.sin(startRad);
              const x2 = center + radius * Math.cos(endRad);
              const y2 = center + radius * Math.sin(endRad);

              const largeArcFlag = effectiveAngle > 180 ? 1 : 0;

              const pathData = `
                M ${x1} ${y1}
                A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}
              `;

              return (
                <Path
                  key={cat.categoryId}
                  d={pathData}
                  stroke={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  fill="transparent"
                />
              );
            })}
          </G>
        </Svg>

        <View style={styles.donutCenterContent}>
          <Text style={styles.donutCenterTitle}>Total Expenses</Text>
          <Text style={styles.donutCenterAmount}>
            ₱{totalSpent.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </Text>
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

      {/* Header */}
      <View style={[splitStyles.modernHeader, { justifyContent: 'space-between' }]}>
        <View style={splitStyles.headerLeft}>
          <TouchableOpacity 
            activeOpacity={0.7} 
            onPress={() => router.back()} 
            style={{ marginRight: 12 }}
          >
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={splitStyles.modernHeaderTitle}>Statistics</Text>
        </View>
      </View>

      {/* Fixed Top Section */}
      <View style={styles.fixedTopContent}>
        {/* Filter Segment Tabs */}
        <View style={styles.filterSegmentContainer}>
          {(['days', 'weeks', 'months'] as TimeFrame[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              activeOpacity={0.8}
              onPress={() => setTimeFrame(tab)}
              style={[styles.filterSegmentBtn, timeFrame === tab && styles.filterSegmentBtnActive]}
            >
              <Text style={[styles.filterSegmentText, timeFrame === tab && styles.filterSegmentTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Carousel */}
        <View style={styles.carouselWrapper}>
          <FlatList
            ref={flatListRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            data={periodOptions}
            keyExtractor={(item) => item.id}
            snapToInterval={ITEM_WIDTH}
            decelerationRate="fast"
            getItemLayout={(_, index) => ({
              length: ITEM_WIDTH,
              offset: ITEM_WIDTH * index,
              index,
            })}
            contentContainerStyle={{
              paddingHorizontal: CENTER_PADDING,
            }}
            renderItem={({ item, index }) => {
              const isSelected = index === selectedPeriodIndex;
              return (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => scrollToPeriod(index, true)}
                  style={[styles.periodItem, { width: ITEM_WIDTH }]}
                >
                  <Text 
                    numberOfLines={1} 
                    style={[styles.periodText, isSelected && styles.periodTextSelected]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* Donut Chart */}
        {renderDonutChart()}

        {/* Breakdown Title */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Expense Breakdown</Text>
        </View>
      </View>

      {/* Only Cards Scroll */}
      <FlatList
        data={categoryStats}
        keyExtractor={(item) => item.categoryId}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollableCardsContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#54C9CC" colors={['#54C9CC']} />
        }
        renderItem={({ item: cat, index }) => {
          const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
          const percent = totalSpent > 0 ? Math.round((cat.spent / totalSpent) * 100) : 0;

          return (
            <View style={styles.cardItem}>
              <View style={styles.cardHeader}>
                <View style={styles.cardLeftInfo}>
                  <View style={[styles.iconContainer, { backgroundColor: `${color}1F` }]}>
                    <Ionicons name={(cat.categoryIcon as any) || 'wallet-outline'} size={18} color={color} />
                  </View>
                  <View style={styles.cardTextGroup}>
                    <Text style={styles.categoryTitle}>{cat.categoryName}</Text>
                    <Text style={styles.categorySubText}>{cat.expenseCount} transactions</Text>
                  </View>
                </View>
                <Text style={styles.categoryAmount}>
                  ₱{cat.spent.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </Text>
              </View>

              <View style={styles.progressBarBackground}>
                <View style={[styles.progressBarFill, { width: `${percent}%`, backgroundColor: color }]} />
              </View>

              <Text style={styles.progressText}>{percent}% of total spent</Text>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFBFD' },
  centeredContent: { justifyContent: 'center', alignItems: 'center' },
  
  fixedTopContent: {
    paddingHorizontal: 20,
  },

  filterSegmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 24,
    padding: 4,
    marginTop: 8,
    marginBottom: 2,
  },
  filterSegmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 20,
  },
  filterSegmentBtnActive: {
    backgroundColor: '#0F172A',
  },
  filterSegmentText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  filterSegmentTextActive: { color: '#FFFFFF', fontWeight: '700' },

  carouselWrapper: {
    marginVertical: 4,
    height: 38,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  periodItem: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
  },
  periodTextSelected: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },

  donutContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    position: 'relative',
  },
  donutCenterContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenterTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
  },
  donutCenterAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },

  sectionHeader: {
    marginTop: 4,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },

  scrollableCardsContent: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    gap: 10,
  },
  cardItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardLeftInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTextGroup: {
    justifyContent: 'center',
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  categorySubText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  categoryAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#94A3B8',
  },
});