import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// PALETTE — unified across screens
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

const PALETTE_LIGHT_CARDS = [
  '#E6F0F2',
  '#F4F8E8',
  '#FAFAD8',
];

const CARD_THEMES = [
  { bg: '#E6F0F2', text: '#1F4F59', iconBg: '#54C9CC', iconColor: '#FFFFFF' },
  { bg: '#F4F8E8', text: '#213502', iconBg: '#7EA00E', iconColor: '#FFFFFF' },
  { bg: '#FAFAD8', text: '#213502', iconBg: '#DCD964', iconColor: '#213502' },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SECTION_H_PADDING = 24;
const CARD_GAP = 14;
const SLIDE_WIDTH = SCREEN_WIDTH - SECTION_H_PADDING * 2;
const QUICK_BUDGET_CARD_WIDTH = (SLIDE_WIDTH - CARD_GAP) / 2;
const COLLAPSE_THRESHOLD = 72;

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Unknown error occurred';
}

function getDaysInfo(dueDateStr: string): { text: string; urgent: boolean } {
  const dueDate = new Date(dueDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { text: 'Overdue', urgent: true };
  if (diffDays === 0) return { text: 'Due today', urgent: true };
  if (diffDays === 1) return { text: 'Tomorrow', urgent: true };
  if (diffDays <= 3) return { text: `${diffDays} days`, urgent: true };
  return { text: `${diffDays} days`, urgent: false };
}

function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------
interface DashboardSummary {
  allowanceId: string;
  allowanceName: string;
  totalAllowance: number;
  totalSpent: number;
  remaining: number;
  unallocated: number;
}

interface DynamicCategory {
  id: string;
  name: string;
  icon: string;
  color?: string;
  totalSpent: number;
  allocatedAmount: number;
  remainingAmount: number;
  budgetId?: string;
}

interface BudgetExpense {
  id: string;
  amount: number;
}

interface BudgetQuery {
  id: string;
  category_id: string;
  allocated_amount: number;
  allowance_id: string;
  expenses: BudgetExpense[];
}

interface ReminderItem {
  id: string;
  title: string;
  amount: number;
  due_date: string;
  status: string;
  categories?: {
    name?: string;
    icon?: string;
  } | null;
}

interface FriendItem {
  id: string;
  full_name: string;
  email?: string;
  avatar_url?: string | null;
}

interface TransactionItem {
  id: string;
  amount: number;
  created_at: string;
  description?: string;
  categories?: {
    name?: string;
    icon?: string;
    color?: string;
  } | null;
}

export default function SpenderHomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [spenderName, setSpenderName] = useState('Guian Sumbi');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [categories, setCategories] = useState<DynamicCategory[]>([]);
  const [upcomingDues, setUpcomingDues] = useState<ReminderItem[]>([]);
  const [friendsList, setFriendsList] = useState<FriendItem[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<TransactionItem[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<DynamicCategory | null>(null);
  const [allocateAmount, setAllocateAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ---- Scroll-driven header collapse ----
  const scrollY = useRef(new Animated.Value(0)).current;

  const headerPaddingBottom = scrollY.interpolate({
    inputRange: [0, COLLAPSE_THRESHOLD],
    outputRange: [30, 10],
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
    outputRange: [24, 8],
    extrapolate: 'clamp',
  });
  const helloOpacity = scrollY.interpolate({ inputRange: [0, 22], outputRange: [1, 0], extrapolate: 'clamp' });
  const helloHeight = scrollY.interpolate({ inputRange: [0, 22], outputRange: [26, 0], extrapolate: 'clamp' });
  const userNameFontSize = scrollY.interpolate({
    inputRange: [0, COLLAPSE_THRESHOLD],
    outputRange: [18, 15],
    extrapolate: 'clamp',
  });
  const labelOpacity = scrollY.interpolate({ inputRange: [0, 18], outputRange: [1, 0], extrapolate: 'clamp' });
  const labelHeight = scrollY.interpolate({ inputRange: [0, 18], outputRange: [26, 0], extrapolate: 'clamp' });
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
  const unallocOpacity = scrollY.interpolate({ inputRange: [0, 18], outputRange: [1, 0], extrapolate: 'clamp' });
  const unallocHeight = scrollY.interpolate({ inputRange: [0, 18], outputRange: [46, 0], extrapolate: 'clamp' });
  const iconCircleScale = scrollY.interpolate({
    inputRange: [0, COLLAPSE_THRESHOLD],
    outputRange: [1, 0.82],
    extrapolate: 'clamp',
  });
  const avatarScale = scrollY.interpolate({
    inputRange: [0, COLLAPSE_THRESHOLD],
    outputRange: [1, 0.75],
    extrapolate: 'clamp',
  });

  // ---------------------------------------------------------------------------
  // DATA FETCHING
  // ---------------------------------------------------------------------------
  const fetchDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Fetch Profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single();

      if (profileData?.full_name) setSpenderName(profileData.full_name);
      if (profileData?.avatar_url) setAvatarUrl(profileData.avatar_url);

      // 2. Fetch Categories
      const { data: allCategoriesData, error: catError } = await supabase
        .from('categories')
        .select('id, name, icon, color')
        .or(`user_id.is.null,user_id.eq.${user.id}`);

      if (catError) throw catError;

      const categoryMap: { [key: string]: DynamicCategory } = {};
      (allCategoriesData || []).forEach((cat) => {
        categoryMap[cat.id] = {
          id: cat.id,
          name: cat.name,
          icon: cat.icon || 'folder',
          color: cat.color || '#E2E8F0',
          totalSpent: 0,
          allocatedAmount: 0,
          remainingAmount: 0,
        };
      });

      const today = new Date().toISOString().split('T')[0];

      // 3. Fetch Allowances
      const { data: allowanceData, error: allowanceError } = await supabase
        .from('allowances')
        .select('id, allowance_name, amount, start_date, end_date')
        .eq('spender_id', user.id)
        .lte('start_date', today)
        .gte('end_date', today)
        .order('received_at', { ascending: false })
        .limit(1);

      if (allowanceError) throw allowanceError;

      let totalSpentCounter = 0;
      let totalAllocatedCounter = 0;

      if (allowanceData && allowanceData.length > 0) {
        const activeAllowance = allowanceData[0];

        const { data: budgetsData, error: budgetsError } = await supabase
          .from('budgets')
          .select(`
            id,
            category_id,
            allocated_amount,
            allowance_id,
            expenses (
              id,
              amount
            )
          `)
          .eq('user_id', user.id)
          .eq('allowance_id', activeAllowance.id);

        if (budgetsError) throw budgetsError;

        ((budgetsData as unknown as BudgetQuery[]) || []).forEach((budget) => {
          const catId = budget.category_id;
          const currentAllocation = Number(budget.allocated_amount || 0);

          totalAllocatedCounter += currentAllocation;

          const expensesList = budget.expenses || [];
          const categoryTotalSpent = expensesList.reduce((sum: number, exp) => sum + Number(exp.amount || 0), 0);

          totalSpentCounter += categoryTotalSpent;

          if (categoryMap[catId]) {
            categoryMap[catId].budgetId = budget.id;
            categoryMap[catId].totalSpent = categoryTotalSpent;
            categoryMap[catId].allocatedAmount = currentAllocation;
            categoryMap[catId].remainingAmount = Math.max(0, currentAllocation - categoryTotalSpent);
          }
        });

        const totalAllowanceVal = Number(activeAllowance.amount);

        setSummary({
          allowanceId: activeAllowance.id,
          allowanceName: activeAllowance.allowance_name,
          totalAllowance: totalAllowanceVal,
          totalSpent: totalSpentCounter,
          remaining: totalAllowanceVal - totalSpentCounter,
          unallocated: totalAllowanceVal - totalAllocatedCounter,
        });
      } else {
        setSummary(null);
      }

      setCategories(Object.values(categoryMap));

      // 4. Fetch Upcoming Dues
      const { data: duesData, error: duesError } = await supabase
        .from('reminders')
        .select(`
          id,
          title,
          amount,
          due_date,
          status,
          categories ( name, icon )
        `)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('due_date', { ascending: true })
        .limit(5);

      if (duesError) throw duesError;
      setUpcomingDues((duesData as unknown as ReminderItem[]) || []);

      // 5. FETCH FRIENDS DIRECTLY FROM 'friends' TABLE
      try {
        const { data: friendsData, error: friendsErr } = await supabase
          .from('friends')
          .select('id, full_name, email')
          .eq('user_id', user.id)
          .order('full_name', { ascending: true });

        if (friendsErr) {
          console.error('Error fetching friends:', friendsErr.message);
        }

        if (friendsData && friendsData.length > 0) {
          const mappedFriends: FriendItem[] = friendsData.map((f: any) => ({
            id: f.id,
            full_name: f.full_name || 'Friend',
            email: f.email,
            avatar_url: null,
          }));

          setFriendsList(mappedFriends);
        } else {
          setFriendsList([]);
        }
      } catch (friendErr) {
        console.error('Error fetching friends:', friendErr);
      }

      // 6. FETCH RECENT TRANSACTIONS
      try {
        const { data: transactionData, error: transactionErr } = await supabase
          .from('expenses')
          .select(`
            id,
            amount,
            spent_at,
            description,
            budgets (
              categories (
                name,
                icon,
                color
              )
            )
          `)
          .eq('budgets.user_id', user.id)
          .order('spent_at', { ascending: false })
          .limit(5);

        if (transactionErr) {
          console.error('Error fetching transactions:', transactionErr.message);
        }

        if (transactionData && transactionData.length > 0) {
          const mappedTransactions: TransactionItem[] = (transactionData as any[]).map((t: any) => ({
            id: t.id,
            amount: t.amount,
            created_at: t.spent_at,
            description: t.description,
            categories: t.budgets?.categories || null,
          }));

          setRecentTransactions(mappedTransactions);
        } else {
          setRecentTransactions([]);
        }
      } catch (transactionErr) {
        console.error('Error fetching transactions:', transactionErr);
      }

    } catch (error: unknown) {
      console.error('Spender Dashboard Error:', extractErrorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSaveBudget = async () => {
    if (!selectedCategory || !summary) return;
    const newAllocation = parseFloat(allocateAmount);

    if (isNaN(newAllocation) || newAllocation < 0) {
      Alert.alert('Invalid Input', 'Please enter a valid amount.');
      return;
    }

    const currentAllocation = selectedCategory.allocatedAmount || 0;
    const additionalAmountNeeded = newAllocation - currentAllocation;

    if (additionalAmountNeeded > (summary?.unallocated ?? 0)) {
      Alert.alert(
        'Allocation Exceeded',
        `Insufficient unallocated balance (₱${(summary?.unallocated ?? 0).toFixed(2)} available).`
      );
      return;
    }

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (selectedCategory.budgetId) {
        await supabase
          .from('budgets')
          .update({ allocated_amount: newAllocation })
          .eq('id', selectedCategory.budgetId);
      } else {
        await supabase
          .from('budgets')
          .insert({
            user_id: user.id,
            category_id: selectedCategory.id,
            allowance_id: summary.allowanceId,
            allocated_amount: newAllocation,
          });
      }

      setModalVisible(false);
      setAllocateAmount('');
      fetchDashboardData();
    } catch (error: unknown) {
      Alert.alert('Error', extractErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const openAllocateModal = (category: DynamicCategory) => {
    if (!summary) {
      Alert.alert('No Active Allowance', 'Please set an active allowance first by your sponsor.');
      return;
    }
    setSelectedCategory(category);
    setAllocateAmount(category.allocatedAmount > 0 ? String(category.allocatedAmount) : '');
    setModalVisible(true);
  };

  const closeAllocateModal = () => {
    setModalVisible(false);
    setSelectedCategory(null);
    setAllocateAmount('');
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: COLORS.deepTeal }]}>
        <ExpoStatusBar style="light" backgroundColor={COLORS.deepTeal} />
        <ActivityIndicator size="large" color={COLORS.yellowGreen} />
      </SafeAreaView>
    );
  }

  const remainingPercentage = summary && summary.totalAllowance > 0
    ? Math.max(0, Math.min(((summary.totalAllowance - summary.totalSpent) / summary.totalAllowance) * 100, 100))
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
          },
        ]}
      >
        <Animated.View style={{ marginBottom: topRowMarginBottom }}>
          <View style={styles.topRow}>
            <View style={styles.userProfileGroup}>
              <TouchableOpacity onPress={() => router.push('/profile')}>
                <Animated.View style={{ transform: [{ scale: avatarScale }] }}>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarInitial}>{spenderName.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                </Animated.View>
              </TouchableOpacity>

              <View>
                <Animated.View style={{ height: helloHeight, opacity: helloOpacity, overflow: 'hidden', justifyContent: 'flex-end' }}>
                  <Text style={styles.helloText}>Hello,</Text>
                </Animated.View>
                <Animated.Text style={[styles.userNameText, { fontSize: userNameFontSize }]} numberOfLines={1}>
                  {spenderName}
                </Animated.Text>
              </View>
            </View>

            <View style={styles.topIconsRow}>
              <Animated.View style={{ transform: [{ scale: iconCircleScale }] }}>
                <TouchableOpacity style={styles.iconCircleModern} onPress={() => router.push('/invitations')}>
                  <Ionicons name="mail-outline" size={20} color="#FFFFFF" />
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

        <View style={styles.balanceBlock}>
          <Animated.View style={{ height: labelHeight, opacity: labelOpacity, overflow: 'hidden' }}>
            <View style={styles.balanceLabelRow}>
              <View style={styles.balanceLabelIconWrap}>
                <Ionicons name="wallet-outline" size={13} color={COLORS.deepTeal} />
              </View>
              <Text style={styles.balanceLabel}>Total Balance</Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.pillTrackOuter, { height: pillOuterHeight, borderRadius: pillOuterRadius }]}>
            <Animated.View style={[styles.pillTrack, { height: pillInnerHeight, borderRadius: pillInnerRadius }]}>
              <Animated.View style={[styles.pillFill, { width: `${remainingPercentage}%`, borderRadius: pillInnerRadius }]} />
            </Animated.View>
          </Animated.View>

          <Animated.View style={[styles.balanceAmountRow, { marginTop: amountMarginTop }]}>
            <Animated.Text style={[styles.pillAmountText, { fontSize: amountFontSize }]}>
              ₱{summary ? summary.remaining.toLocaleString('en-US') : '0'}
            </Animated.Text>
            <Animated.Text style={[styles.pillAmountDivider, { fontSize: dividerFontSize }]}>/</Animated.Text>
            <Animated.Text style={[styles.pillAmountTotal, { fontSize: totalFontSize }]}>
              ₱{summary ? summary.totalAllowance.toLocaleString('en-US') : '0'}
            </Animated.Text>
          </Animated.View>

          <Animated.View style={{ height: unallocHeight, opacity: unallocOpacity, overflow: 'hidden', justifyContent: 'flex-end' }}>
            <View style={styles.unallocatedChip}>
              <View style={styles.unallocatedDot} />
              <Text style={styles.unallocatedHint} numberOfLines={1}>
                ₱{summary ? summary.unallocated.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'} unallocated
              </Text>
            </View>
          </Animated.View>
        </View>
      </Animated.View>

      {/* ========== SCROLLABLE CONTENT ========== */}
      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.olive]} tintColor={COLORS.olive} />
        }
        showsVerticalScrollIndicator={false}
        bounces
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
      >
        {/* ========== QUICK BUDGET ========== */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Quick Budget</Text>
            <TouchableOpacity onPress={() => router.push('/Budgetcategorydetails')}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>

          {categories.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No budget folders yet.</Text>
            </View>
          ) : (
            <FlatList
              data={categories}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(cat) => `quick-budget-item-${cat.id}`}
              contentContainerStyle={{ gap: 12, paddingHorizontal: 4 }}
              renderItem={({ item: cat, index }) => {
                const theme = CARD_THEMES[index % CARD_THEMES.length];
                const hasBudget = Boolean(cat.budgetId);

                return (
                  <TouchableOpacity
                    key={cat.id}
                    activeOpacity={0.8}
                    onPress={() => openAllocateModal(cat)}
                    style={[styles.quickBudgetCard, { backgroundColor: theme.bg }]}
                  >
                    <View style={[styles.quickBudgetIconCircle, { backgroundColor: theme.iconBg }]}>
                      <Ionicons name={(cat.icon as any) || 'folder-outline'} size={18} color={theme.iconColor} />
                    </View>

                    <Text style={[styles.quickBudgetName, { color: theme.text }]} numberOfLines={1}>
                      {cat.name}
                    </Text>

                    <Text style={[styles.quickBudgetAmount, { color: theme.text }]} numberOfLines={1}>
                      {hasBudget ? `₱${cat.remainingAmount.toLocaleString()} left` : 'Tap to allocate'}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>

        {/* ========== FRIENDS LIST ========== */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Friends List</Text>
            {friendsList.length > 0 ? (
              <Text style={styles.registeredCountText}>{friendsList.length} registered</Text>
            ) : (
              <TouchableOpacity onPress={() => router.push('/friends')}>
                <Text style={styles.seeAllText}>See all</Text>
              </TouchableOpacity>
            )}
          </View>

          {friendsList.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="people-outline" size={32} color={COLORS.textMuted} style={{ marginBottom: 6 }} />
              <Text style={styles.emptyText}>No friends added yet.</Text>
            </View>
          ) : (
            <FlatList
              data={friendsList}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => `friend-${item.id}`}
              contentContainerStyle={{ gap: 16, paddingHorizontal: 4 }}
              renderItem={({ item, index }) => {
                const theme = CARD_THEMES[index % CARD_THEMES.length];
                const firstName = item.full_name ? item.full_name.trim().split(' ')[0] : 'Friend';

                return (
                  <TouchableOpacity
                    style={styles.friendAvatarCard}
                    onPress={() => router.push('/friends')}
                    activeOpacity={0.8}
                  >
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={styles.friendAvatarImage} />
                    ) : (
                      <View style={[styles.friendAvatarFallback, { backgroundColor: theme.iconBg }]}>
                        <Text style={[styles.friendAvatarInitial, { color: theme.iconColor }]}>
                          {(item.full_name || 'F').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.friendNameText} numberOfLines={1}>
                      {firstName}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
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
              <TouchableOpacity style={styles.addDueButton} onPress={() => router.push('/reminders')}>
                <Ionicons name="add-circle-outline" size={16} color={COLORS.olive} />
                <Text style={styles.addDueButtonText}>Add a reminder</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.dueCardsContainer}>
              {upcomingDues.map((due, index) => {
                const cardBgColor = PALETTE_LIGHT_CARDS[index % PALETTE_LIGHT_CARDS.length];
                const daysInfo = getDaysInfo(due.due_date);
                const categoryName = due.categories?.name || 'General';

                return (
                  <TouchableOpacity
                    key={due.id}
                    activeOpacity={0.85}
                    onPress={() => router.push('/reminders')}
                    style={[styles.reminderCardHome, { backgroundColor: cardBgColor }]}
                  >
                    <View style={styles.cardContentHome}>
                      <Text style={styles.reminderTitleHome}>{due.title}</Text>
                      <Text style={styles.reminderSubHome}>
                        ₱{Number(due.amount).toFixed(2)} • {categoryName} ({formatDueDate(due.due_date)})
                      </Text>
                    </View>

                    <View style={[
                      styles.dueBadgeHome, 
                      { backgroundColor: daysInfo.urgent ? '#FEF2F2' : 'rgba(31, 79, 89, 0.1)' }
                    ]}>
                      <Text style={[
                        styles.dueBadgeTextHome, 
                        { color: daysInfo.urgent ? '#DC2626' : COLORS.deepTeal }
                      ]}>
                        {daysInfo.text}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* ========== RECENT TRANSACTIONS ========== */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            <TouchableOpacity onPress={() => router.push('/transaction')}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>

          {recentTransactions.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="receipt-outline" size={32} color={COLORS.textMuted} style={{ marginBottom: 6 }} />
              <Text style={styles.emptyText}>No transactions yet.</Text>
            </View>
          ) : (
            <View style={styles.transactionCardsContainer}>
              {recentTransactions.map((transaction) => {
                const transactionDate = new Date(transaction.created_at);
                const today = new Date();
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);

                let dateLabel: string;
                const timeString = transactionDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

                if (transactionDate.toDateString() === today.toDateString()) {
                  dateLabel = `Today at ${timeString}`;
                } else if (transactionDate.toDateString() === yesterday.toDateString()) {
                  dateLabel = `Yesterday at ${timeString}`;
                } else {
                  dateLabel = transactionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                }

                const iconName = (transaction.categories?.icon as any) || 'receipt-outline';
                const iconColor = transaction.categories?.color || '#1F4F59';

                return (
                  <View
                    key={transaction.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      backgroundColor: '#F8FAFC',
                      borderRadius: 12,
                      gap: 10,
                    }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#EFF4F6', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                      <Ionicons name={iconName} size={18} color={iconColor} />
                    </View>

                    <View style={{ flex: 1, justifyContent: 'center', marginRight: 8 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E293B' }} numberOfLines={1} ellipsizeMode="tail">
                        {transaction.description || transaction.categories?.name || 'Transaction'}
                      </Text>
                      <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748B', marginTop: 2 }}>
                        {dateLabel}
                      </Text>
                    </View>

                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1F4F59', flexShrink: 0 }}>
                      -₱{Number(transaction.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </Animated.ScrollView>

      {/* ========== ALLOCATE / UPDATE BUDGET MODAL ========== */}
      <Modal animationType="fade" transparent visible={modalVisible} onRequestClose={closeAllocateModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconWrapper}>
                <Ionicons name="wallet-outline" size={22} color={COLORS.olive} />
              </View>
              <View>
                <Text style={styles.modalTitle}>
                  {selectedCategory?.budgetId ? 'Edit Budget' : 'Allocate Budget'}
                </Text>
                <Text style={styles.modalCategoryName}>{selectedCategory?.name}</Text>
              </View>
            </View>

            <Text style={styles.modalSubText}>
              {selectedCategory?.budgetId
                ? `Update allocation for ${selectedCategory?.name}.`
                : `Set budget allocation for ${selectedCategory?.name}.`}
            </Text>

            {summary && (
              <Text style={styles.modalHintText}>
                Unallocated available: ₱{summary.unallocated.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </Text>
            )}

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
                selectTextOnFocus
              />
            </View>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelBtn]} onPress={closeAllocateModal} disabled={submitting}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.confirmBtn]} onPress={handleSaveBudget} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>{selectedCategory?.budgetId ? 'Update' : 'Allocate'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { backgroundColor: COLORS.bg, paddingBottom: 100 },

  // Header
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
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userProfileGroup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarImage: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#FFFFFF' },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.yellowGreen,
  },
  avatarInitial: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  helloText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3, lineHeight: 26 },
  userNameText: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.82)', marginTop: 1 },
  topIconsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircleModern: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  balanceBlock: { alignItems: 'center' },
  balanceLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  balanceLabelIconWrap: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.yellowGreen, justifyContent: 'center', alignItems: 'center',
  },
  balanceLabel: { fontSize: 12, color: COLORS.white, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  pillTrackOuter: { width: '100%', padding: 4, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' },
  pillTrack: { width: '100%', borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  pillFill: { height: '100%', borderRadius: 26, backgroundColor: COLORS.cyan },
  balanceAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  pillAmountText: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.6 },
  pillAmountDivider: { fontSize: 22, color: 'rgba(255,255,255,0.3)', fontWeight: '300' },
  pillAmountTotal: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.65)' },
  unallocatedChip: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 7,
    marginTop: 10, backgroundColor: 'rgba(255,255,255,0.09)', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
  },
  unallocatedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.yellowGreen },
  unallocatedHint: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '600' },

  // Sections
  sectionBlock: { paddingHorizontal: 24, marginTop: 28 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: COLORS.darkOlive, letterSpacing: -0.3 },
  seeAllText: { fontSize: 13, color: COLORS.olive, fontWeight: '600' },

  // Quick Budget
  quickBudgetCard: {
    width: QUICK_BUDGET_CARD_WIDTH,
    padding: 16,
    borderRadius: 20,
    justifyContent: 'space-between',
    minHeight: 110,
  },
  quickBudgetIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  quickBudgetName: {
    fontSize: 13,
    fontWeight: '700',
  },
  quickBudgetAmount: {
    fontSize: 11,
    opacity: 0.8,
    marginTop: 2,
    fontWeight: '500',
  },

  // Friends List
  registeredCountText: { fontSize: 13, fontWeight: '600', color: '#1F4F59' },
  friendAvatarCard: { alignItems: 'center', width: 60 },
  friendAvatarImage: { width: 44, height: 44, borderRadius: 22 },
  friendAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendAvatarInitial: { fontSize: 16, fontWeight: '700' },
  friendNameText: { fontSize: 12, fontWeight: '700', color: '#1F4F59', marginTop: 6, textAlign: 'center', width: '100%' },

  // Upcoming Dues
  dueCardsContainer: { gap: 10 },
  reminderCardHome: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
  },
  cardContentHome: {
    flex: 1,
    marginRight: 8,
  },
  reminderTitleHome: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  reminderSubHome: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
  },
  dueBadgeHome: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dueBadgeTextHome: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Recent Transactions
  transactionCardsContainer: { gap: 10 },

  // Empty states
  emptyIconWrapper: { marginBottom: 10 },
  addDueButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingVertical: 10, paddingHorizontal: 20,
    borderRadius: 24, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#DCFCE7',
  },
  addDueButtonText: { fontSize: 13, color: COLORS.olive, fontWeight: '600' },
  emptyBox: {
    padding: 28, backgroundColor: COLORS.card, borderRadius: 22, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  emptyText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '500' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(13, 34, 4, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContainer: {
    backgroundColor: '#FFFFFF', width: '100%', padding: 28, borderRadius: 28,
    shadowColor: COLORS.darkOlive, shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  modalIconWrapper: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.darkOlive, letterSpacing: -0.3 },
  modalCategoryName: { fontSize: 13, color: COLORS.textMuted, marginTop: 2, fontWeight: '500' },
  modalSubText: { fontSize: 14, color: COLORS.textMuted, marginBottom: 12, lineHeight: 20 },
  modalHintText: { fontSize: 13, color: COLORS.olive, fontWeight: '700', marginBottom: 16 },
  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: COLORS.darkOlive, marginBottom: 8 },
  modalInput: {
    borderWidth: 1.5, borderColor: '#E2E8F0', padding: 16, borderRadius: 16, fontSize: 18, fontWeight: '600',
    color: COLORS.darkOlive, backgroundColor: COLORS.bg, paddingLeft: 20,
  },
  modalButtonsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  modalButton: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 16, justifyContent: 'center', alignItems: 'center', minWidth: 100 },
  cancelBtn: { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  cancelBtnText: { color: '#475569', fontWeight: '600', fontSize: 14 },
  confirmBtn: {
    backgroundColor: COLORS.deepTeal, shadowColor: COLORS.deepTeal, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 12, elevation: 4,
  },
  confirmBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});