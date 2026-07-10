import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router'; // Siguradoon nato nga na-import ni og tarong
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  ImageBackground,
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
const CARD_WIDTH = width * 0.84;
const CARD_MARGIN = 10;
const SNAP_INTERVAL = CARD_WIDTH + (CARD_MARGIN * 2);

interface DashboardSummary {
  allowanceId: string;
  allowanceName: string;
  totalAllowance: number;
  totalSpent: number;
  remaining: number;
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

interface RecentExpense {
  id: string;
  expense_name: string;
  amount: number;
  category: string;
  category_icon: string;
}

export default function SpenderHomeScreen() {
  const router = useRouter(); // Initialize ang router engine
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [spenderName, setSpenderName] = useState('Spender');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null); 
  
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [categories, setCategories] = useState<DynamicCategory[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<RecentExpense[]>([]);

  const [currentCardIndex, setCurrentCardIndex] = useState(0);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<DynamicCategory | null>(null);
  const [allocateAmount, setAllocateAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const autoScrollTimer = useRef<any>(null);

  const fetchDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single();
      
      if (profileData?.full_name) setSpenderName(profileData.full_name);
      if (profileData?.avatar_url) setAvatarUrl(profileData.avatar_url); 

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
          icon: cat.icon || 'options',
          color: cat.color || '#1E463A', 
          totalSpent: 0,
          allocatedAmount: 0,
          remainingAmount: 0 
        };
      });

      const { data: allowanceData, error: allowanceError } = await supabase
        .from('allowances')
        .select('id, allowance_name, amount')
        .eq('spender_id', user.id)
        .order('received_at', { ascending: false })
        .limit(1);

      if (allowanceError) throw allowanceError;

      let totalSpentCounter = 0;
      let totalAllocatedCounter = 0;
      const allExpenses: RecentExpense[] = [];

      if (allowanceData && allowanceData.length > 0) {
        const activeAllowance = allowanceData[0];

        const { data: budgetsData, error: budgetsError } = await supabase
          .from('budgets')
          .select(`
            id,
            category_id,
            allocated_amount,
            remaining_amount,
            expenses (
              id,
              description,
              amount,
              spent_at
            )
          `)
          .eq('user_id', user.id);

        if (budgetsError) throw budgetsError;

        (budgetsData || []).forEach((budget: any) => {
          const catId = budget.category_id;
          const currentAllocation = Number(budget.allocated_amount || 0);
          const dbRemaining = Number(budget.remaining_amount || 0); 
          
          totalAllocatedCounter += currentAllocation;

          const expensesList = budget.expenses || [];
          const categoryTotalSpent = expensesList.reduce((sum: number, exp: any) => sum + Number(exp.amount), 0);
          
          totalSpentCounter += categoryTotalSpent;

          if (categoryMap[catId]) {
            categoryMap[catId].totalSpent = categoryTotalSpent;
            categoryMap[catId].allocatedAmount = currentAllocation;
            categoryMap[catId].remainingAmount = dbRemaining; 
          }

          expensesList.forEach((exp: any) => {
            if (categoryMap[catId]) {
              allExpenses.push({
                id: exp.id,
                expense_name: exp.description || 'Uncategorized Expense',
                amount: Number(exp.amount),
                category: categoryMap[catId].name,
                category_icon: categoryMap[catId].icon
              });
            }
          });
        });

        allExpenses.sort((a, b) => b.id.localeCompare(a.id));

        setSummary({
          allowanceId: activeAllowance.id,
          allowanceName: activeAllowance.allowance_name,
          totalAllowance: Number(activeAllowance.amount),
          totalSpent: totalSpentCounter,
          remaining: Number(activeAllowance.amount) - totalAllocatedCounter 
        });

        setRecentExpenses(allExpenses.slice(0, 5));
      } else {
        setSummary(null);
        setRecentExpenses([]);
      }

      setCategories(Object.values(categoryMap));

    } catch (error: any) {
      console.error("Spender Dashboard Error:", error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleAllocateBudget = async () => {
    if (!selectedCategory || !summary) return;
    const amountToAllocate = parseFloat(allocateAmount);

    if (isNaN(amountToAllocate) || amountToAllocate <= 0) {
      Alert.alert("Invalid Input", "Please enter a positive numeric value to allocate capital.");
      return;
    }

    const totalCurrentAllocated = categories.reduce((sum, cat) => sum + cat.allocatedAmount, 0);
    const unallocatedPool = summary.totalAllowance - totalCurrentAllocated;

    if (amountToAllocate > unallocatedPool) {
      Alert.alert("Allocation Denied", `You do not have enough unallocated allowance tokens. Remaining unallocated pool is ₱${unallocatedPool.toFixed(2)}.`);
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
        const newTotalAllocation = Number(existingBudget.allocated_amount) + amountToAllocate;
        const newRemainingAmount = Number(existingBudget.remaining_amount || 0) + amountToAllocate;
        
        const { error: updateError } = await supabase
          .from('budgets')
          .update({ 
            allocated_amount: newTotalAllocation,
            remaining_amount: newRemainingAmount
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
      setModalVisible(false);
      setAllocateAmount('');
      fetchDashboardData();

    } catch (error: any) {
      Alert.alert("Process Aborted", error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openAllocateModal = (category: DynamicCategory) => {
    if (!summary) {
      Alert.alert("No Allowance Active", "You cannot allocate capital folders because there is no active wallet allowance provision recorded on your account dashboard.");
      return;
    }
    setSelectedCategory(category);
    setModalVisible(true);
  };

  const startAutoScrollEngine = () => {
    stopAutoScrollEngine(); 
    if (categories.length <= 1) return;

    autoScrollTimer.current = window.setInterval(() => {
      setCurrentCardIndex((prevIndex) => {
        const nextIndex = prevIndex >= categories.length - 1 ? 0 : prevIndex + 1;
        flatListRef.current?.scrollToOffset({
          offset: nextIndex * SNAP_INTERVAL,
          animated: true
        });
        return nextIndex;
      });
    }, 3500); 
  };

  const stopAutoScrollEngine = () => {
    if (autoScrollTimer.current) {
      window.clearInterval(autoScrollTimer.current);
      autoScrollTimer.current = null;
    }
  };

  useEffect(() => {
    fetchDashboardData();
    return () => stopAutoScrollEngine(); 
  }, []);

  useEffect(() => {
    if (categories.length > 0) {
      startAutoScrollEngine();
    }
  }, [categories]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const onScrollMomentumEnd = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SNAP_INTERVAL);
    if (index >= 0 && index < categories.length) {
      setCurrentCardIndex(index);
    }
    startAutoScrollEngine();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <ActivityIndicator size="small" color="#C5FF42" />
      </SafeAreaView>
    );
  }

  const globalSpentPercentage = summary && summary.totalAllowance > 0
    ? Math.min((summary.totalSpent / summary.totalAllowance) * 100, 100)
    : 0;

return (
  <ImageBackground
    source={require("../../assets/images/cover-bg.png")}
    resizeMode="cover"
    style={styles.backgroundImage}
  >
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
        {/* 1. Header Section: Profile & Balance (Magpabilin nga transparent para makita ang ImageBackground) */}
        <View style={styles.headerBackground}>
          <View style={styles.welcomeRow}>
            <View style={styles.avatarRow}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={16} color="#042F2E" />
                </View>
              )}
              <View>
                <Text style={styles.welcomeSubtext}>Hello, Welcome Back</Text>
                <Text style={styles.welcomeText}>{spenderName}</Text>
              </View>
            </View>

            {/* Action Icon Group Container */}
            <View style={styles.iconGroupRow}>
              <TouchableOpacity 
                style={styles.iconBoxTop} 
                onPress={() => router.push('/invitations')}
              >
                <Ionicons name="mail-outline" size={20} color="#042F2E" />
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.iconBoxTop} 
                onPress={() => router.push('/reminders')} 
              >
                <Ionicons name="calendar-outline" size={20} color="#042F2E" />
                <View style={styles.calendarDot} />
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Main Financial Balance Readout */}
          <View style={styles.balanceContainer}>
            <Text style={styles.balanceLabel}>Total Remaining Balance</Text>
            <Text style={styles.mainBalance}>
              ₱{summary ? summary.remaining.toLocaleString('en-US', { minimumFractionDigits: 2 }) : "0.00"}
            </Text>
          </View>

          {/* Metric Status Micro-Bars */}
          {summary && (
            <View style={styles.headerMetricsWrapper}>
              <View style={styles.headerProgressBarBg}>
                <View style={[styles.headerProgressBarFill, { width: `${globalSpentPercentage}%` }]} />
              </View>
              <View style={styles.headerMetricsRow}>
                <Text style={styles.headerMetricText}>Allowance: ₱{summary.totalAllowance.toLocaleString()}</Text>
                <Text style={styles.headerMetricText}>Spent: ₱{summary.totalSpent.toLocaleString()}</Text>
              </View>
            </View>
          )}
        </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0D9488']} />
        }
      >
       <View style={styles.bodycard}>
  
          {/* Categories Slider Segment */}
          <View style={styles.cardsSectionContainer}>
            <FlatList
              ref={flatListRef}
              data={categories}
              horizontal
              decelerationRate="fast"
              snapToInterval={SNAP_INTERVAL}
              snapToAlignment="center"
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onScrollMomentumEnd}
              onScrollBeginDrag={stopAutoScrollEngine} 
              contentContainerStyle={{
                paddingHorizontal: (width - CARD_WIDTH) / 2 - CARD_MARGIN
              }}
              keyExtractor={(item) => item.id}
              renderItem={({ item: cat, index }) => {
              const remainingPercentage = cat.allocatedAmount > 0 
                ? Math.min((cat.remainingAmount / cat.allocatedAmount) * 100, 100) 
                : 0;

              const premiumColors = ['#aef18e', '#71f551', '#115E59', '#0eb3f5', '#05dabd'];
              const cardColor = cat.color || premiumColors[index % premiumColors.length];

            
              const darkColors = ['#115E59', '#1E463A', '#0F172A']; 
              const isDarkBackground = darkColors.includes(cardColor.toUpperCase());

              // Kung dark ang background -> Puti ang agi. Kung hayag -> Itom/Slate ang agi.
              const textColor = isDarkBackground ? '#FFFFFF' : '#0F172A';
              const subTextColor = isDarkBackground ? 'rgba(255, 255, 255, 0.75)' : '#475569';
              const badgeBg = isDarkBackground ? 'rgba(255, 255, 255, 0.2)' : 'rgba(15, 23, 42, 0.07)';
              const progressBg = isDarkBackground ? 'rgba(255, 255, 255, 0.25)' : 'rgba(15, 23, 42, 0.08)';
              const iconColor = isDarkBackground ? cardColor : '#FFFFFF'; 

              return (
                <TouchableOpacity 
                  activeOpacity={0.9}
                  onPress={() => openAllocateModal(cat)}
                  style={[styles.originalCategoryCard, { backgroundColor: cardColor }]}
                >
                  {/* TOP HEADER: Title Cluster + Remaining Badge */}
                  <View style={styles.cardMainHeader}>
                    <View style={styles.cardTitleCluster}>
                      <View style={[styles.originalIconCircle, !isDarkBackground && { backgroundColor: '#0F172A' }]}>
                        <Ionicons name={cat.icon || 'folder'} size={15} color={isDarkBackground ? iconColor : '#FFFFFF'} />
                      </View>
                      <Text style={[styles.originalCardName, { color: textColor }]} numberOfLines={1}>
                        {cat.name}
                      </Text>
                    </View>
                    <View style={[styles.remainingBadge, { backgroundColor: badgeBg }]}>
                      <Text style={[styles.remainingBadgeText, { color: textColor }]}>Remaining</Text>
                    </View>
                  </View>

                  {/* MIDDLE BODY: Main Amount Display */}
                  <View style={styles.originalCardMiddleBody}>
                    <Text style={[styles.originalRemainingAmount, { color: textColor }]}>
                      ₱{cat.remainingAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>

                  {/* BOTTOM FOOTER: Progress Bar + Metrics Row */}
                  <View style={styles.originalCardBottomFooter}>
                    <View style={[styles.originalProgressBackground, { backgroundColor: progressBg }]}>
                      <View style={[styles.originalProgressFill, { backgroundColor: textColor, width: `${remainingPercentage}%` }]} />
                    </View>
                    <View style={styles.originalCardMetricsRow}>
                      <Text style={[styles.originalFooterMetaText, { color: subTextColor }]}>
                        Budget: ₱{cat.allocatedAmount.toLocaleString()}
                      </Text>
                      <Text style={[styles.originalFooterMetaText, { color: subTextColor }]}>
                        Spent: ₱{cat.totalSpent.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
            />

            {categories.length > 0 && (
              <View style={styles.dotsRowContainer}>
                {categories.map((_, dotIndex) => (
                  <View 
                    key={dotIndex} 
                    style={[styles.indicatorDot, currentCardIndex === dotIndex ? styles.activeDot : styles.inactiveDot]} 
                  />
                ))}
              </View>
            )}
          </View>

          {/* Transaction History Section Block (Pabilin gihapon) */}
          <View style={styles.contentBody}>
            <View style={styles.recentSectionHeader}>
              <Text style={styles.sectionTitle}>Recent Transactions</Text>
              <TouchableOpacity onPress={() => router.push('/transaction')}>
                <Text style={styles.seeAllText}>See all</Text>
              </TouchableOpacity>
            </View>

            {recentExpenses.length === 0 ? (
              <View style={styles.noRecentBox}>
                <Text style={styles.noRecentText}>No captured transaction entries found.</Text>
              </View>
            ) : (
              <View style={styles.recentListContainer}>
                {recentExpenses.map((item) => (
                  <View key={item.id} style={styles.recentItem}>
                    <View style={styles.recentLeft}>
                      <View style={styles.iconBox}>
                        <Ionicons name={(item.category_icon as any) || 'cash-outline'} size={18} color="#0D9488" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recentName} numberOfLines={1}>{item.expense_name}</Text>
                        <Text style={styles.recentCategory}>{item.category}</Text>
                      </View>
                    </View>
                    <Text style={styles.recentAmount}>-₱{item.amount.toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Modal Block */}
      <Modal animationType="fade" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Fund Allocation Folder</Text>
            <Text style={styles.modalSubText}>Inject unallocated allowance pool assets directly into this designated expense folder stream.</Text>
            
            <TextInput 
              style={styles.modalInput} 
              placeholder="₱0.00" 
              placeholderTextColor="#94A3B8"
              keyboardType="numeric" 
              value={allocateAmount} 
              onChangeText={setAllocateAmount} 
              editable={!submitting}
            />
            
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelBtn]} onPress={() => setModalVisible(false)} disabled={submitting}>
                <Text style={styles.cancelBtnText}>Dismiss</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.confirmBtn]} onPress={handleAllocateBudget} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>Confirm Fund</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  </ImageBackground>
);
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
  },
  backgroundImage: { 
    flex: 1,
    width: '100%',
    height: '100%',
  },
  scrollContent: { 
    flexGrow: 1, 
  },
  
  headerBackground: { 
    paddingHorizontal: 24, 
    paddingTop: Platform.OS === 'android' ? (NativeStatusBar.currentHeight ? NativeStatusBar.currentHeight + 16 : 50) : 20, 
    paddingBottom: 20, 
    backgroundColor: 'transparent', 
  },
  welcomeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(13, 148, 136, 0.15)', justifyContent: 'center', alignItems: 'center' },
  avatarImage: { width: 44, height: 44, borderRadius: 22, resizeMode: 'cover' }, 
  welcomeSubtext: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  welcomeText: { fontSize: 17, fontWeight: '700', color: '#0F172A', marginTop: 2 },
  
  iconGroupRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBoxTop: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, position: 'relative' },
  calendarDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#0D9488', position: 'absolute', top: 12, right: 12, borderWidth: 1, borderColor: '#FFFFFF' },
  
  balanceContainer: { alignItems: 'center', marginTop: 12 },
  balanceLabel: { fontSize: 13, color: '#475569', fontWeight: '600', letterSpacing: 0.3, marginBottom: 4 },
  mainBalance: { fontSize: 38, fontWeight: '800', color: '#0F172A', letterSpacing: -1 },
  
  headerMetricsWrapper: { marginTop: 24, paddingHorizontal: 4 },
  headerProgressBarBg: { height: 6, backgroundColor: 'rgba(15, 23, 42, 0.08)', borderRadius: 10, overflow: 'hidden', marginBottom: 10 },
  headerProgressBarFill: { height: '100%', backgroundColor: '#0D9488', borderRadius: 10 },
  headerMetricsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerMetricText: { color: '#64748B', fontSize: 12, fontWeight: '600' },

  bodycard: {
    backgroundColor: '#ffffff',      
    borderTopLeftRadius: 32,          
    borderTopRightRadius: 32,         
    paddingTop: 24,                   
    paddingBottom: 40,                
    marginTop: 20,                   
    flex: 1,                          
    shadowColor: '#000000',           
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 5,
  },
  cardsSectionContainer: { 
    marginTop: 0, 
    marginBottom: 20, 
    width: '100%',
  }, 
  originalCategoryCard: {
    width: CARD_WIDTH,
    marginHorizontal: CARD_MARGIN,
    borderRadius: 24,
    padding: 20,
    minHeight: 175,
    justifyContent: 'space-between',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardMainHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  cardTitleCluster: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 10, 
    flex: 0.75 
  },
  originalIconCircle: { 
    width: 34, 
    height: 34, 
    borderRadius: 17, 
    backgroundColor: 'rgba(255, 255, 255, 0.85)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  originalCardName: { 
    fontSize: 16, 
    fontWeight: '700', 
    letterSpacing: -0.2 
  },
  remainingBadge: { 
    paddingHorizontal: 10, 
    paddingVertical: 4, 
    borderRadius: 20, 
  },
  remainingBadgeText: { 
    fontSize: 10, 
    fontWeight: '700', 
    textTransform: 'uppercase', 
    letterSpacing: 0.3 
  },
  originalCardMiddleBody: { 
    marginVertical: 6 
  },
  originalRemainingAmount: { 
    fontSize: 30, 
    fontWeight: '800', 
    letterSpacing: -0.5 
  },
  originalCardBottomFooter: { 
    gap: 10 
  },
  originalProgressBackground: { 
    height: 5, 
    borderRadius: 3, 
    overflow: 'hidden' 
  },
  originalProgressFill: { 
    height: '100%', 
    borderRadius: 3 
  },
  originalCardMetricsRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  originalFooterMetaText: { 
    fontSize: 12, 
    fontWeight: '600' 
  },

  // Carousel slider indicator dots row configuration
  dotsRowContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  indicatorDot: {
    height: 6,
    borderRadius: 3,
  },
  activeDot: {
    width: 16,
    backgroundColor: '#0F172A',
  },
  inactiveDot: {
    width: 6,
    backgroundColor: '#E2E8F0',
  },

  // Lower Transaction UI Components 
  contentBody: {
    paddingHorizontal: 24,
    marginTop: 10,
  },
  recentSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0D9488',
  },
  noRecentBox: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noRecentText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '500',
  },
  recentListContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  recentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  recentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 0.75,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#E6F4F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  recentCategory: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  recentAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EF4444',
  },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.3)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { backgroundColor: '#FFFFFF', width: '88%', padding: 24, borderRadius: 28, shadowColor: '#0F172A', shadowOpacity: 0.1, shadowRadius: 16, elevation: 10 },
  modalTitle: { fontSize: 19, fontWeight: '700', color: '#0F172A' },
  modalSubText: { fontSize: 14, color: '#64748B', marginTop: 6, marginBottom: 20, lineHeight: 20 },
  modalInput: { borderWidth: 1, borderColor: '#E2E8F0', padding: 14, borderRadius: 16, marginBottom: 22, fontSize: 20, fontWeight: '700', color: '#0F172A', backgroundColor: '#F8F9FA' },
  modalButtonsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalButton: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  cancelBtn: { backgroundColor: '#F1F5F9' },
  cancelBtnText: { color: '#475569', fontWeight: '600', fontSize: 14 },
  confirmBtn: { backgroundColor: '#0D9488', minWidth: 120 },
  confirmBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
});