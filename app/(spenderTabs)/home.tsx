import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
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
  totalSpent: number;
  allocatedAmount: number;
  remainingAmount: number;
  budgetId?: string; // Tracks if budget already exists
}

export default function SpenderHomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [spenderName, setSpenderName] = useState('Guian Sumbi');
  
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [categories, setCategories] = useState<DynamicCategory[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<DynamicCategory | null>(null);
  const [allocateAmount, setAllocateAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();
      
      if (profileData?.full_name) setSpenderName(profileData.full_name);

      const { data: allCategoriesData, error: catError } = await supabase
        .from('categories')
        .select('id, name, icon')
        .or(`user_id.is.null,user_id.eq.${user.id}`);

      if (catError) throw catError;

      const categoryMap: { [key: string]: DynamicCategory } = {};
      (allCategoriesData || []).forEach((cat) => {
        categoryMap[cat.id] = {
          id: cat.id,
          name: cat.name,
          icon: cat.icon || 'folder',
          totalSpent: 0,
          allocatedAmount: 0,
          remainingAmount: 0,
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

      if (allowanceData && allowanceData.length > 0) {
        const activeAllowance = allowanceData[0];

        const { data: budgetsData, error: budgetsError } = await supabase
          .from('budgets')
          .select(`
            id,
            category_id,
            allocated_amount,
            remaining_amount,
            allowance_id,
            expenses (
              id,
              amount
            )
          `)
          .eq('user_id', user.id)
          .eq('allowance_id', activeAllowance.id);

        if (budgetsError) throw budgetsError;

        (budgetsData || []).forEach((budget: any) => {
          const catId = budget.category_id;
          const currentAllocation = Number(budget.allocated_amount || 0);
          
          totalAllocatedCounter += currentAllocation;

          const expensesList = budget.expenses || [];
          const categoryTotalSpent = expensesList.reduce((sum: number, exp: any) => sum + Number(exp.amount), 0);
          
          totalSpentCounter += categoryTotalSpent;

          if (categoryMap[catId]) {
            categoryMap[catId].budgetId = budget.id;
            categoryMap[catId].totalSpent = categoryTotalSpent;
            categoryMap[catId].allocatedAmount = currentAllocation;
            categoryMap[catId].remainingAmount = currentAllocation - categoryTotalSpent; 
          }
        });

        const totalAllowanceVal = Number(activeAllowance.amount);

        setSummary({
          allowanceId: activeAllowance.id,
          allowanceName: activeAllowance.allowance_name,
          totalAllowance: totalAllowanceVal,
          totalSpent: totalSpentCounter,
          remaining: totalAllowanceVal - totalSpentCounter,
          unallocated: totalAllowanceVal - totalAllocatedCounter
        });
      } else {
        setSummary(null);
      }

      setCategories(Object.values(categoryMap));

    } catch (error: any) {
      console.error("Spender Dashboard Error:", error.message);
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

    // Compute net difference for unallocated check
    const currentAllocation = selectedCategory.allocatedAmount || 0;
    const additionalAmountNeeded = newAllocation - currentAllocation;

    if (additionalAmountNeeded > summary.unallocated) {
      Alert.alert(
        "Allocation Exceeded",
        `Insufficient unallocated balance (₱${summary.unallocated.toFixed(2)} available).`
      );
      return;
    }

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const newRemaining = newAllocation - selectedCategory.totalSpent;

      if (selectedCategory.budgetId) {
        // Edit existing budget record
        await supabase
          .from('budgets')
          .update({ 
            allocated_amount: newAllocation,
            remaining_amount: newRemaining
          })
          .eq('id', selectedCategory.budgetId);
      } else {
        // Create new budget record
        await supabase
          .from('budgets')
          .insert({
            user_id: user.id,
            category_id: selectedCategory.id,
            allowance_id: summary.allowanceId,
            allocated_amount: newAllocation,
            remaining_amount: newRemaining
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
      Alert.alert("No Allowance Active", "Please set an active allowance first.");
      return;
    }
    setSelectedCategory(category);
    // Pre-fill input if budget already exists
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

  const spentPercentage = summary && summary.totalAllowance > 0
    ? Math.min((summary.totalSpent / summary.totalAllowance) * 100, 100)
    : 0;

  const presetCardColors = ['#7A9A9E', '#C2D879', '#8DB3A8', '#D6C878'];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Header Section */}
      <View style={styles.headerContainer}>
        <View style={styles.welcomeRow}>
          <View>
            <Text style={styles.helloText}>Hello,</Text>
            <Text style={styles.userNameText}>{spenderName}</Text>
          </View>

          <View style={styles.iconGroupRow}>
            <TouchableOpacity style={styles.iconCircleButton} onPress={() => router.push('/reminders')}>
              <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconCircleButton} onPress={() => router.push('/invitations')}>
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
            <View style={[styles.progressBarFill, { width: `${spentPercentage || 10}%` }]} />
          </View>

          <View style={styles.amountRow}>
            <Text style={styles.mainAmountText}>
              ₱{summary ? summary.remaining.toLocaleString('en-US') : "0"}
            </Text>
            <Text style={styles.targetAmountText}>
              / ₱{summary ? summary.totalAllowance.toLocaleString('en-US') : "0"}
            </Text>
          </View>

          <View style={styles.unallocatedPillContainer}>
            <TouchableOpacity style={styles.unallocatedPill}>
              <View style={styles.greenDot} />
              <Text style={styles.unallocatedText}>
                ₱{summary ? summary.unallocated.toLocaleString('en-US', { minimumFractionDigits: 2 }) : "0.00"} unallocated
              </Text>
              <Ionicons name="chevron-forward" size={14} color="#A3E635" />
            </TouchableOpacity>
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
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Quick Budget</Text>
            <TouchableOpacity>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
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
              const cardBg = presetCardColors[index % presetCardColors.length];
              const hasBudget = Boolean(cat.budgetId);

              return (
                <TouchableOpacity
                  activeOpacity={0.88}
                  style={[styles.budgetCard, { backgroundColor: cardBg }]}
                  onPress={() => openAllocateModal(cat)}
                >
                  <View style={styles.categoryIconCircle}>
                    <Ionicons name={cat.icon as any || 'folder-outline'} size={18} color="#1B494E" />
                  </View>

                  <View style={styles.cardTextContent}>
                    <Text style={styles.categoryNameText} numberOfLines={1}>
                      {cat.name}
                    </Text>
                    <Text style={styles.categoryLeftText}>
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
              {categories.slice(0, 7).map((_, dotIndex) => (
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

          <View style={[styles.sectionHeaderRow, { marginTop: 28 }]}>
            <Text style={styles.sectionTitle}>Upcoming Dues</Text>
            <TouchableOpacity>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Dynamic Modal (Add vs Edit) */}
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
  container: { flex: 1, backgroundColor: '#1B494E' },
  loadingCenter: { justifyContent: 'center', alignItems: 'center' },
  headerContainer: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? (NativeStatusBar.currentHeight ? NativeStatusBar.currentHeight + 12 : 40) : 10,
    paddingBottom: 20,
  },
  welcomeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  helloText: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  userNameText: { fontSize: 18, fontWeight: '600', color: '#E2E8F0', marginTop: -2 },
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
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 16 },
  mainAmountText: { fontSize: 34, fontWeight: '800', color: '#FFFFFF' },
  targetAmountText: { fontSize: 16, fontWeight: '600', color: 'rgba(255, 255, 255, 0.6)' },
  unallocatedPillContainer: { alignItems: 'center' },
  unallocatedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  greenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#A3E635' },
  unallocatedText: { color: '#E2E8F0', fontSize: 13, fontWeight: '600' },
  scrollContent: { flexGrow: 1 },
  bodyCard: {
    flex: 1,
    backgroundColor: '#F8FAF8',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
  seeAllText: { fontSize: 13, fontWeight: '700', color: '#84A93C' },
  cardsListContainer: { gap: 14 },
  budgetCard: {
    width: CARD_WIDTH,
    height: 150,
    borderRadius: 24,
    padding: 16,
    justifyContent: 'space-between',
  },
  categoryIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTextContent: { gap: 4 },
  categoryNameText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  categoryLeftText: { fontSize: 12, fontWeight: '600', color: 'rgba(255, 255, 255, 0.85)' },
  dotsRowContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 18 },
  indicatorDot: { height: 6, borderRadius: 3 },
  activeDot: { width: 20, backgroundColor: '#1B494E' },
  inactiveDot: { width: 6, backgroundColor: '#E2E8F0' },
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