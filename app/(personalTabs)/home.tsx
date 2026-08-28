import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  StatusBar as NativeStatusBar,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 60) / 2;

const PALETTE_COLORS = [
  '#54C9CC',
  '#1F4F59',
  '#7EA00E',
  '#DCD964',
  '#213502',
];

const AVATAR_BG_COLORS = [
  '#1B494E', // Deep Teal
  '#7EA00E', // Olive Green
  '#D97706', // Orange
  '#475569', // Slate Gray
];

interface DashboardSummary {
  incomeId: string;
  incomeName: string;
  totalIncome: number;
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
  income_id: string;
  expenses: BudgetExpense[];
}

interface ReminderItem {
  id: string;
  title: string;
  amount: number;
  due_date: string;
  status: string;
  categories?: {
    icon?: string;
  } | null;
}

interface FriendItem {
  id: string;
  full_name: string;
  avatar_url?: string | null;
}

interface RecentTx {
  id: string;
  amount: number;
  description?: string | null;
  spent_at: string;
  budgets?: { 
    categories?: { 
      name?: string;
      icon?: string;
    } 
  } | null;
}

export default function PersonalHomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [personalName, setPersonalName] = useState('Guian Sumbi');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [categories, setCategories] = useState<DynamicCategory[]>([]);
  const [upcomingDues, setUpcomingDues] = useState<ReminderItem[]>([]);
  const [friendsList, setFriendsList] = useState<FriendItem[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<RecentTx[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<DynamicCategory | null>(null);
  const [allocateAmount, setAllocateAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch Profile Data
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single();

      if (profileData?.full_name) setPersonalName(profileData.full_name);
      if (profileData?.avatar_url) setAvatarUrl(profileData.avatar_url);

      // Fetch Categories
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

      // Fetch Active Income
      const today = new Date().toISOString().split('T')[0];

      const { data: incomeData, error: incomeError } = await supabase
        .from('income')
        .select('id, source_name, amount, start_date, end_date')
        .eq('user_id', user.id)
        .lte('start_date', today)
        .gte('end_date', today)
        .order('received_at', { ascending: false })
        .limit(1);

      if (incomeError) throw incomeError;

      let totalSpentCounter = 0;
      let totalAllocatedCounter = 0;

      if (incomeData && incomeData.length > 0) {
        const activeIncome = incomeData[0];

        const { data: budgetsData, error: budgetsError } = await supabase
          .from('budgets')
          .select(`
            id,
            category_id,
            allocated_amount,
            income_id,
            expenses (
              id,
              amount
            )
          `)
          .eq('user_id', user.id)
          .eq('income_id', activeIncome.id);

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

        const totalIncomeVal = Number(activeIncome.amount);

        setSummary({
          incomeId: activeIncome.id,
          incomeName: activeIncome.source_name,
          totalIncome: totalIncomeVal,
          totalSpent: totalSpentCounter,
          remaining: totalIncomeVal - totalSpentCounter,
          unallocated: totalIncomeVal - totalAllocatedCounter,
        });
      } else {
        setSummary(null);
      }

      setCategories(Object.values(categoryMap));

      // 2-Step Fetch for Friends
      try {
        const { data: rawFriends, error: friendsErr } = await supabase
          .from('friends')
          .select('*')
          .eq('user_id', user.id)
          .limit(10);

        if (friendsErr) {
          console.error('Friends table fetch error:', friendsErr.message);
        } else if (rawFriends && rawFriends.length > 0) {
          const friendIds = rawFriends
            .map((f: any) => f.friend_id || f.user_id)
            .filter((id: string) => id && id !== user.id);

          if (friendIds.length > 0) {
            const { data: friendProfiles, error: profilesErr } = await supabase
              .from('profiles')
              .select('id, full_name, avatar_url')
              .in('id', friendIds);

            if (profilesErr) {
              console.error('Profiles fetch error for friends:', profilesErr.message);
            } else if (friendProfiles) {
              const formattedFriends: FriendItem[] = friendProfiles.map((p) => ({
                id: p.id,
                full_name: p.full_name || 'Friend',
                avatar_url: p.avatar_url || null,
              }));
              setFriendsList(formattedFriends);
            }
          } else {
            const formattedDirect: FriendItem[] = rawFriends.map((f: any) => ({
              id: f.id,
              full_name: f.full_name || f.name || 'Friend',
              avatar_url: f.avatar_url || null,
            }));
            setFriendsList(formattedDirect);
          }
        } else {
          setFriendsList([]);
        }
      } catch (err: any) {
        console.error('Friends fetching failed:', err?.message);
      }

      // Fetch Upcoming Dues
      const { data: duesData, error: duesError } = await supabase
        .from('reminders')
        .select(`
          id,
          title,
          amount,
          due_date,
          status,
          categories ( icon )
        `)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('due_date', { ascending: true })
        .limit(5);

      if (duesError) console.error('Dues fetch error:', duesError.message);
      setUpcomingDues((duesData as unknown as ReminderItem[]) || []);

      // Fetch Recent Transactions
      const { data: txData, error: txError } = await supabase
        .from('expenses')
        .select(`id, amount, description, spent_at, budgets!inner ( categories ( name, icon ) )`)
        .eq('budgets.user_id', user.id)
        .order('spent_at', { ascending: false })
        .limit(5);

      if (txError) console.error('Recent tx fetch error:', txError.message);
      setRecentTransactions((txData as RecentTx[]) || []);

    } catch (error: any) {
      console.error("Personal Dashboard Error:", error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSaveBudget = async () => {
    if (!selectedCategory || !summary) return;
    const newAllocation = parseFloat(allocateAmount);

    if (isNaN(newAllocation) || newAllocation < 0) {
      Alert.alert("Invalid Input", "Please enter a valid amount.");
      return;
    }

    const currentAllocation = selectedCategory.allocatedAmount || 0;
    const additionalAmountNeeded = newAllocation - currentAllocation;

    if (additionalAmountNeeded > (summary?.unallocated ?? 0)) {
      Alert.alert(
        "Allocation Exceeded",
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
            income_id: summary.incomeId,
            allocated_amount: newAllocation
          });
      }

      setModalVisible(false);
      setAllocateAmount('');
      fetchDashboardData();
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openAllocateModal = (category: DynamicCategory) => {
    if (!summary) {
      Alert.alert("No Active Income", "Click the income icon at the upper right corner to add your first income.");
      return;
    }
    setSelectedCategory(category);
    setAllocateAmount(category.allocatedAmount > 0 ? String(category.allocatedAmount) : '');
    setModalVisible(true);
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
      <SafeAreaView style={[styles.container, styles.loadingCenter]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#38B2AC" />
      </SafeAreaView>
    );
  }

  const remainingPercentage = summary && summary.totalIncome > 0
    ? Math.max(0, Math.min(((summary.totalIncome - summary.totalSpent) / summary.totalIncome) * 100, 100))
    : 100;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Header Section */}
      <View style={styles.headerContainer}>
        <View style={styles.welcomeRow}>
          <View style={styles.userProfileGroup}>
            <TouchableOpacity onPress={() => router.push('/profile')}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>
                    {personalName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <View>
              <Text style={styles.helloText}>Hello,</Text>
              <Text style={styles.userNameText}>{personalName}</Text>
            </View>
          </View>

          <View style={styles.iconGroupRow}>
            {/* Income Icon Button */}
            <TouchableOpacity 
              style={styles.iconCircleButton} 
              onPress={() => router.push('/income')} // Update route as needed (e.g., /income or /add-income)
            >
              <Ionicons name="card-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Reminders / Calendar Button */}
            <TouchableOpacity 
              style={styles.iconCircleButton} 
              onPress={() => router.push('/reminders')}
            >
              <Ionicons name="calendar-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Balance Card */}
        <View style={styles.balanceCardWrapper}>
          <View style={styles.totalBalanceHeader}>
            <View style={styles.walletIconCircle}>
              <Ionicons name="wallet-outline" size={14} color="#1B494E" />
            </View>
            <Text style={styles.totalBalanceLabel}>TOTAL BALANCE</Text>
          </View>

          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${remainingPercentage}%` }]} />
          </View>

          <View style={styles.amountRow}>
            <Text style={styles.mainAmountText}>
              ₱{summary ? summary.remaining.toLocaleString('en-US') : "0"}
            </Text>
            <Text style={styles.targetAmountText}>
              / ₱{summary ? summary.totalIncome.toLocaleString('en-US') : "0"}
            </Text>
          </View>
        </View>
      </View>

      {/* Main Body */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1B494E']} />
        }
      >
        <View style={styles.bodyCard}>
          {/* Quick Budget Header */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Quick Budget</Text>
            
            <View style={styles.unallocatedLeftGroup}>
              <View style={styles.greenDot} />
              <Text style={styles.unallocatedBannerText}>
                ₱{summary ? summary.unallocated.toLocaleString('en-US', { minimumFractionDigits: 2 }) : "0.00"} unallocated
              </Text>
            </View>
          </View>

          <FlatList
            data={categories}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_WIDTH + 14}
            decelerationRate="fast"
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.cardsListContainer}
            onScroll={(e) => {
              const offsetX = e.nativeEvent.contentOffset.x;
              const index = Math.round(offsetX / (CARD_WIDTH + 14));
              setCurrentCardIndex(index);
            }}
            renderItem={({ item: cat, index }) => {
              const cardBg = PALETTE_COLORS[index % PALETTE_COLORS.length];
              const hasBudget = Boolean(cat.budgetId);
              const isDark = cardBg === '#1F4F59' || cardBg === '#213502';
              const textColor = isDark ? '#FFFFFF' : '#000000';

              return (
                <TouchableOpacity
                  activeOpacity={0.88}
                  style={[styles.budgetCard, { backgroundColor: cardBg }]}
                  onPress={() => openAllocateModal(cat)}
                >
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.categoryIconCircle}>
                      <Ionicons name={(cat.icon as any) || 'folder-outline'} size={25} color="#000000" />
                    </View>
                    <View style={[styles.budgetBadgeTag, isDark && { backgroundColor: 'rgba(255, 255, 255, 0.3)' }]} />
                  </View>

                  <View style={styles.cardTextContent}>
                    <Text style={[styles.categoryNameText, { color: textColor }]} numberOfLines={1}>
                      {cat.name}
                    </Text>
                    <Text style={[styles.categoryLeftText, { color: textColor }]}>
                      {hasBudget 
                        ? `₱${cat.remainingAmount.toLocaleString('en-US')} left` 
                        : 'Tap to allocate'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />

          {categories.length > 0 && (
            <View style={styles.dotsRowContainer}>
              {categories.slice(0, 6).map((_, dotIndex) => (
                <View
                  key={dotIndex}
                  style={[
                    styles.indicatorDot,
                    currentCardIndex === dotIndex ? styles.activeDot : styles.inactiveDot,
                  ]}
                />
              ))}
            </View>
          )}

          {/* Friends Section - Exact Match sa Split Screen Image */}
          <View style={[styles.sectionHeaderRow, { marginTop: 28 }]}>
            <Text style={styles.sectionTitle}>Friends List</Text>
            <TouchableOpacity onPress={() => router.push('/split')}>
              <Text style={styles.seeAllText}>
                See all
              </Text>
            </TouchableOpacity>
          </View>

          {friendsList.length === 0 ? (
            <Text style={styles.emptyDuesText}>No friends registered yet.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendsHorizontalList}>
              {friendsList.map((f, index) => {
                const firstName = f.full_name ? f.full_name.split(' ')[0] : 'Friend';
                const circleBg = AVATAR_BG_COLORS[index % AVATAR_BG_COLORS.length];

                return (
                  <View key={f.id} style={styles.friendAvatarItem}>
                    {f.avatar_url ? (
                      <Image source={{ uri: f.avatar_url }} style={styles.friendAvatarImage} />
                    ) : (
                      <View style={[styles.friendAvatarFallback, { backgroundColor: circleBg }]}>
                        <Text style={styles.friendAvatarInitial}>
                          {firstName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.friendFirstNameText} numberOfLines={1}>
                      {f.full_name || firstName}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Upcoming Dues Section */}
          <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
            <Text style={styles.sectionTitle}>Upcoming Dues</Text>
            <TouchableOpacity onPress={() => router.push('/reminders')}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>

          {upcomingDues.length === 0 ? (
            <Text style={styles.emptyDuesText}>No upcoming pending dues.</Text>
          ) : (
            upcomingDues.map((due) => {
              const iconName = due.categories?.icon || 'calendar-outline';
              const formattedDate = new Date(due.due_date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              });

              return (
                <View key={due.id} style={styles.dueItemRow}>
                  <View style={styles.dueLeftGroup}>
                    <View style={styles.dueIconCircle}>
                      <Ionicons name={iconName as any} size={18} color="#1B494E" />
                    </View>
                    <View>
                      <Text style={styles.dueTitleText}>{due.title}</Text>
                      <Text style={styles.dueDateText}>Due {formattedDate}</Text>
                    </View>
                  </View>
                  <Text style={styles.dueAmountText}>
                    ₱{Number(due.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              );
            })
          )}

          {/* Recent Transactions Section */}
          <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            <TouchableOpacity onPress={() => router.push('/transaction')}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>

          {recentTransactions.length === 0 ? (
            <Text style={styles.emptyDuesText}>No recent transactions.</Text>
          ) : (
            recentTransactions.map((rt) => {
              const iconName = rt.budgets?.categories?.icon || 'receipt-outline';

              return (
                <View key={rt.id} style={styles.recentItemRow}>
                  <View style={styles.recentLeftGroup}>
                    <View style={styles.dueIconCircle}>
                      <Ionicons name={iconName as any} size={18} color="#1B494E" />
                    </View>
                    <View>
                      <Text style={styles.recentDesc} numberOfLines={1}>
                        {rt.description || rt.budgets?.categories?.name || 'Expense'}
                      </Text>
                      <Text style={styles.dueDateText}>
                        {new Date(rt.spent_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.recentAmount}>
                    ₱{Number(rt.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Dynamic Modal */}
      <Modal animationType="fade" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>
              {selectedCategory?.budgetId ? 'Edit Budget' : 'Allocate Budget'}
            </Text>
            <Text style={styles.modalSubText}>
              {selectedCategory?.budgetId 
                ? `Update allocation for ${selectedCategory?.name}.` 
                : `Set budget allocation for ${selectedCategory?.name}.`}
            </Text>

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

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelBtn]} onPress={() => setModalVisible(false)} disabled={submitting}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.confirmBtn]} onPress={handleSaveBudget} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>
                    {selectedCategory?.budgetId ? 'Update' : 'Allocate'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  loadingCenter: { justifyContent: 'center', alignItems: 'center' },
  headerContainer: {
    backgroundColor: '#1B494E',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? (NativeStatusBar.currentHeight ? NativeStatusBar.currentHeight + 12 : 40) : 10,
    borderBottomLeftRadius: 50,
    borderBottomRightRadius: 50,
    paddingBottom: 15,
  },
  welcomeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  userProfileGroup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarImage: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#ffffff' },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#D9E870',
  },
  avatarInitial: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  helloText: { fontSize: 16, fontWeight: '400', color: '#FFFFFF', letterSpacing: -0.5 },
  userNameText: { fontSize: 16, fontWeight: '600', color: '#E2E8F0', marginTop: -2 },
  iconGroupRow: { flexDirection: 'row', gap: 12 },
  iconCircleButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceCardWrapper: { alignItems: 'center', paddingVertical: 10 },
  totalBalanceHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  walletIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#D9E870',
    justifyContent: 'center',
    alignItems: 'center',
  },
  totalBalanceLabel: { fontSize: 12, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1.2 },
  progressBarBackground: {
    width: '100%',
    height: 38,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    padding: 4,
    justifyContent: 'center',
    marginBottom: 18,
  },
  progressBarFill: { height: '100%', backgroundColor: '#38B2AC', borderRadius: 16 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 8 },
  mainAmountText: { fontSize: 34, fontWeight: '800', color: '#FFFFFF' },
  targetAmountText: { fontSize: 16, fontWeight: '600', color: 'rgba(255, 255, 255, 0.6)' },
  scrollContent: { flexGrow: 1 },
  bodyCard: {
    flex: 1,
    backgroundColor: '#F8FAF8',
    paddingTop: 20,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1B494E' },
  seeAllText: { fontSize: 13, fontWeight: '700', color: '#1B494E', opacity: 0.8 },

  unallocatedLeftGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  greenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#84A93C' },
  unallocatedBannerText: { color: '#000000', fontSize: 13, fontWeight: '700' },
  cardsListContainer: { gap: 14, paddingVertical: 4 },
  budgetCard: {
    width: CARD_WIDTH,
    height: 155,
    borderRadius: 20,
    padding: 16,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  budgetBadgeTag: {
    width: 24,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  cardTextContent: { gap: 2 },
  categoryNameText: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  categoryLeftText: { fontSize: 13, fontWeight: '700', opacity: 0.9 },
  dotsRowContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 18 },
  indicatorDot: { height: 6, borderRadius: 3 },
  activeDot: { width: 20, backgroundColor: '#1B494E' },
  inactiveDot: { width: 6, backgroundColor: '#E2E8F0' },

  /* Friends Section - Direct Split Screen Style Match */
  friendsHorizontalList: { gap: 16, paddingVertical: 6, paddingBottom: 8 },
  friendAvatarItem: { alignItems: 'center', width: 64 },
  friendAvatarImage: { 
    width: 54, 
    height: 54, 
    borderRadius: 27, 
  },
  friendAvatarFallback: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendAvatarInitial: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  friendFirstNameText: { 
    fontSize: 13, 
    fontWeight: '700', 
    color: '#1B494E', 
    marginTop: 6, 
    textAlign: 'center' 
  },

  dueItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  dueLeftGroup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dueIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E6F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dueTitleText: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  dueDateText: { fontSize: 12, color: '#64748B', marginTop: 2 },
  dueAmountText: { fontSize: 15, fontWeight: '700', color: '#E11D48' },
  emptyDuesText: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic', marginTop: 4, marginBottom: 12 },

  recentItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  recentLeftGroup: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  recentDesc: { fontSize: 15, color: '#0F172A', fontWeight: '700' },
  recentAmount: { fontSize: 15, color: '#0F172A', fontWeight: '800' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: { backgroundColor: '#FFFFFF', width: '85%', padding: 24, borderRadius: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  modalSubText: { fontSize: 13, color: '#64748B', marginTop: 4, marginBottom: 16 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    borderRadius: 14,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
    backgroundColor: '#F8FAFC',
  },
  modalButtonsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalButton: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12 },
  cancelBtn: { backgroundColor: '#F1F5F9' },
  cancelBtnText: { color: '#475569', fontWeight: '600' },
  confirmBtn: { backgroundColor: '#1B494E' },
  confirmBtnText: { color: '#FFFFFF', fontWeight: '600' },
});