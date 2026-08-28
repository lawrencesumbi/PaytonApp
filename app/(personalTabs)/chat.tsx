import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

type Tab = 'predictions' | 'insights';``

interface ReminderItem {
  id: string;
  title: string;
  amount: number;
  due_date: string;
  status: 'pending' | 'paid';
  category_name?: string;
}

interface CategoryMetric {
  name: string;
  amount: number;
  percent: number;
  color?: string;
}

interface CoachSummary {
  personalName: string;
  income: number;
  totalSpent: number;
  remaining: number;
  unallocated: number;
  safeToSpend: number;
  healthScore: number;
  topCategory: string;
  topCategorySpent: number;
  categoryBreakdown: CategoryMetric[];
  thisWeekTotal: number;
  lastWeekTotal: number;
  reminder: ReminderItem | null;
  weekendSpending: number;
  weekdaySpending: number;
  fridayPeakLabel: string;
}

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function toMoney(value: number) {
  return currency.format(Number(value || 0));
}

function getDaysUntil(dateString: string) {
  const target = new Date(dateString);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getWeekRange(referenceDate: Date) {
  const start = new Date(referenceDate);
  const day = start.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function getMonthLabel() {
  return new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

const categoryPalette = ['#7A9A9E', '#C2D879', '#8DB3A8', '#D6C878', '#A78BFA', '#F7A8B8', '#F59E0B', '#38BDF8'];

const getCategoryColor = (name: string, index: number) => {
  const normalized = name.toLowerCase();
  const namedPalette: Record<string, string> = {
    food: '#C2D879',
    dining: '#C2D879',
    rent: '#7A9A9E',
    utilities: '#8DB3A8',
    transportation: '#D6C878',
    shopping: '#F7A8B8',
    entertainment: '#A78BFA',
    healthcare: '#F59E0B',
    education: '#38BDF8',
  };

  if (namedPalette[normalized]) return namedPalette[normalized];
  return categoryPalette[index % categoryPalette.length];
};

export default function ChatCoachScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('predictions');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<CoachSummary>({
    personalName: 'Personal',
    income: 0,
    totalSpent: 0,
    remaining: 0,
    unallocated: 0,
    safeToSpend: 0,
    healthScore: 0,
    topCategory: 'No data',
    topCategorySpent: 0,
    categoryBreakdown: [],
    thisWeekTotal: 0,
    lastWeekTotal: 0,
    reminder: null,
    weekendSpending: 0,
    weekdaySpending: 0,
    fridayPeakLabel: 'No usage yet',
  });

  const fetchCoachData = async () => {
    try {
      setLoading(true);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw userError || new Error('No authenticated personal account found.');

      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();

      const personalName = profileData?.full_name || 'Personal';

      const { data: incomeData } = await supabase
        .from('income')
        .select('id, source_name, amount, received_at')
        .eq('user_id', user.id)
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const incomeId = incomeData?.id ?? null;
      const incomeAmount = Number(incomeData?.amount || 0);

      let budgetsQuery = supabase
        .from('budgets')
        .select(`
          id,
          category_id,
          allocated_amount,
          remaining_amount,
          income_id,
          categories ( id, name, icon ),
          expenses ( id, amount, description, spent_at )
        `)
        .eq('user_id', user.id);

      if (incomeId) {
        budgetsQuery = budgetsQuery.eq('income_id', incomeId);
      }

      const { data: budgetsData, error: budgetsError } = await budgetsQuery;
      if (budgetsError) throw budgetsError;

      const categoryMap = new Map<string, number>();
      const weekendAmounts: number[] = [];
      const weekdayAmounts: number[] = [];
      const fridayValues: number[] = [];

      let totalSpent = 0;
      let totalAllocated = 0;

      const allExpenses: Array<{ amount: number; spent_at: string; category: string }> = [];

      (budgetsData || []).forEach((budget: any) => {
        const budgetAllocated = Number(budget.allocated_amount || 0);
        const categoryName = budget.categories?.name || 'Other';

        totalAllocated += budgetAllocated;

        const expenses = Array.isArray(budget.expenses) ? budget.expenses : [];
        const categorySpent = expenses.reduce((sum: number, expense: any) => sum + Number(expense.amount || 0), 0);

        totalSpent += categorySpent;
        categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + categorySpent);

        expenses.forEach((expense: any) => {
          const amount = Number(expense.amount || 0);
          const spentAt = expense.spent_at || new Date().toISOString();
          allExpenses.push({
            amount,
            spent_at: spentAt,
            category: categoryName,
          });

          const d = new Date(spentAt);
          const dayIndex = d.getDay();
          if (dayIndex === 0 || dayIndex === 6) {
            weekendAmounts.push(amount);
          } else {
            weekdayAmounts.push(amount);
          }

          if (d.getDay() === 5) {
            fridayValues.push(amount);
          }
        });
      });

      const categoryBreakdown = Array.from(categoryMap.entries())
        .map(([name, amount], index) => ({
          name,
          amount,
          percent: incomeAmount > 0 ? (amount / Math.max(incomeAmount, 1)) * 100 : 0,
          color: getCategoryColor(name, index),
        }))
        .sort((a, b) => b.amount - a.amount);

      const topCategory = categoryBreakdown[0] || { name: 'No data', amount: 0, percent: 0 };

      const now = new Date();
      const currentWeek = getWeekRange(now);
      const previousWeekStart = new Date(currentWeek.start);
      previousWeekStart.setDate(currentWeek.start.getDate() - 7);
      const previousWeekEnd = new Date(currentWeek.start);
      previousWeekEnd.setDate(currentWeek.start.getDate() - 1);
      previousWeekEnd.setHours(23, 59, 59, 999);

      const thisWeekTotal = allExpenses
        .filter((expense) => {
          const d = new Date(expense.spent_at);
          return d >= currentWeek.start && d <= currentWeek.end;
        })
        .reduce((sum, expense) => sum + expense.amount, 0);

      const lastWeekTotal = allExpenses
        .filter((expense) => {
          const d = new Date(expense.spent_at);
          return d >= previousWeekStart && d <= previousWeekEnd;
        })
        .reduce((sum, expense) => sum + expense.amount, 0);

      const { data: remindersData } = await supabase
        .from('reminders')
        .select(`
          id,
          title,
          amount,
          due_date,
          status,
          categories ( name )
        `)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('due_date', { ascending: true })
        .limit(10);

      const upcomingReminder = (remindersData || []).find((row: any) => {
        const days = getDaysUntil(row.due_date);
        return days >= 0;
      }) || (remindersData || [])[0] || null;

      const reminderPayload = upcomingReminder
        ? {
            id: upcomingReminder.id,
            title: upcomingReminder.title,
            amount: Number(upcomingReminder.amount || 0),
            due_date: upcomingReminder.due_date,
            status: upcomingReminder.status,
            category_name: Array.isArray(upcomingReminder.categories)
              ? upcomingReminder.categories[0]?.name || 'General'
              : upcomingReminder.categories?.name || 'General',
          }
        : null;

      const remaining = Math.max(incomeAmount - totalSpent, 0);
      const unallocated = Math.max(incomeAmount - totalAllocated, 0);
      const safeToSpend = remaining;
      const healthScore = incomeAmount > 0 ? clamp(Math.round((remaining / incomeAmount) * 100), 0, 100) : 0;
      const weekendSpending = weekendAmounts.reduce((sum, val) => sum + val, 0);
      const weekdaySpending = weekdayAmounts.reduce((sum, val) => sum + val, 0);

      const fridayAverage = fridayValues.length ? fridayValues.reduce((sum, val) => sum + val, 0) / fridayValues.length : 0;
      const fridayPeakLabel = fridayAverage > 0
        ? `Your Friday spend averages ${toMoney(fridayAverage)}. Planned spending is consistent with your weekly pattern.`
        : 'You have no Friday transactions logged yet.';

      setSummary({
        personalName,
        income: incomeAmount,
        totalSpent,
        remaining,
        unallocated,
        safeToSpend,
        healthScore,
        topCategory: topCategory.name,
        topCategorySpent: topCategory.amount,
        categoryBreakdown: categoryBreakdown.slice(0, 4),
        thisWeekTotal,
        lastWeekTotal,
        reminder: reminderPayload,
        weekendSpending,
        weekdaySpending,
        fridayPeakLabel,
      });
    } catch (error: any) {
      console.error('FinCoach load error:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoachData();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>AI FinCoach</Text>
          <Text style={styles.headerSubtitle}>Online • {summary.personalName}</Text>
        </View>

        <View style={styles.headerIcon}>
          <Ionicons name="sparkles" size={19} color="#FFFFFF" />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 110 + insets.bottom },
        ]}
      >
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="small" color="#005B60" />
            <Text style={styles.loadingText}>Loading personal insights...</Text>
          </View>
        ) : activeTab === 'predictions' ? (
          <Predictions summary={summary} />
        ) : (
          <Insights summary={summary} />
        )}
      </ScrollView>

      <View
        style={[
          styles.bottomNav,
          { paddingBottom: Math.max(insets.bottom, 8) },
        ]}
      >
        <TouchableOpacity
          style={styles.bottomNavItem}
          onPress={() => setActiveTab('predictions')}
          activeOpacity={0.8}
        >
          <View style={[styles.bottomIcon, activeTab === 'predictions' && styles.activeBottomIcon]}>
            <Ionicons
              name="bulb-outline"
              size={22}
              color={activeTab === 'predictions' ? '#005B60' : '#718096'}
            />
          </View>
          <Text style={[styles.bottomLabel, activeTab === 'predictions' && styles.activeBottomLabel]}>
            Predictions
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomNavItem}
          onPress={() => setActiveTab('insights')}
          activeOpacity={0.8}
        >
          <View style={[styles.bottomIcon, activeTab === 'insights' && styles.activeBottomIcon]}>
            <Ionicons
              name="analytics-outline"
              size={22}
              color={activeTab === 'insights' ? '#005B60' : '#718096'}
            />
          </View>
          <Text style={[styles.bottomLabel, activeTab === 'insights' && styles.activeBottomLabel]}>
            Insights
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Predictions({ summary }: { summary: CoachSummary }) {
  const usageRate = summary.income > 0 ? (summary.totalSpent / summary.income) * 100 : 0;
  const gaugeAngle = clamp(usageRate, 8, 85);
  const safeStatus = summary.remaining > 0 ? 'On Track' : 'Needs Review';
  const gaugeColor = summary.healthScore >= 75 ? '#10B981' : summary.healthScore >= 50 ? '#F59E0B' : '#EF4444';

  const weeklyDelta = summary.thisWeekTotal - summary.lastWeekTotal;
  const weekIncreasePct = summary.lastWeekTotal > 0 ? (weeklyDelta / summary.lastWeekTotal) * 100 : 0;
  const weekendVsWeekday = summary.weekendSpending - summary.weekdaySpending;

  const upcomingText = summary.reminder
    ? `${summary.reminder.title} (${toMoney(summary.reminder.amount)}) is due in ${Math.max(getDaysUntil(summary.reminder.due_date), 0)} days.`
    : 'No upcoming payment is currently due within your near-term budget cycle.';

  const unusualText =
    summary.lastWeekTotal > 0 && weekIncreasePct > 10
      ? `Your current week spend is ${toMoney(Math.abs(weeklyDelta))} higher than last week (${Math.round(Math.abs(weekIncreasePct))}% increase). Your top category is ${summary.topCategory}, and it is driving the rise.`
      : summary.thisWeekTotal > summary.lastWeekTotal
        ? `You are trending slightly higher than last week by ${toMoney(Math.abs(weeklyDelta))}. Keep a close eye on ${summary.topCategory} this week.`
        : `Your spending is staying under last week’s pace, which is positive for your remaining balance and monthly plan.`;

  const behaviorText =
    weekendVsWeekday > 0
      ? `Weekend spending is currently ${toMoney(Math.abs(weekendVsWeekday))} higher than weekday spending. If this pattern keeps going, your remaining balance could tighten before the month ends.`
      : `Your weekday spending is currently heavier than weekend spending, which suggests your spend is more routine-driven. Protecting your ${summary.topCategory.toLowerCase()} category will keep your balance stable.`;

  const behaviorTitle = weekendVsWeekday > 0 ? 'Weekend Spend Forecast' : 'Spending Pattern Forecast';

  return (
    <View>
      <View style={styles.pageTitleRow}>
        <View>
          <Text style={styles.pageTitle}>Financial Predictions</Text>
          <Text style={styles.pageSubtitle}>Here’s what your spending may look like.</Text>
        </View>

        <View style={styles.smallIcon}>
          <Ionicons name="sparkles-outline" size={19} color="#005B60" />
        </View>
      </View>

      <View style={styles.safeCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="speedometer-outline" size={20} color="#005B60" />
            <Text style={styles.cardTitle}>SAFE-TO-SPEND</Text>
          </View>
          <Text style={styles.cardPeriod}>{getMonthLabel()}</Text>
        </View>

        <View style={styles.gaugeContainer}>
          <View style={styles.gaugeText}>
            <Text style={styles.safeAmount}>{toMoney(summary.safeToSpend)}</Text>
            <Text style={styles.limitText}>LIMIT: {toMoney(summary.income)}</Text>
          </View>

          <View style={[styles.gaugeOuter, { borderColor: gaugeColor }]}>
            <View style={[styles.gaugeInner, { borderColor: `${gaugeColor}99` }]} />
          </View>
        </View>

        <View style={styles.safeFooter}>
          <View>
            <Text style={styles.footerLabel}>Remaining</Text>
            <Text style={styles.footerValue}>{toMoney(summary.remaining)}</Text>
          </View>

          <View style={styles.statusBadge}>
            <Ionicons
              name={safeStatus === 'On Track' ? 'checkmark-circle' : 'alert-circle'}
              size={15}
              color={safeStatus === 'On Track' ? '#10B981' : '#F59E0B'}
            />
            <Text style={styles.statusText}>{safeStatus}</Text>
          </View>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Ionicons name="sparkles-outline" size={19} color="#005B60" />
        <Text style={styles.sectionTitle}>AI Predictions Feed</Text>
      </View>

      <PredictionCard
        icon="calendar-outline"
        iconBackground="#E6FFFA"
        iconColor="#005B60"
        title="Upcoming Bills Alert"
        text={upcomingText}
      />

      <PredictionCard
        icon="warning-outline"
        iconBackground="#FFF7ED"
        iconColor="#F59E0B"
        title="Unusual Spending Pattern Detected"
        text={unusualText}
      />

      <PredictionCard
        icon="trending-up-outline"
        iconBackground="#ECFDF5"
        iconColor="#10B981"
        title={behaviorTitle}
        text={behaviorText}
      />

      <View style={styles.healthCard}>
        <View style={styles.healthIcon}>
          <Ionicons name="heart-outline" size={21} color="#005B60" />
        </View>

        <View style={styles.healthContent}>
          <Text style={styles.healthTitle}>Financial Health</Text>
          <Text style={styles.healthText}>
            {summary.healthScore >= 75
              ? 'Your spending is currently within your planned monthly limits.'
              : 'Your budget is tightening, but you still have room to improve discipline in your top category.'}
          </Text>
        </View>

        <Text style={styles.healthScore}>{summary.healthScore}%</Text>
      </View>
    </View>
  );
}

function Insights({ summary }: { summary: CoachSummary }) {
  const focusedCat = summary.categoryBreakdown[0];
  const chartMax = Math.max(summary.thisWeekTotal, summary.lastWeekTotal, 1);
  const currentHeight = (summary.thisWeekTotal / chartMax) * 100;
  const previousHeight = (summary.lastWeekTotal / chartMax) * 100;

  const categoryList = summary.categoryBreakdown.map((item) => ({ ...item, value: `${Math.round(item.percent)}%` }));
  const legendEntries = categoryList.slice(0, 4);
  const topCategoryColor = categoryList[0]?.color || '#10B981';
  const donutColors = categoryList.slice(0, 4).map((item) => item.color || '#10B981');
  const donutBorderColors = {
    borderColor: donutColors[0] || '#10B981',
    borderRightColor: donutColors[1] || '#B2F5EA',
    borderBottomColor: donutColors[2] || '#CBD5E0',
    borderLeftColor: donutColors[3] || '#7A9A9E',
  };

  const thisWeekSegments = categoryList.length > 0
    ? categoryList.slice(0, 3).map((item) => ({
        color: item.color || '#10B981',
        height: Math.max((item.amount / Math.max(summary.thisWeekTotal || item.amount, 1)) * 100, 10),
      }))
    : [{ color: '#10B981', height: 100 }];

  const lastWeekSegments = categoryList.length > 0
    ? categoryList.slice(0, 3).map((item) => ({
        color: item.color || '#10B981',
        height: Math.max((item.amount / Math.max(summary.lastWeekTotal || item.amount, 1)) * 100, 10),
      }))
    : [{ color: '#10B981', height: 100 }];

  const weekendText = summary.weekendSpending >= summary.weekdaySpending
    ? `You tend to spend more on weekends. Planning your weekend budget ahead may help you stay within your monthly limit.`
    : `Your spending is relatively stable across weekdays and weekends. Keep the pattern balanced to preserve your remaining balance.`;

  const savingsPaceText = summary.remaining > 0
    ? `You are on track for your monthly target, but you could reach your savings goal faster by reducing ${summary.topCategory.toLowerCase()} spend by ${toMoney(Math.min(summary.topCategorySpent * 0.15, 500))}.`
    : `Your cash flow is fully allocated. Tightening ${summary.topCategory.toLowerCase()} spending by a small amount can create more room for savings.`;

  return (
    <View>
      <View style={styles.pageTitleRow}>
        <View>
          <Text style={styles.pageTitle}>Spending Insights</Text>
          <Text style={styles.pageSubtitle}>Understand where your money goes.</Text>
        </View>

        <View style={styles.smallIcon}>
          <Ionicons name="analytics-outline" size={19} color="#005B60" />
        </View>
      </View>

      <View style={styles.insightCard}>
        <Text style={styles.insightTitle}>THIS WEEK VS LAST</Text>

        <View style={styles.chartContainer}>
          <View style={styles.barGroup}>
            <View style={styles.bar}>
              {thisWeekSegments.map((segment, index) => (
                <View
                  key={`this-${index}`}
                  style={[
                    styles.barSegment,
                    {
                      height: `${segment.height}%`,
                      backgroundColor: segment.color,
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={styles.barLabel}>THIS WEEK</Text>
          </View>

          <View style={styles.barGroup}>
            <View style={styles.bar}>
              {lastWeekSegments.map((segment, index) => (
                <View
                  key={`last-${index}`}
                  style={[
                    styles.barSegment,
                    {
                      height: `${segment.height}%`,
                      backgroundColor: segment.color,
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={styles.barLabel}>LAST</Text>
          </View>

          <View style={styles.legend}>
            {legendEntries.length > 0 ? (
              legendEntries.map((item) => (
                <LegendItem
                  key={item.name}
                  label={item.name}
                  value={item.value}
                  color={item.color || '#10B981'}
                />
              ))
            ) : (
              <LegendItem label="No data" value="0%" color="#10B981" />
            )}
          </View>
        </View>
      </View>

      <View style={styles.insightCard}>
        <Text style={styles.insightTitle}>TOP SPENDING CATEGORIES</Text>

        <View style={styles.categoryContainer}>
          <View style={[styles.donut, donutBorderColors]}>
            <View style={styles.donutHole}>
              <Text style={styles.donutTotal}>{categoryList.length ? `${Math.round(categoryList[0].percent)}%` : '0%'}</Text>
            </View>
          </View>

          <View style={styles.categoryList}>
            {categoryList.length > 0 ? (
              categoryList.map((item) => (
                <CategoryItem key={item.name} label={item.name} value={item.value} color={item.color || '#10B981'} />
              ))
            ) : (
              <CategoryItem label="No data" value="0%" color="#10B981" />
            )}
          </View>
        </View>
      </View>

      <View style={styles.insightFeatureCard}>
        <View style={styles.featureIcon}>
          <Ionicons name="time-outline" size={23} color="#005B60" />
        </View>

        <View style={styles.featureContent}>
          <Text style={styles.featureTitle}>FRIDAY SPENDING PEAK</Text>
          <Text style={styles.featureText}>{summary.fridayPeakLabel}</Text>
        </View>
      </View>

      <View style={styles.insightFeatureCard}>
        <View style={styles.featureIcon}>
          <Ionicons name="settings-outline" size={23} color="#005B60" />
        </View>

        <View style={styles.featureContent}>
          <Text style={styles.featureTitle}>RECURRING REVIEW</Text>
          <Text style={styles.featureText}>
            {summary.reminder
              ? `${summary.reminder.title} is your nearest recurring payment at ${toMoney(summary.reminder.amount)}.`
              : 'No pending recurring fees are logged for this personal account yet.'}
          </Text>
        </View>
      </View>

      <View style={styles.insightFeatureCard}>
        <View style={styles.featureIcon}>
          <Ionicons name="flag-outline" size={23} color="#005B60" />
        </View>

        <View style={styles.featureContent}>
          <Text style={styles.featureTitle}>SAVINGS PACE</Text>
          <Text style={styles.featureText}>{savingsPaceText}</Text>
        </View>
      </View>

      <View style={styles.insightFeatureCard}>
        <View style={styles.featureIcon}>
          <Ionicons name="trending-up-outline" size={23} color="#005B60" />
        </View>

        <View style={styles.featureContent}>
          <Text style={styles.featureTitle}>SPENDING HABIT</Text>
          <Text style={styles.featureText}>{weekendText}</Text>
        </View>
      </View>
    </View>
  );
}

function PredictionCard({
  icon,
  iconBackground,
  iconColor,
  title,
  text,
  buttonText,
}: {
  icon: any;
  iconBackground: string;
  iconColor: string;
  title: string;
  text: string;
  buttonText?: string;
}) {
  return (
    <View style={styles.predictionCard}>
      <View
        style={[
          styles.predictionIcon,
          { backgroundColor: iconBackground },
        ]}
      >
        <Ionicons name={icon} size={21} color={iconColor} />
      </View>

      <View style={styles.predictionContent}>
        <Text style={styles.predictionTitle}>{title}</Text>
        <Text style={styles.predictionText}>{text}</Text>

        {buttonText && (
          <TouchableOpacity style={styles.predictionButton} activeOpacity={0.8}>
            <Text style={styles.predictionButtonText}>{buttonText}</Text>
            <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function LegendItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color || '#10B981' }]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendValue}>{value}</Text>
    </View>
  );
}

function CategoryItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.categoryRow}>
      <View style={[styles.categoryDot, { backgroundColor: color || '#10B981' }]} />
      <Text style={styles.categoryLabel}>{label}</Text>
      <Text style={styles.categoryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  header: {
    height: 76,
    backgroundColor: '#005B60',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    marginRight: 40,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#D8F3F3',
    fontSize: 10,
    marginTop: 2,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 15,
  },
  loadingState: {
    paddingVertical: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#4A5568',
    fontSize: 12,
  },
  pageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D3748',
  },
  pageSubtitle: {
    color: '#718096',
    fontSize: 12,
    marginTop: 3,
  },
  smallIcon: {
    marginLeft: 'auto',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E6FFFA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  safeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    padding: 17,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  cardTitle: {
    fontSize: 13,
    color: '#2D3748',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  cardPeriod: {
    fontSize: 11,
    color: '#718096',
  },
  gaugeContainer: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  gaugeOuter: {
    width: 215,
    height: 108,
    borderTopLeftRadius: 108,
    borderTopRightRadius: 108,
    borderWidth: 17,
    borderBottomWidth: 0,
    // Dynamic color applied inline via style prop
    position: 'relative',
  },
  gaugeInner: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: 4,
    height: 92,
    borderTopLeftRadius: 92,
    borderTopRightRadius: 92,
    borderWidth: 5,
    borderBottomWidth: 0,
    // Dynamic color applied inline via style prop
  },
  gaugeText: {
    position: 'absolute',
    top: 72,
    alignItems: 'center',
  },
  safeAmount: {
    fontSize: 25,
    fontWeight: '800',
    color: '#2D3748',
  },
  limitText: {
    fontSize: 10,
    color: '#718096',
    marginTop: 3,
  },
  safeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#EDF2F7',
    paddingTop: 12,
  },
  footerLabel: {
    fontSize: 11,
    color: '#718096',
  },
  footerValue: {
    fontSize: 15,
    color: '#2D3748',
    fontWeight: '700',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 5,
  },
  statusText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D3748',
  },
  predictionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 13,
    flexDirection: 'row',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  predictionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },
  predictionContent: {
    flex: 1,
  },
  predictionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 4,
  },
  predictionText: {
    fontSize: 11.5,
    color: '#718096',
    lineHeight: 17,
  },
  predictionButton: {
    backgroundColor: '#005B60',
    borderRadius: 7,
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  predictionButtonText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  healthCard: {
    backgroundColor: '#E6FFFA',
    borderRadius: 14,
    padding: 13,
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  healthIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },
  healthContent: {
    flex: 1,
  },
  healthTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#005B60',
  },
  healthText: {
    fontSize: 11,
    color: '#4A5568',
    lineHeight: 15,
    marginTop: 2,
  },
  healthScore: {
    fontSize: 17,
    fontWeight: '800',
    color: '#005B60',
  },
  insightCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  insightTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2D3748',
    letterSpacing: 0.4,
    marginBottom: 15,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 130,
  },
  barGroup: {
    alignItems: 'center',
    marginHorizontal: 10,
  },
  bar: {
    width: 38,
    height: 90,
    justifyContent: 'flex-end',
    backgroundColor: '#F7FAFC',
    borderRadius: 5,
    overflow: 'hidden',
  },
  barSegment: {
    width: '100%',
    backgroundColor: '#10B981',
    borderBottomWidth: 1,
    borderBottomColor: '#FFFFFF',
  },
  barLabel: {
    fontSize: 8,
    color: '#718096',
    marginTop: 7,
  },
  legend: {
    marginLeft: 10,
    flex: 1,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  legendLabel: {
    fontSize: 9.5,
    color: '#4A5568',
    flex: 1,
  },
  legendValue: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#10B981',
  },
  categoryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  donut: {
    width: 105,
    height: 105,
    borderRadius: 53,
    borderWidth: 20,
    borderColor: '#10B981',
    borderRightColor: '#B2F5EA',
    borderBottomColor: '#CBD5E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  donutHole: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  donutTotal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2D3748',
  },
  categoryList: {
    width: 145,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 7,
  },
  categoryLabel: {
    fontSize: 10.5,
    color: '#4A5568',
    flex: 1,
  },
  categoryValue: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#2D3748',
  },
  insightFeatureCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  featureIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#E6FFFA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2D3748',
    marginBottom: 4,
  },
  featureText: {
    fontSize: 11.5,
    color: '#718096',
    lineHeight: 17,
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 8,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
  },
  bottomNavItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  bottomIcon: {
    width: 44,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeBottomIcon: {
    backgroundColor: '#E6FFFA',
  },
  bottomLabel: {
    fontSize: 10,
    color: '#718096',
    marginTop: 2,
  },
  activeBottomLabel: {
    color: '#005B60',
    fontWeight: '700',
  },
});