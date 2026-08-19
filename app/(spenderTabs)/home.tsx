import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { supabase } from '../../lib/supabase';

// ---- Palette ----------------------------------------------------------
const COLORS = {
  deepTeal: '#1E4F59',
  deepTealLight: '#2A6B78',
  cyan: '#54C9CC',
  cyanLight: '#7EDDE0',
  olive: '#7EA00E',
  yellowGreen: '#DCD964',
  darkOlive: '#213502',
  bg: '#F4F8F4',
  card: '#FFFFFF',
  white: '#FFFFFF',
  textMuted: '#7E8F82',
  shadow: '#1E4F59',
  darkNav: '#111111',
};

const FOLDER_THEMES = [
  { bg: COLORS.deepTeal, text: '#FFFFFF', iconBg: COLORS.cyan, iconColor: COLORS.deepTeal },
  { bg: COLORS.olive, text: '#FFFFFF', iconBg: COLORS.yellowGreen, iconColor: COLORS.darkOlive },
  { bg: COLORS.cyan, text: '#0B2E33', iconBg: '#FFFFFF', iconColor: COLORS.deepTeal },
  { bg: COLORS.darkOlive, text: '#FFFFFF', iconBg: COLORS.olive, iconColor: '#FFFFFF' },
  { bg: COLORS.yellowGreen, text: COLORS.darkOlive, iconBg: '#FFFFFF', iconColor: COLORS.olive },
];

const DUE_CARD_ACCENTS = [
  { bg: '#FFF7ED', borderColor: '#FB923C', iconColor: '#EA580C', badgeBg: '#FFF1E0' },
  { bg: '#EFF6FF', borderColor: '#60A5FA', iconColor: '#2563EB', badgeBg: '#E0EDFF' },
  { bg: '#F0FDF4', borderColor: '#4ADE80', iconColor: '#16A34A', badgeBg: '#DCFCE7' },
  { bg: '#FEF2F2', borderColor: '#F87171', iconColor: '#DC2626', badgeBg: '#FEE2E2' },
  { bg: '#FDF4FF', borderColor: '#C084FC', iconColor: '#9333EA', badgeBg: '#F3E8FF' },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// "Quick Budget" carousel now shows 2 cards per slide. SECTION_H_PADDING
// matches sectionBlock's own paddingHorizontal so each slide's width lines
// up exactly with the FlatList's visible (unpadded) area — required for
// pagingEnabled to snap cleanly.
const SECTION_H_PADDING = 24;
const CARD_GAP = 14;
const SLIDE_WIDTH = SCREEN_WIDTH - SECTION_H_PADDING * 2;
const QUICK_BUDGET_CARD_WIDTH = (SLIDE_WIDTH - CARD_GAP) / 2;

function chunkPairs<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

// Converts a theme's solid hex color into a translucent rgba tint, used to
// lay each card's brand color over the blur without hiding the glass effect.
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const bigint = parseInt(full, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

const COLLAPSE_THRESHOLD = 72;

interface IncomeSummary {
  id: string;
  sourceName: string;
  amount: number;
  description?: string;
  startDate: string;
  endDate: string;
}

interface DynamicCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  totalSpent: number;
  allocatedAmount: number;
  remainingAmount: number;
}

interface RecentActivity {
  id: string;
  name: string;
  amount: number;
  category: string;
  dateString: string;
}

interface UpcomingDue {
  id: string;
  title: string;
  amount: number;
  dueDate: string;
  category?: string;
  isPaid: boolean;
  daysRemaining: number;
}

export default function PersonalHomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState('User');

  const [income, setIncome] = useState<IncomeSummary | null>(null);
  const [categories, setCategories] = useState<DynamicCategory[]>([]);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [upcomingDues, setUpcomingDues] = useState<UpcomingDue[]>([]);

  const [allocateModalVisible, setAllocateModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<DynamicCategory | null>(null);
  const [allocateAmount, setAllocateAmount] = useState('');

  const [incomeModalVisible, setIncomeModalVisible] = useState(false);
  const [incomeName, setIncomeName] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeDesc, setIncomeDesc] = useState('');
  const [incomeStart] = useState(new Date().toISOString().split('T')[0]);
  const [incomeEnd] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

  const [submitting, setSubmitting] = useState(false);

  const [activeFolderIndex, setActiveFolderIndex] = useState(0);
  const folderListRef = useRef<FlatList<DynamicCategory[]>>(null);
  const folderAutoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const folderScrollX = useRef(new Animated.Value(0)).current;

  // ---- Scroll-driven animated values ----
  const scrollY = useRef(new Animated.Value(0)).current;
  const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

  const headerPaddingBottom = scrollY.interpolate({
    inputRange: [0, COLLAPSE_THRESHOLD],
    outputRange: [42, 10],
    extrapolate: 'clamp',
  });

  const headerShadowOpacity = scrollY.interpolate({
    inputRange: [8, 30],
    outputRange: [0, 0.15],
    extrapolate: 'clamp',
  });
  const headerElevation = scrollY.interpolate({
    inputRange: [8, 30],
    outputRange: [0, 10],
    extrapolate: 'clamp',
  });

  const topRowMarginBottom = scrollY.interpolate({
    inputRange: [0, COLLAPSE_THRESHOLD],
    outputRange: [28, 8],
    extrapolate: 'clamp',
  });

  const helloOpacity = scrollY.interpolate({
    inputRange: [0, 22],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const helloHeight = scrollY.interpolate({
    inputRange: [0, 22],
    outputRange: [40, 0],
    extrapolate: 'clamp',
  });

  const userNameFontSize = scrollY.interpolate({
    inputRange: [0, COLLAPSE_THRESHOLD],
    outputRange: [22, 15],
    extrapolate: 'clamp',
  });

  const labelOpacity = scrollY.interpolate({
    inputRange: [0, 18],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const labelHeight = scrollY.interpolate({
    inputRange: [0, 18],
    outputRange: [28, 0],
    extrapolate: 'clamp',
  });

  const pillOuterHeight = scrollY.interpolate({
    inputRange: [0, COLLAPSE_THRESHOLD],
    outputRange: [54, 16],
    extrapolate: 'clamp',
  });
  const pillOuterRadius = scrollY.interpolate({
    inputRange: [0, COLLAPSE_THRESHOLD],
    outputRange: [30, 8],
    extrapolate: 'clamp',
  });

  const pillInnerHeight = scrollY.interpolate({
    inputRange: [0, COLLAPSE_THRESHOLD],
    outputRange: [46, 8],
    extrapolate: 'clamp',
  });
  const pillInnerRadius = scrollY.interpolate({
    inputRange: [0, COLLAPSE_THRESHOLD],
    outputRange: [26, 4],
    extrapolate: 'clamp',
  });

  const balanceBlockMarginTop = scrollY.interpolate({
    inputRange: [0, COLLAPSE_THRESHOLD],
    outputRange: [10, 2],
    extrapolate: 'clamp',
  });

  const amountMarginTop = scrollY.interpolate({
    inputRange: [0, COLLAPSE_THRESHOLD],
    outputRange: [16, 4],
    extrapolate: 'clamp',
  });

  const amountFontSize = scrollY.interpolate({
    inputRange: [0, COLLAPSE_THRESHOLD],
    outputRange: [32, 17],
    extrapolate: 'clamp',
  });
  const dividerFontSize = scrollY.interpolate({
    inputRange: [0, COLLAPSE_THRESHOLD],
    outputRange: [22, 11],
    extrapolate: 'clamp',
  });
  const totalFontSize = scrollY.interpolate({
    inputRange: [0, COLLAPSE_THRESHOLD],
    outputRange: [15, 11],
    extrapolate: 'clamp',
  });

  const unallocOpacity = scrollY.interpolate({
    inputRange: [0, 18],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const unallocHeight = scrollY.interpolate({
    inputRange: [0, 18],
    outputRange: [54, 0], // chip's marginTop(10) + padding(8+8) + content(~20) + buffer
    extrapolate: 'clamp',
  });

  const iconCircleScale = scrollY.interpolate({
    inputRange: [0, COLLAPSE_THRESHOLD],
    outputRange: [1, 0.82],
    extrapolate: 'clamp',
  });

  const fetchDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single();

      if (profileData?.full_name) setUserName(profileData.full_name);

      const { data: allCategoriesData, error: catError } = await supabase
        .from('categories')
        .select('id, name, icon, color')
        .or(`user_id.is.null,user_id.eq.${user.id}`);
      if (catError) throw catError;

      const categoryMap: Record<string, DynamicCategory> = {};
      (allCategoriesData || []).forEach((cat) => {
        categoryMap[cat.id] = {
          id: cat.id,
          name: cat.name,
          icon: cat.icon || 'options',
          color: cat.color || COLORS.deepTeal,
          totalSpent: 0,
          allocatedAmount: 0,
          remainingAmount: 0
        };
      });

      const { data: incomeData, error: incomeError } = await supabase
        .from('income')
        .select('id, source_name, amount, description, start_date, end_date')
        .eq('user_id', user.id)
        .order('received_at', { ascending: false })
        .limit(1);
      if (incomeError) throw incomeError;

      const parsedActivities: RecentActivity[] = [];

      if (incomeData && incomeData.length > 0) {
        const activeIncome = incomeData[0];
        setIncome({
          id: activeIncome.id,
          sourceName: activeIncome.source_name,
          amount: Number(activeIncome.amount),
          description: activeIncome.description ?? undefined,
          startDate: activeIncome.start_date,
          endDate: activeIncome.end_date
        });

        const { data: budgetsData, error: budgetsError } = await supabase
          .from('budgets')
          .select(`
            id, category_id, allocated_amount, remaining_amount,
            expenses ( id, description, amount, spent_at )
          `)
          .eq('user_id', user.id);
        if (budgetsError) throw budgetsError;

        (budgetsData || []).forEach((budget: any) => {
          const catId = budget.category_id;
          const currentAllocation = Number(budget.allocated_amount || 0);
          const dbRemaining = Number(budget.remaining_amount || 0);
          const expensesList = budget.expenses || [];

          const categoryTotalSpent = expensesList.reduce((sum: number, exp: any) => sum + Number(exp.amount), 0);

          if (categoryMap[catId]) {
            categoryMap[catId].allocatedAmount = currentAllocation;
            categoryMap[catId].totalSpent = categoryTotalSpent;
            categoryMap[catId].remainingAmount = dbRemaining;
          }

          expensesList.forEach((exp: any) => {
            if (categoryMap[catId]) {
              const dateObj = new Date(exp.spent_at);
              parsedActivities.push({
                id: String(exp.id),
                name: exp.description || 'General Expense',
                amount: Number(exp.amount),
                category: categoryMap[catId].name,
                dateString: dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
              });
            }
          });
        });

        parsedActivities.sort((a, b) => b.id.localeCompare(a.id));
        setRecentActivities(parsedActivities.slice(0, 6));
      } else {
        setIncome(null);
        setRecentActivities([]);
      }

      setCategories(Object.values(categoryMap));

      const { data: remindersData, error: remindersError } = await supabase
        .from('reminders')
        .select('id, title, amount, due_date, category, is_paid')
        .eq('user_id', user.id)
        .eq('is_paid', false)
        .gte('due_date', new Date().toISOString().split('T')[0])
        .order('due_date', { ascending: true })
        .limit(5);

      if (!remindersError && remindersData) {
        const parsedDues: UpcomingDue[] = remindersData.map((reminder) => {
          const dueDate = new Date(reminder.due_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const diffTime = dueDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          return {
            id: String(reminder.id),
            title: reminder.title,
            amount: Number(reminder.amount),
            dueDate: reminder.due_date,
            category: reminder.category || undefined,
            isPaid: reminder.is_paid,
            daysRemaining: diffDays
          };
        });
        setUpcomingDues(parsedDues);
      } else {
        setUpcomingDues([]);
      }

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error("Personal Dashboard Error:", message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleAllocateBudget = async () => {
    if (!selectedCategory || !income) return;
    const amountToAllocate = parseFloat(allocateAmount);

    if (isNaN(amountToAllocate) || amountToAllocate <= 0) {
      Alert.alert("Invalid Input", "Please enter a positive numeric value to allocate capital.");
      return;
    }

    const totalCurrentAllocated = categories.reduce((sum, cat) => sum + cat.allocatedAmount, 0);
    const unallocatedPool = income.amount - totalCurrentAllocated;

    if (amountToAllocate > unallocatedPool) {
      Alert.alert("Allocation Denied", `Insufficient unallocated resources. Available: ₱${unallocatedPool.toFixed(2)}`);
      return;
    }

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: existingBudget, error: checkError } = await supabase
        .from('budgets')
        .select('id, allocated_amount, remaining_amount')
        .eq('user_id', user.id)
        .eq('category_id', selectedCategory.id)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingBudget) {
        const { error: updateError } = await supabase
          .from('budgets')
          .update({
            allocated_amount: Number(existingBudget.allocated_amount) + amountToAllocate,
            remaining_amount: Number(existingBudget.remaining_amount || 0) + amountToAllocate
          })
          .eq('id', existingBudget.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('budgets')
          .insert({
            user_id: user.id,
            category_id: selectedCategory.id,
            allocated_amount: amountToAllocate,
            remaining_amount: amountToAllocate
          });
        if (insertError) throw insertError;
      }

      Alert.alert("Allocation Success 🎉", `Successfully injected ₱${amountToAllocate.toFixed(2)} into ${selectedCategory.name}.`);
      setAllocateModalVisible(false);
      setAllocateAmount('');
      fetchDashboardData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      Alert.alert("Process Aborted", message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddIncome = async () => {
    const parsedAmount = parseFloat(incomeAmount);
    if (!incomeName || isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Error", "Please input a valid source title and amount.");
      return;
    }

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('income')
        .insert({
          user_id: user.id,
          source_name: incomeName,
          amount: parsedAmount,
          description: incomeDesc || null,
          start_date: incomeStart,
          end_date: incomeEnd
        });

      if (error) throw error;

      Alert.alert("Success!!", "Income statement completely logged.");
      setIncomeModalVisible(false);
      setIncomeName('');
      setIncomeAmount('');
      setIncomeDesc('');
      fetchDashboardData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      Alert.alert("Error", message);
    } finally {
      setSubmitting(false);
    }
  };

  const startFolderAutoScroll = () => {
    stopFolderAutoScroll();
    const slidesCount = Math.ceil(categories.length / 2);
    if (slidesCount <= 1) return;
    folderAutoScrollTimer.current = setInterval(() => {
      setActiveFolderIndex((prevIndex) => {
        const nextIndex = prevIndex >= slidesCount - 1 ? 0 : prevIndex + 1;
        folderListRef.current?.scrollToOffset({
          offset: nextIndex * SLIDE_WIDTH,
          animated: true
        });
        return nextIndex;
      });
    }, 3500);
  };

  const stopFolderAutoScroll = () => {
    if (folderAutoScrollTimer.current) {
      clearInterval(folderAutoScrollTimer.current);
      folderAutoScrollTimer.current = null;
    }
  };

  const onFolderMomentumEnd = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const slidesCount = Math.ceil(categories.length / 2);
    const index = Math.round(offsetX / SLIDE_WIDTH);
    if (index >= 0 && index < slidesCount) {
      setActiveFolderIndex(index);
    }
    startFolderAutoScroll();
  };

  useEffect(() => {
    fetchDashboardData();
    return () => stopFolderAutoScroll();
  }, []);

  useEffect(() => {
    if (categories.length > 0) startFolderAutoScroll();
    return () => stopFolderAutoScroll();
  }, [categories]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const getDaysLabel = (days: number): { text: string; urgent: boolean } => {
    if (days === 0) return { text: 'Due today', urgent: true };
    if (days === 1) return { text: 'Tomorrow', urgent: true };
    if (days <= 3) return { text: `${days} days`, urgent: true };
    if (days <= 7) return { text: `${days} days`, urgent: false };
    return { text: `${days} days`, urgent: false };
  };

  const formatDueDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: COLORS.deepTeal }]}>
        <ExpoStatusBar style="light" backgroundColor={COLORS.deepTeal} />
        <ActivityIndicator size="large" color={COLORS.yellowGreen} />
      </SafeAreaView>
    );
  }

  const totalAllocatedBudgetPool = categories.reduce((sum, c) => sum + c.allocatedAmount, 0);
  const totalSpentAcrossSystem = categories.reduce((sum, c) => sum + c.totalSpent, 0);
  const unallocatedBalance = income ? income.amount - totalAllocatedBudgetPool : 0;

  const globalSpentPercentage = income && income.amount > 0
    ? Math.min((totalSpentAcrossSystem / income.amount) * 100, 100)
    : 0;

  return (
    <SafeAreaView style={styles.mainContainer}>
      <ExpoStatusBar style="light" backgroundColor={COLORS.deepTeal} />

      {/* ========== COLLAPSIBLE HEADER ========== */}
      <Animated.View
        style={[
          styles.headerBackground,
          {
            paddingBottom: headerPaddingBottom,
            shadowOpacity: headerShadowOpacity,
            elevation: headerElevation,
          }
        ]}
      >
        <Animated.View style={{ marginBottom: topRowMarginBottom }}>
          <View style={styles.topRow}>
            <View style={styles.greetingCol}>
              <Animated.View
                style={{
                  height: helloHeight,
                  opacity: helloOpacity,
                  overflow: 'hidden',
                  justifyContent: 'flex-end',
                }}
              >
                <Text style={styles.helloText}>Hello,</Text>
              </Animated.View>

              <Animated.Text
                style={[styles.userNameText, { fontSize: userNameFontSize }]}
                numberOfLines={1}
              >
                {userName}
              </Animated.Text>
            </View>

            <View style={styles.topIconsRow}>
              <Animated.View style={{ transform: [{ scale: iconCircleScale }] }}>
                <TouchableOpacity style={styles.iconCircleModern}>
                  <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
                  <View style={styles.notifDot} />
                </TouchableOpacity>
              </Animated.View>
              <Animated.View style={{ transform: [{ scale: iconCircleScale }] }}>
                <TouchableOpacity style={styles.iconCircleModern} onPress={() => router.push('/reminders')}>
                  <Ionicons name="calendar-outline" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>
        </Animated.View>

        <AnimatedTouchableOpacity
          activeOpacity={0.9}
          onPress={() => setIncomeModalVisible(true)}
          style={[styles.balanceBlock, { marginTop: balanceBlockMarginTop }]}
        >
          <Animated.View
            style={{
              height: labelHeight,
              opacity: labelOpacity,
              overflow: 'hidden',
            }}
          >
            <View style={styles.balanceLabelRow}>
              <View style={styles.balanceLabelIconWrap}>
                <Ionicons name="wallet-outline" size={13} color={COLORS.deepTeal} />
              </View>
              <Text style={styles.balanceLabel}>Total Balance</Text>
            </View>
          </Animated.View>

          <Animated.View
            style={[
              styles.pillTrackOuter,
              {
                height: pillOuterHeight,
                borderRadius: pillOuterRadius,
              }
            ]}
          >
            <Animated.View
              style={[
                styles.pillTrack,
                {
                  height: pillInnerHeight,
                  borderRadius: pillInnerRadius,
                }
              ]}
            >
              <Animated.View
                style={[
                  styles.pillFill,
                  {
                    width: `${globalSpentPercentage}%`,
                    borderRadius: pillInnerRadius,
                  }
                ]}
              />
            </Animated.View>
          </Animated.View>

          <Animated.View style={[styles.balanceAmountRow, { marginTop: amountMarginTop }]}>
            <Animated.Text style={[styles.pillAmountText, { fontSize: amountFontSize }]}>
              ₱{totalSpentAcrossSystem.toLocaleString()}
            </Animated.Text>
            <Animated.Text style={[styles.pillAmountDivider, { fontSize: dividerFontSize }]}>
              /
            </Animated.Text>
            <Animated.Text style={[styles.pillAmountTotal, { fontSize: totalFontSize }]}>
              ₱{income ? income.amount.toLocaleString() : '0'}
            </Animated.Text>
          </Animated.View>

          {/* ===== UNALLOCATED — rounded chip w/ dot + chevron (no yellow bg, no icon badge) ===== */}
          <Animated.View
            style={{
              height: unallocHeight,
              opacity: unallocOpacity,
              overflow: 'hidden',
              justifyContent: 'flex-end',
            }}
          >
            <View style={styles.unallocatedChip}>
              <View style={styles.unallocatedDot} />
              <Text style={styles.unallocatedHint} numberOfLines={1}>
                ₱{unallocatedBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} unallocated
              </Text>
              <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.6)" />
            </View>
          </Animated.View>
        </AnimatedTouchableOpacity>
      </Animated.View>

      {/* ========== SCROLLABLE CONTENT ========== */}
      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.olive]}
            tintColor={COLORS.olive}
          />
        }
        showsVerticalScrollIndicator={false}
        bounces={true}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
      >
        {/* ========== QUICK BUDGET (2-up glass carousel) ========== */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Quick Budget</Text>
            <TouchableOpacity onPress={() => router.push('/category-dashboard')}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>

          {categories.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No budget folders yet.</Text>
            </View>
          ) : (
            <>
              <Animated.FlatList
                ref={folderListRef}
                data={chunkPairs(categories)}
                horizontal
                pagingEnabled
                keyExtractor={(_, idx) => `quick-budget-slide-${idx}`}
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                onScrollBeginDrag={stopFolderAutoScroll}
                onMomentumScrollEnd={onFolderMomentumEnd}
                scrollEventThrottle={16}
                onScroll={Animated.event(
                  [{ nativeEvent: { contentOffset: { x: folderScrollX } } }],
                  { useNativeDriver: true }
                )}
                renderItem={({ item: pair, index: slideIndex }) => {
                  const inputRange = [
                    (slideIndex - 1) * SLIDE_WIDTH,
                    slideIndex * SLIDE_WIDTH,
                    (slideIndex + 1) * SLIDE_WIDTH,
                  ];
                  const scale = folderScrollX.interpolate({
                    inputRange,
                    outputRange: [0.94, 1, 0.94],
                    extrapolate: 'clamp',
                  });
                  const opacity = folderScrollX.interpolate({
                    inputRange,
                    outputRange: [0.7, 1, 0.7],
                    extrapolate: 'clamp',
                  });

                  return (
                    <Animated.View
                      style={[
                        styles.quickBudgetSlide,
                        { transform: [{ scale }], opacity }
                      ]}
                    >
                      {pair.map((cat, i) => {
                        const theme = FOLDER_THEMES[(slideIndex * 2 + i) % FOLDER_THEMES.length];
                        return (
                          <TouchableOpacity
                            key={cat.id}
                            activeOpacity={0.9}
                            onPress={() => {
                              setSelectedCategory(cat);
                              setAllocateModalVisible(true);
                            }}
                            style={styles.folderCardShadow}
                          >
                            <View style={styles.folderCardInner}>
                              <BlurView intensity={45} tint="light" style={StyleSheet.absoluteFillObject} />
                              <View
                                style={[
                                  StyleSheet.absoluteFillObject,
                                  { backgroundColor: hexToRgba(theme.bg, 0.55) }
                                ]}
                              />
                              <View style={styles.folderCardContent}>
                                <View style={[styles.folderIconCircle, { backgroundColor: theme.iconBg }]}>
                                  <Ionicons name={cat.icon as keyof typeof Ionicons.glyphMap} size={16} color={theme.iconColor} />
                                </View>
                                <Text style={[styles.folderName, { color: theme.text }]} numberOfLines={1}>{cat.name}</Text>
                                <Text style={[styles.folderAmount, { color: theme.text }]} numberOfLines={1}>
                                  ₱{cat.remainingAmount.toLocaleString()} left
                                </Text>
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </Animated.View>
                  );
                }}
              />
              {chunkPairs(categories).length > 1 && (
                <View style={styles.dotsRow}>
                  {chunkPairs(categories).map((_, dotIndex) => (
                    <View
                      key={dotIndex}
                      style={[styles.dot, activeFolderIndex === dotIndex ? styles.dotActive : styles.dotInactive]}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        {/* ========== UPCOMING DUES ========== */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Upcoming Dues</Text>
            <TouchableOpacity onPress={() => router.push('/reminders')}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>

          {upcomingDues.length === 0 ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconWrapper}>
                <Ionicons name="checkmark-done-circle-outline" size={40} color={COLORS.cyan} />
              </View>
              <Text style={styles.emptyText}>All clear! No upcoming dues.</Text>
              <TouchableOpacity
                style={styles.addDueButton}
                onPress={() => router.push('/reminders')}
              >
                <Ionicons name="add-circle-outline" size={16} color={COLORS.olive} />
                <Text style={styles.addDueButtonText}>Add a reminder</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.dueCardsContainer}>
              {upcomingDues.map((due, index) => {
                const accent = DUE_CARD_ACCENTS[index % DUE_CARD_ACCENTS.length];
                const daysInfo = getDaysLabel(due.daysRemaining);
                return (
                  <TouchableOpacity
                    key={due.id}
                    activeOpacity={0.85}
                    onPress={() => router.push('/reminders')}
                    style={[
                      styles.dueItemCard,
                      {
                        backgroundColor: accent.bg,
                        borderLeftWidth: 4,
                        borderLeftColor: accent.borderColor
                      }
                    ]}
                  >
                    <View style={styles.dueItemLeft}>
                      <View style={[styles.dueItemIconCircle, { backgroundColor: accent.badgeBg }]}>
                        <Ionicons name="time-outline" size={20} color={accent.iconColor} />
                      </View>
                      <View style={styles.dueItemInfo}>
                        <Text style={styles.dueItemTitle} numberOfLines={1}>{due.title}</Text>
                        <Text style={styles.dueItemDate}>{formatDueDate(due.dueDate)}</Text>
                      </View>
                    </View>
                    <View style={styles.dueItemRight}>
                      <Text style={styles.dueItemAmount}>₱{due.amount.toLocaleString()}</Text>
                      <View style={[
                        styles.dueBadge,
                        { backgroundColor: daysInfo.urgent ? '#FEF2F2' : accent.badgeBg }
                      ]}>
                        <Text style={[
                          styles.dueBadgeText,
                          { color: daysInfo.urgent ? '#DC2626' : accent.iconColor }
                        ]}>
                          {daysInfo.text}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

      </Animated.ScrollView>

      {/* ========== MODAL 1: FUND ALLOCATION ========== */}
      <Modal animationType="fade" transparent={true} visible={allocateModalVisible} onRequestClose={() => setAllocateModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconWrapper}>
                <Ionicons name="wallet-outline" size={22} color={COLORS.olive} />
              </View>
              <View>
                <Text style={styles.modalTitle}>Fund Allocation</Text>
                <Text style={styles.modalCategoryName}>{selectedCategory?.name}</Text>
              </View>
            </View>
            <Text style={styles.modalSubText}>Inject unallocated allowance pool assets directly into this designated expense folder stream.</Text>

            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>Amount</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="₱0.00"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={allocateAmount}
                onChangeText={setAllocateAmount}
                editable={!submitting}
              />
            </View>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelBtn]} onPress={() => setAllocateModalVisible(false)} disabled={submitting}>
                <Text style={styles.cancelBtnText}>Dismiss</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.confirmBtn]} onPress={handleAllocateBudget} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.confirmBtnText}>Confirm</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========== MODAL 2: UPDATE INCOME ========== */}
      <Modal animationType="slide" transparent={true} visible={incomeModalVisible} onRequestClose={() => setIncomeModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconWrapper}>
                <Ionicons name="cash-outline" size={22} color={COLORS.olive} />
              </View>
              <View>
                <Text style={styles.modalTitle}>Update Income</Text>
                <Text style={styles.modalCategoryName}>Set your income baseline</Text>
              </View>
            </View>

            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>Source Name</Text>
              <TextInput style={styles.modalInput} placeholder="e.g., Monthly Salary" value={incomeName} onChangeText={setIncomeName} placeholderTextColor="#94A3B8" />
            </View>

            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>Amount</Text>
              <TextInput style={styles.modalInput} placeholder="₱0.00" keyboardType="numeric" value={incomeAmount} onChangeText={setIncomeAmount} placeholderTextColor="#94A3B8" />
            </View>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelBtn]} onPress={() => setIncomeModalVisible(false)} disabled={submitting}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.confirmBtn]} onPress={handleAddIncome} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.confirmBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    backgroundColor: COLORS.bg,
    paddingBottom: 100,
  },

  // ========== HEADER ==========
  headerBackground: {
    backgroundColor: COLORS.deepTeal,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 22,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    zIndex: 10,
  },

  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greetingCol: {
    flexDirection: 'column',
  },
  helloText: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  userNameText: {
    fontSize: 22,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.82)',
    marginTop: 2,
    letterSpacing: -0.2,
  },

  topIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  iconCircleModern: {
    width: 46,
    height: 46,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notifDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.yellowGreen,
    position: 'absolute',
    top: 11,
    right: 11,
    borderWidth: 2,
    borderColor: COLORS.deepTeal
  },

  balanceBlock: {
    alignItems: 'center',
  },
  balanceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 12,
  },
  balanceLabelIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.yellowGreen,
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 13,
    color: COLORS.white,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase'
  },
  pillTrackOuter: {
    width: '100%',
    padding: 4,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  pillTrack: {
    width: '100%',
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  pillFill: {
    height: '100%',
    borderRadius: 26,
    backgroundColor: COLORS.cyan,
  },
  balanceAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  pillAmountText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.6,
  },
  pillAmountDivider: {
    fontSize: 22,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '300',
  },
  pillAmountTotal: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
  },

  // ========== UNALLOCATED — rounded chip, dot + text + chevron ==========
  // Deliberately NOT the yellow-card/icon-badge style — translucent white
  // pill matching the rest of the header's glassy accents instead.
  unallocatedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 7,
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.09)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  unallocatedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.yellowGreen,
  },
  unallocatedHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '600',
  },

  // ========== SECTIONS ==========
  sectionBlock: {
    paddingHorizontal: 24,
    marginTop: 28
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.darkOlive,
    letterSpacing: -0.3
  },
  seeAllText: {
    fontSize: 13,
    color: COLORS.olive,
    fontWeight: '600'
  },

  // ========== QUICK BUDGET CAROUSEL (2-up, glass) ==========
  quickBudgetSlide: {
    width: SLIDE_WIDTH,
    flexDirection: 'row',
    gap: CARD_GAP,
  },
  // Shadow lives on this outer wrapper — it must NOT have overflow:'hidden'
  // or the shadow gets clipped along with everything else.
  folderCardShadow: {
    width: QUICK_BUDGET_CARD_WIDTH,
    height: 130,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  // The blur + color tint are clipped to this inner view instead, so the
  // glass effect respects the card's rounded corners.
  folderCardInner: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
  },
  folderCardContent: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  folderIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  folderName: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10
  },
  folderAmount: {
    fontSize: 11,
    opacity: 0.85,
    marginTop: 3,
    fontWeight: '500',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 16,
    backgroundColor: COLORS.deepTeal,
  },
  dotInactive: {
    width: 6,
    backgroundColor: '#D6E2D8',
  },

  // ========== UPCOMING DUES ==========
  dueCardsContainer: { gap: 12 },
  dueItemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  dueItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  dueItemIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dueItemInfo: { flex: 1 },
  dueItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.darkOlive,
    marginBottom: 4,
  },
  dueItemDate: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  dueItemRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  dueItemAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.darkOlive,
  },
  dueBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  dueBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  emptyIconWrapper: { marginBottom: 10 },
  addDueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  addDueButtonText: {
    fontSize: 13,
    color: COLORS.olive,
    fontWeight: '600',
  },

  // ========== RECENT TRANSACTIONS ==========
  transactionsList: {
    gap: 12,
  },
  transactionCard: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  transactionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#EAF3EC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  transactionInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  transactionName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.darkOlive,
  },
  transactionCategory: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  transactionRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  transactionDate: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
    marginBottom: 4,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.deepTeal,
  },

  emptyBox: {
    padding: 32,
    backgroundColor: COLORS.card,
    borderRadius: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '500',
  },

  // ========== MODALS ==========
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(63, 63, 62, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    padding: 28,
    borderRadius: 28,
    shadowColor: COLORS.darkOlive,
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  modalIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#edf0ee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.darkOlive,
    letterSpacing: -0.3,
  },
  modalCategoryName: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
    fontWeight: '500',
  },
  modalSubText: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 20,
    lineHeight: 20
  },
  inputWrapper: { marginBottom: 16 },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.darkOlive,
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 16,
    borderRadius: 16,
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.darkOlive,
    backgroundColor: COLORS.bg,
    paddingLeft: 20,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 100,
  },
  cancelBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 14
  },
  confirmBtn: {
    backgroundColor: COLORS.deepTeal,
    shadowColor: COLORS.deepTeal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14
  },
});