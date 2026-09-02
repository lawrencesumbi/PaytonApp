import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { supabase } from '../../lib/supabase';
import { styles as splitStyles } from './split.style';

// Official Color Palette
const PALETTE = {
  cyan: '#54C9CC',
  darkTeal: '#1F4F59', // Main Accent
  limeGreen: '#7EA00E',
  lightYellow: '#DCD964',
  darkGreen: '#213502',
};

// Light Soft Tints strictly derived from our Official PALETTE
const PALETTE_LIGHT_CARDS = [
  '#E6F0F2', // Soft Cyan-Teal Tint
  '#F4F8E8', // Soft Lime Tint
  '#FAFAD8', // Soft Light Yellow Tint
];

interface Reminder {
  id: string;
  title: string;
  amount: number;
  category_id: string;
  allowance_id?: string;
  due_date: string;
  status: 'pending' | 'paid';
  categories?: {
    name: string;
    icon: string;
    color: string;
  };
}

interface GroupedReminder {
  date: string;
  items: Reminder[];
}

interface CategorySelect {
  id: string;
  name: string;
}

type FilterStatus = 'today' | 'pending' | 'paid' | 'all';

export default function RemindersScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allRawReminders, setAllRawReminders] = useState<Reminder[]>([]);
  const [groupedReminders, setGroupedReminders] = useState<GroupedReminder[]>([]);
  const [categories, setCategories] = useState<CategorySelect[]>([]);
  
  // Status Filter State
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('all');

  // Default to TODAY (YYYY-MM-DD)
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [markedDates, setMarkedDates] = useState<Record<string, boolean>>({});
  
  // Modal & Selection States
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchRemindersAndCategories = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: catData } = await supabase
        .from('categories')
        .select('id, name')
        .or(`user_id.is.null,user_id.eq.${user.id}`);
      
      if (catData) setCategories(catData);

      const { data: remData, error: remError } = await supabase
        .from('reminders')
        .select(`
          id, title, amount, category_id, allowance_id, due_date, status,
          categories!left ( name, icon, color )
        `)
        .eq('user_id', user.id);

      if (remError) throw remError;

      if (remData) {
        const rawReminders = remData as unknown as Reminder[];
        setAllRawReminders(rawReminders);

        const marks: Record<string, boolean> = {};
        rawReminders.forEach((rem) => {
          marks[rem.due_date] = true;
        });

        setMarkedDates(marks);
        processGroupedReminders(rawReminders, activeFilter);
      }
    } catch (error: any) {
      console.error('Error fetching reminders:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const processGroupedReminders = (data: Reminder[], filter: FilterStatus) => {
    let filtered = [...data];

    if (filter === 'today') {
      filtered = filtered.filter((r) => r.due_date === todayStr);
    } else if (filter === 'pending') {
      filtered = filtered.filter((r) => r.status === 'pending');
    } else if (filter === 'paid') {
      filtered = filtered.filter((r) => r.status === 'paid');
    }

    const groupedMap: Record<string, Reminder[]> = {};

    filtered.forEach((item) => {
      if (!groupedMap[item.due_date]) {
        groupedMap[item.due_date] = [];
      }
      groupedMap[item.due_date].push(item);
    });

    const sortedDates = Object.keys(groupedMap).sort((a, b) => a.localeCompare(b));

    const groupedArray: GroupedReminder[] = sortedDates.map((date) => ({
      date,
      items: groupedMap[date],
    }));

    setGroupedReminders(groupedArray);
  };

  const handleFilterChange = (filter: FilterStatus) => {
    setActiveFilter(filter);
    processGroupedReminders(allRawReminders, filter);
  };

  const resetModalState = () => {
    setModalVisible(false);
    setTitle('');
    setAmount('');
    setSelectedCategoryId('');
  };

  const handleSaveReminder = async () => {
    if (!title || !amount || !selectedCategoryId || !selectedDate) {
      Alert.alert('Missing Fields', 'Please complete all fields to save this reminder.');
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please input a valid positive amount.');
      return;
    }

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: activeAllowance } = await supabase
        .from('allowances')
        .select('id')
        .eq('spender_id', user.id)
        .lte('start_date', selectedDate)
        .gte('end_date', selectedDate)
        .maybeSingle();

      const { error } = await supabase.from('reminders').insert({
        user_id: user.id,
        title,
        amount: parsedAmount,
        category_id: selectedCategoryId,
        allowance_id: activeAllowance?.id || null,
        due_date: selectedDate,
        status: 'pending'
      });

      if (error) throw error;

      Alert.alert('Success 🎉', 'Reminder created successfully!');
      resetModalState();
      fetchRemindersAndCategories();
    } catch (error: any) {
      Alert.alert('Database Error', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkAsPaid = async (reminder: Reminder) => {
    Alert.alert(
      'Confirm Payment',
      `Mark "${reminder.title}" (₱${reminder.amount.toFixed(2)}) as paid? This will deduct the amount from your remaining budget.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Bill',
          onPress: async () => {
            try {
              setLoading(true);
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) return;

              let activeAllowanceId = reminder.allowance_id;
              
              if (!activeAllowanceId) {
                const today = new Date().toISOString().split('T')[0];
                const { data: activeAllowance } = await supabase
                  .from('allowances')
                  .select('id')
                  .eq('spender_id', user.id)
                  .lte('start_date', today)
                  .gte('end_date', today)
                  .maybeSingle();

                activeAllowanceId = activeAllowance?.id || undefined;
              }

              let budgetQuery = supabase
                .from('budgets')
                .select('id, remaining_amount, allowance_id')
                .eq('user_id', user.id)
                .eq('category_id', reminder.category_id);

              if (activeAllowanceId) {
                budgetQuery = budgetQuery.eq('allowance_id', activeAllowanceId);
              }

              const { data: budget, error: budgetError } = await budgetQuery.maybeSingle();

              if (budgetError) throw budgetError;

              if (!budget) {
                Alert.alert('Missing Budget', 'You do not have an active budget configured for this category yet.');
                setLoading(false);
                return;
              }

              if (Number(budget.remaining_amount) < reminder.amount) {
                Alert.alert('Insufficient Funds', `Your remaining category budget is only ₱${Number(budget.remaining_amount).toFixed(2)}.`);
                setLoading(false);
                return;
              }

              const newRemaining = Number(budget.remaining_amount) - reminder.amount;
              const { error: updateBudgetError } = await supabase
                .from('budgets')
                .update({ remaining_amount: newRemaining })
                .eq('id', budget.id);

              if (updateBudgetError) throw updateBudgetError;

              const { error: expenseError } = await supabase
                .from('expenses')
                .insert({
                  budget_id: budget.id,
                  allowance_id: activeAllowanceId || budget.allowance_id,
                  description: `Paid Bill: ${reminder.title}`,
                  amount: reminder.amount,
                  spent_at: new Date().toISOString()
                });

              if (expenseError) throw expenseError;

              const { error: updateRemError } = await supabase
                .from('reminders')
                .update({ status: 'paid' })
                .eq('id', reminder.id);

              if (updateRemError) throw updateRemError;

              Alert.alert('Payment Logged 🎉', 'Bill paid and deducted from your active budget category.');
              fetchRemindersAndCategories();
            } catch (error: any) {
              Alert.alert('Transaction Error', error.message);
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  useEffect(() => {
    fetchRemindersAndCategories();
  }, []);

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const dayNum = d.getDate();
    return { dayName, dayNum };
  };

  const renderGroupedRow = ({ item, index: groupIndex }: { item: GroupedReminder; index: number }) => {
    const { dayName, dayNum } = formatDateLabel(item.date);
    const isFirstGroup = groupIndex === 0;
    const isLastGroup = groupIndex === groupedReminders.length - 1;

    return (
      <View style={styles.timelineGroupRow}>
        {/* Continuous Timeline Column */}
        <View style={styles.timelineColumn}>
          <View style={[styles.timelineLine, isFirstGroup && styles.transparentLine]} />
          <View style={styles.nodeCircle}>
            <View style={styles.innerNodeDot} />
          </View>
          <View style={[styles.timelineLine, isLastGroup && styles.transparentLine]} />
        </View>

        {/* Date Number Column */}
        <View style={styles.dateLabelBox}>
          <Text style={styles.dayNameText}>{dayName}</Text>
          <Text style={styles.dayNumText}>{dayNum}</Text>
        </View>

        {/* Reminder Cards with Strict Palette Tints */}
        <View style={styles.cardsContainer}>
          {item.items.map((reminder, itemIdx) => {
            const cardBgColor = PALETTE_LIGHT_CARDS[(groupIndex + itemIdx) % PALETTE_LIGHT_CARDS.length];

            return (
              <View 
                key={`${reminder.id}-${itemIdx}`}
                style={[styles.reminderCard, { backgroundColor: cardBgColor }]}
              >
                <View style={styles.cardContent}>
                  <Text style={styles.reminderTitle}>{reminder.title}</Text>
                  <Text style={styles.reminderSub}>
                    ₱{reminder.amount.toFixed(2)} • {reminder.categories?.name || 'General'}
                  </Text>
                </View>

                {reminder.status === 'pending' ? (
                  <TouchableOpacity 
                    style={styles.payBtn} 
                    onPress={() => handleMarkAsPaid(reminder)}
                  >
                    <Text style={styles.payBtnText}>Pay</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.paidBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={PALETTE.limeGreen} />
                    <Text style={styles.paidText}>Paid</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  // Compact Custom Day Component
  const renderCustomDay = ({ date, state }: any) => {
    const isSelected = date.dateString === selectedDate;
    const hasReminder = markedDates[date.dateString];
    const isToday = date.dateString === todayStr;
    const isOtherMonth = state === 'disabled';

    return (
      <TouchableOpacity
        style={[
          styles.customDayCircle,
          isOtherMonth && styles.dayOtherMonth,
          hasReminder && styles.dayWithReminder,
          isToday && styles.dayTodayOutline,
          isSelected && styles.daySelected,
        ]}
        onPress={() => {
          setSelectedDate(date.dateString);
          setModalVisible(true);
        }}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.dayText,
            isOtherMonth && styles.dayTextDisabled,
            hasReminder && styles.dayTextWithReminder,
            isToday && styles.dayTextToday,
            isSelected && styles.dayTextSelected,
          ]}
        >
          {date.day}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      {/* Modern Header with Back Button */}
      <View style={[splitStyles.modernHeader, { justifyContent: 'space-between' }]}>
        <View style={splitStyles.headerLeft}>
          <TouchableOpacity 
            activeOpacity={0.7} 
            onPress={() => router.back()} 
            style={{ marginRight: 12 }}
          >
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={splitStyles.modernHeaderTitle}>Reminders</Text>
        </View>
      </View>

      {/* Calendar Section */}
      <View style={styles.calendarContainer}>
        <Calendar
          dayComponent={renderCustomDay}
          renderHeader={(date) => {
            const monthName = date.toString('MMMM');
            return (
              <View style={styles.headerLeftContainer}>
                <View style={styles.customMonthHeader}>
                  <Ionicons name="calendar-outline" size={14} color={PALETTE.darkTeal} />
                  <Text style={styles.customMonthText}>{monthName}</Text>
                </View>
              </View>
            );
          }}
          theme={{
            backgroundColor: '#FFFFFF',
            calendarBackground: '#FFFFFF',
            textSectionTitleColor: '#64748B',
            dayTextColor: '#334155',
            textDayHeaderFontWeight: '600',
            textDayHeaderFontSize: 11,
          }}
        />
      </View>

      {/* Filter Chips Bar */}
      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <TouchableOpacity
            style={[styles.filterChip, activeFilter === 'today' && styles.filterChipActive]}
            onPress={() => handleFilterChange('today')}
          >
            <Text style={[styles.filterText, activeFilter === 'today' && styles.filterTextActive]}>Today</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, activeFilter === 'pending' && styles.filterChipActive]}
            onPress={() => handleFilterChange('pending')}
          >
            <Text style={[styles.filterText, activeFilter === 'pending' && styles.filterTextActive]}>Pending</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, activeFilter === 'paid' && styles.filterChipActive]}
            onPress={() => handleFilterChange('paid')}
          >
            <Text style={[styles.filterText, activeFilter === 'paid' && styles.filterTextActive]}>Paid</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, activeFilter === 'all' && styles.filterChipActive]}
            onPress={() => handleFilterChange('all')}
          >
            <Text style={[styles.filterText, activeFilter === 'all' && styles.filterTextActive]}>All</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Feed List */}
      <View style={styles.feedWrapper}>
        {loading ? (
          <View style={styles.centeredLoader}>
            <ActivityIndicator size="small" color={PALETTE.darkTeal} />
          </View>
        ) : (
          <FlatList
            data={groupedReminders}
            keyExtractor={(item) => item.date}
            renderItem={renderGroupedRow}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.flatListPadding}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="calendar-outline" size={36} color="#CBD5E1" />
                <Text style={styles.emptyText}>No reminders found for this filter.</Text>
              </View>
            }
          />
        )}
      </View>

      {/* Modal */}
      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={resetModalState}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Reminder ({selectedDate})</Text>
              <TouchableOpacity style={styles.closeBtnBox} onPress={resetModalState}>
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Bill Name</Text>
            <TextInput 
              style={styles.input} 
              placeholder="e.g. Electric Bill, Rent, Internet" 
              placeholderTextColor="#94A3B8" 
              value={title} 
              onChangeText={setTitle} 
            />

            <Text style={styles.label}>Amount (₱)</Text>
            <TextInput 
              style={styles.input} 
              placeholder="0.00" 
              placeholderTextColor="#94A3B8" 
              keyboardType="numeric" 
              value={amount} 
              onChangeText={setAmount} 
            />

            <Text style={styles.label}>Category</Text>
            <View style={styles.categoryGrid}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.categoryChip, selectedCategoryId === cat.id && styles.categoryChipSelected]}
                  onPress={() => setSelectedCategoryId(cat.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, selectedCategoryId === cat.id && styles.chipTextSelected]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveReminder} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>Create Schedule</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#FFFFFF' 
  },
  
  /* Split-style Dark Teal Header Styles */
  modernHeader: {
    backgroundColor: PALETTE.darkTeal,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 32 : 12,
    paddingBottom: 16,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  modernHeaderTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  calendarContainer: { 
    backgroundColor: '#FFFFFF', 
    paddingHorizontal: 12,
    paddingBottom: 0,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    marginTop: -5,
  },

  /* Left Header Styling */
  headerLeftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customMonthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F0F2',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 6,
  },
  customMonthText: {
    fontSize: 13,
    fontWeight: '700',
    color: PALETTE.darkTeal,
  },

  /* Custom Circular Days */
  customDayCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 1,
  },
  dayOtherMonth: {
    backgroundColor: 'transparent',
  },
  dayWithReminder: {
    backgroundColor: '#E6F0F2',
  },
  dayTodayOutline: {
    borderWidth: 1.5,
    borderColor: PALETTE.darkTeal,
    backgroundColor: '#FFFFFF',
  },
  daySelected: {
    backgroundColor: PALETTE.darkTeal,
    borderWidth: 0,
  },
  dayText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
  },
  dayTextDisabled: {
    color: '#CBD5E1',
  },
  dayTextWithReminder: {
    color: PALETTE.darkTeal,
    fontWeight: '700',
  },
  dayTextToday: {
    color: PALETTE.darkTeal,
    fontWeight: '800',
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  /* Status Filter Section */
  filterSection: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
  },
  filterScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  filterChipActive: {
    backgroundColor: PALETTE.darkTeal,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },

  feedWrapper: { 
    flex: 1, 
    paddingHorizontal: 16, 
    paddingTop: 12 
  },
  flatListPadding: { 
    paddingBottom: 30 
  },
  centeredLoader: { 
    marginTop: 30, 
    alignItems: 'center' 
  },

  /* Continuous Timeline Nodes Structure */
  timelineGroupRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 12,
  },
  timelineColumn: {
    width: 20,
    alignItems: 'center',
    marginRight: 10,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: '#E2E8F0',
  },
  transparentLine: {
    backgroundColor: 'transparent',
  },
  nodeCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: PALETTE.darkTeal,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
  },
  innerNodeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: PALETTE.darkTeal,
  },

  /* Date Badge Column */
  dateLabelBox: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  dayNameText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  dayNumText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },

  /* Cards List Container */
  cardsContainer: {
    flex: 1,
    gap: 10,
  },
  reminderCard: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingVertical: 14, 
    paddingHorizontal: 16, 
    borderRadius: 18, 
  },
  cardContent: {
    flex: 1,
    marginRight: 8,
  },
  reminderTitle: { 
    fontSize: 14, 
    fontWeight: '700', 
    color: '#1E293B' 
  },
  reminderSub: { 
    fontSize: 11, 
    color: '#475569', 
    marginTop: 2 
  },
  payBtn: { 
    paddingVertical: 6, 
    paddingHorizontal: 14, 
    borderRadius: 12,
    backgroundColor: PALETTE.darkTeal,
  },
  payBtnText: { 
    color: '#FFFFFF', 
    fontSize: 11, 
    fontWeight: '700' 
  },
  paidBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4, 
  },
  paidText: { 
    fontSize: 11, 
    fontWeight: '700',
    color: PALETTE.limeGreen,
  },

  emptyContainer: { 
    alignItems: 'center', 
    marginTop: 30, 
    gap: 8 
  },
  emptyText: { 
    textAlign: 'center', 
    color: '#94A3B8', 
    fontSize: 13 
  },

  /* Modal Form Controls */
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(15, 23, 42, 0.4)', 
    justifyContent: 'flex-end' 
  },
  modalContainer: { 
    backgroundColor: '#FFFFFF', 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24, 
    padding: 24, 
    maxHeight: '85%' 
  },
  modalHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 20 
  },
  modalTitle: { 
    fontSize: 18, 
    fontWeight: '800', 
    color: PALETTE.darkTeal, 
  },
  closeBtnBox: { 
    width: 32, 
    height: 32, 
    borderRadius: 10, 
    backgroundColor: '#F1F5F9', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  label: { 
    fontSize: 13, 
    fontWeight: '600', 
    color: '#64748B', 
    marginBottom: 8 
  },
  input: { 
    borderWidth: 1, 
    borderColor: '#E2E8F0', 
    padding: 12, 
    borderRadius: 12, 
    marginBottom: 16, 
    backgroundColor: '#F8FAFC', 
    fontSize: 15, 
    color: '#0F172A' 
  },
  categoryGrid: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: 8, 
    marginBottom: 24 
  },
  categoryChip: { 
    paddingVertical: 8, 
    paddingHorizontal: 14, 
    borderRadius: 20, 
    backgroundColor: '#F1F5F9', 
    borderWidth: 1, 
    borderColor: '#E2E8F0' 
  },
  categoryChipSelected: { 
    backgroundColor: '#E6F0F2', 
    borderColor: PALETTE.darkTeal 
  },
  chipText: { 
    fontSize: 12, 
    color: '#475569', 
    fontWeight: '500' 
  },
  chipTextSelected: { 
    color: PALETTE.darkTeal, 
    fontWeight: '700' 
  },
  saveBtn: { 
    backgroundColor: PALETTE.darkTeal, 
    padding: 16, 
    borderRadius: 14, 
    alignItems: 'center', 
    marginTop: 8,
  },
  saveBtnText: { 
    color: '#FFFFFF', 
    fontSize: 16, 
    fontWeight: '600' 
  }
});