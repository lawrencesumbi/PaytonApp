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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { supabase } from '../../lib/supabase';

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

interface CategorySelect {
  id: string;
  name: string;
}

export default function RemindersScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [categories, setCategories] = useState<CategorySelect[]>([]);
  const [markedDates, setMarkedDates] = useState<any>({});
  
  // Modal & Selection States
  const [selectedDate, setSelectedDate] = useState('');
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

      // 1. Fetch Categories
      const { data: catData } = await supabase
        .from('categories')
        .select('id, name')
        .or(`user_id.is.null,user_id.eq.${user.id}`);
      
      if (catData) setCategories(catData);

      // 2. Fetch Reminders
      const { data: remData, error: remError } = await supabase
        .from('reminders')
        .select(`
          id, title, amount, category_id, allowance_id, due_date, status,
          categories ( name, icon)
        `)
        .eq('user_id', user.id)
        .order('due_date', { ascending: true });

      if (remError) throw remError;

      if (remData) {
        setReminders(remData as unknown as Reminder[]);
        
        // Dynamic Calendar Markers
        const markers: any = {};
        remData.forEach((rem) => {
          markers[rem.due_date] = {
            marked: true,
            dotColor: rem.status === 'pending' ? '#EF4444' : '#10B981',
          };
        });
        setMarkedDates(markers);
      }
    } catch (error: any) {
      console.error('Error fetching reminders:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDayPress = (day: any) => {
    setSelectedDate(day.dateString);
    setModalVisible(true);
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

      // 1. Fetch the ACTIVE ALLOWANCE corresponding to the selected due date
      const { data: activeAllowance } = await supabase
        .from('allowances')
        .select('id')
        .eq('spender_id', user.id)
        .lte('start_date', selectedDate)
        .gte('end_date', selectedDate)
        .maybeSingle();

      // 2. Insert reminder linked directly to the matched active allowance
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

              // 1. Resolve active allowance ID dynamically if not already saved in reminder
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

              // 2. Fetch corresponding budget row for this specific allowance & category
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

              // 3. Deduct from remaining budget
              const newRemaining = Number(budget.remaining_amount) - reminder.amount;
              const { error: updateBudgetError } = await supabase
                .from('budgets')
                .update({ remaining_amount: newRemaining })
                .eq('id', budget.id);

              if (updateBudgetError) throw updateBudgetError;

              // 4. Log expense record
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

              // 5. Update reminder status to paid
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

  const renderReminderItem = ({ item }: { item: Reminder }) => (
    <View style={styles.reminderCard}>
      <View style={styles.reminderLeft}>
        <View style={[styles.categoryIndicator, { backgroundColor: item.categories?.color || '#10B981' }]}>
          <Text style={styles.indicatorText}>{item.categories?.name ? item.categories.name.substring(0, 2).toUpperCase() : 'RM'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.reminderTitle}>{item.title}</Text>
          <Text style={styles.reminderSub}>{item.due_date} • ₱{item.amount.toFixed(2)}</Text>
        </View>
      </View>
      
      {item.status === 'pending' ? (
        <TouchableOpacity style={styles.payBtn} onPress={() => handleMarkAsPaid(item)}>
          <Text style={styles.payBtnText}>Pay Now</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.paidBadge}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          <Text style={styles.paidText}>Paid</Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Reminders</Text>
        </View>
        <Text style={styles.headerSubtext}>Tap any calendar date to schedule an upcoming payment or bill.</Text>
      </View>

      {/* Calendar Section */}
      <View style={styles.calendarWrapper}>
        <Calendar
          onDayPress={handleDayPress}
          markedDates={{
            ...markedDates,
            [selectedDate]: { ...markedDates[selectedDate], selected: true, selectedColor: '#10B981' }
          }}
          theme={{
            backgroundColor: '#FFFFFF',
            calendarBackground: '#FFFFFF',
            textSectionTitleColor: '#94A3B8',
            selectedDayBackgroundColor: '#10B981',
            selectedDayTextColor: '#FFFFFF',
            todayTextColor: '#10B981',
            dayTextColor: '#0F172A',
            arrowColor: '#0F172A',
            monthTextColor: '#0F172A',
            indicatorColor: '#10B981',
          }}
        />
      </View>

      {/* Bill List Feed Section */}
      <View style={styles.feedWrapper}>
        <Text style={styles.sectionTitle}>Upcoming Bills</Text>
        {loading ? (
          <View style={styles.centeredLoader}>
            <ActivityIndicator size="small" color="#10B981" />
          </View>
        ) : (
          <FlatList
            data={reminders}
            keyExtractor={(item) => item.id}
            renderItem={renderReminderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.flatListPadding}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="calendar-clear-outline" size={40} color="#CBD5E1" />
                <Text style={styles.emptyText}>No upcoming bills scheduled.</Text>
              </View>
            }
          />
        )}
      </View>

      {/* Add Reminder Modal */}
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
            <TextInput style={styles.input} placeholder="e.g. Electric Bill, Rent, Internet" placeholderTextColor="#94A3B8" value={title} onChangeText={setTitle} />

            <Text style={styles.label}>Amount (₱)</Text>
            <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#94A3B8" keyboardType="numeric" value={amount} onChangeText={setAmount} />

            <Text style={styles.label}>Link to Budget Category</Text>
            <View style={styles.categoryGrid}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.categoryChip, selectedCategoryId === cat.id && styles.categoryChipSelected]}
                  onPress={() => setSelectedCategoryId(cat.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, selectedCategoryId === cat.id && styles.chipTextSelected]}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveReminder} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.saveBtnText}>Create Schedule</Text>}
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
    backgroundColor: '#F8FAFC' 
  },
  header: { 
    paddingHorizontal: 24, 
    paddingTop: Platform.OS === 'android' ? 40 : 16,
    paddingBottom: 16 
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginLeft: -4
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { 
    fontSize: 28, 
    fontWeight: '800', 
    color: '#0F172A', 
    letterSpacing: -0.75 
  },
  headerSubtext: { 
    fontSize: 14, 
    color: '#64748B', 
    marginTop: 8, 
    fontWeight: '400' 
  },
  calendarWrapper: { 
    backgroundColor: '#FFFFFF', 
    marginHorizontal: 24,
    borderRadius: 20, 
    padding: 12, 
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.02, 
    shadowRadius: 12, 
  },
  feedWrapper: { 
    flex: 1, 
    paddingHorizontal: 24, 
    marginTop: 24 
  },
  sectionTitle: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#0F172A', 
    marginBottom: 12 
  },
  flatListPadding: { 
    paddingBottom: 40 
  },
  centeredLoader: { 
    marginTop: 30, 
    alignItems: 'center' 
  },
  reminderCard: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    backgroundColor: '#FFFFFF', 
    padding: 14, 
    borderRadius: 16, 
    marginBottom: 10, 
    borderWidth: 1, 
    borderColor: '#E2E8F0'
  },
  reminderLeft: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 14, 
    flex: 1 
  },
  categoryIndicator: { 
    width: 42, 
    height: 42, 
    borderRadius: 12, 
    justifyContent: 'center', 
    alignItems: 'center'
  },
  indicatorText: { 
    color: '#FFFFFF', 
    fontSize: 12, 
    fontWeight: '700' 
  },
  reminderTitle: { 
    fontSize: 15, 
    fontWeight: '600', 
    color: '#0F172A' 
  },
  reminderSub: { 
    fontSize: 13, 
    color: '#64748B', 
    marginTop: 2 
  },
  payBtn: { 
    backgroundColor: '#0F172A', 
    paddingVertical: 8, 
    paddingHorizontal: 14, 
    borderRadius: 10 
  },
  payBtnText: { 
    color: '#FFFFFF', 
    fontSize: 12, 
    fontWeight: '600' 
  },
  paidBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4, 
    paddingRight: 6 
  },
  paidText: { 
    color: '#10B981', 
    fontSize: 13, 
    fontWeight: '600' 
  },
  emptyContainer: { 
    alignItems: 'center', 
    marginTop: 40, 
    gap: 12 
  },
  emptyText: { 
    textAlign: 'center', 
    color: '#94A3B8', 
    fontSize: 14 
  },
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(15, 23, 42, 0.3)', 
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
    color: '#0F172A', 
    letterSpacing: -0.4 
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
    backgroundColor: '#E6F4EA', 
    borderColor: '#10B981' 
  },
  chipText: { 
    fontSize: 12, 
    color: '#475569', 
    fontWeight: '500' 
  },
  chipTextSelected: { 
    color: '#10B981', 
    fontWeight: '700' 
  },
  saveBtn: { 
    backgroundColor: '#10B981', 
    padding: 16, 
    borderRadius: 14, 
    alignItems: 'center', 
    marginTop: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  saveBtnText: { 
    color: '#FFFFFF', 
    fontSize: 16, 
    fontWeight: '600' 
  }
});