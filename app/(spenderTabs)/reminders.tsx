import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    ImageBackground,
    Modal,
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
  
  const [selectedDate, setSelectedDate] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Helper para makuha ang Dynamic Month name para sa atong custom layout header
  const [currentMonthYear, setCurrentMonthYear] = useState(() => {
    const now = new Date();
    return now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  });

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
          id, title, amount, category_id, due_date, status,
          categories ( name, icon, color )
        `)
        .eq('user_id', user.id)
        .order('due_date', { ascending: true });

      if (remError) throw remError;

      if (remData) {
        setReminders(remData as unknown as Reminder[]);
        
        // Paghimo og custom markers nga naay text styling nga pareha sa reference image
        const markers: any = {};
        remData.forEach((rem) => {
          markers[rem.due_date] = {
            customStyles: {
              container: {
                borderBottomWidth: 2,
                borderBottomColor: rem.status === 'pending' ? '#EF4444' : '#10B981',
                borderRadius: 4
              },
              text: {
                fontWeight: '700',
                color: '#1E293B'
              }
            }
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

      const { error } = await supabase.from('reminders').insert({
        user_id: user.id,
        title,
        amount: parsedAmount,
        category_id: selectedCategoryId,
        due_date: selectedDate,
        status: 'pending'
      });

      if (error) throw error;

      Alert.alert('Success 🎉', 'Reminder created successfully!');
      setModalVisible(false);
      setTitle('');
      setAmount('');
      setSelectedCategoryId('');
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

              const { data: budget, error: budgetError } = await supabase
                .from('budgets')
                .select('id, remaining_amount')
                .eq('user_id', user.id)
                .eq('category_id', reminder.category_id)
                .maybeSingle();

              if (budgetError) throw budgetError;

              if (!budget) {
                Alert.alert('Missing Budget', 'You do not have a budget configured for this category yet.');
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

              Alert.alert('Payment Logged 🎉', 'Bill paid and deducted from your budget category.');
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

  const formatTimestamp = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      {/* 1st Image Navigation Header Style */}
      <View style={styles.navigationRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color="#0F172A" />
        </TouchableOpacity>
      </View>
      <View style={styles.calendarCardContainer}>
        <ImageBackground 
          source={require('../../assets/images/cover-bg.png')} // <-- Siguroha nga saktong path
          style={styles.calendarBackgroundImage}
        >
          <Calendar
            onDayPress={handleDayPress}
            markingType={'custom'}
            markedDates={{
              ...markedDates,
              [selectedDate]: {
                customStyles: {
                  container: {
                    backgroundColor: '#0F172A', // <-- Giusab ngadto sa Dark Slate para klaro kaayo mosantop sa image
                    borderRadius: 10,
                    elevation: 4,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.2,
                    shadowRadius: 3,
                  },
                  text: {
                    color: '#FFFFFF', // Putian ang text sa sulod para high contrast
                    fontWeight: '800'
                  }
                }
              }
            }}
            onMonthChange={(month) => {
              const date = new Date(month.year, month.month - 1);
              setCurrentMonthYear(date.toLocaleString('en-US', { month: 'long', year: 'numeric' }));
            }}
            hideHeader={true}
            theme={{
              backgroundColor: 'transparent',
              calendarBackground: 'transparent',
              textSectionTitleColor: '#1E293B',       
              textSectionTitleFontWeight: '700',
              dayTextColor: '#334155',              
              todayTextColor: '#0e664d',            
              textDayFontWeight: '600',
              textDayHeaderFontWeight: '700',
              textDayFontSize: 14,
              textDayHeaderFontSize: 13,
            }}
          />
        </ImageBackground>
      </View>

      {/* Bill List Feed Section (Image 1 Bottom Architecture) */}
      <View style={styles.feedWrapper}>
        <Text style={styles.sectionTitle}>Scheduled Schedules</Text>
        
        {loading ? (
          <View style={styles.centeredLoader}>
            <ActivityIndicator size="small" color="#096975" />
          </View>
        ) : (
          <FlatList
            data={reminders}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.flatListPadding}
            renderItem={({ item, index }) => {
              // Dynamic colors para sa mga card backgrounds & side-lines
              const themeColors = [
                { bg: '#d5edf3', accent: '#63d6f3', text: '#087996' }, 
                { bg: '#ECFDF5', accent: '#59f5c1', text: '#035c43' }, 
                { bg: '#FFF5F5', accent: '#abf566', text: '#254b05' }, 
                { bg: '#FFFBEB', accent: '#6bcffd', text: '#09445f' }, 
              ];
              const theme = themeColors[index % themeColors.length];

              return (
                <View style={[styles.premiumReminderCard, { backgroundColor: theme.bg }]}>
                  {/* Left Side Highlight Accent Bar */}
                  <View style={[styles.verticalAccentBar, { backgroundColor: theme.accent }]} />
                  
                  <View style={styles.cardContentWrapper}>
                    <View style={styles.textCluster}>
                      <Text style={[styles.tagCategoryLabel, { color: theme.text }]}>
                        {item.categories?.name || 'Bill Payment'}
                      </Text>
                      <Text style={styles.mainBillTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.secondaryBillMeta}>
                        {formatTimestamp(item.due_date)} • ₱{item.amount.toFixed(2)}
                      </Text>
                    </View>

                    {/* Circular Interaction Tracker */}
                    <View style={styles.actionCircleWrapper}>
                      {item.status === 'pending' ? (
                        <TouchableOpacity 
                          style={styles.payCircleButton} 
                          onPress={() => handleMarkAsPaid(item)}
                        >
                          <Ionicons name="ellipse-outline" size={22} color="#CBD5E1" />
                        </TouchableOpacity>
                      ) : (
                        <View style={[styles.completeCircleBadge, { backgroundColor: theme.accent }]}>
                          <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="calendar-clear-outline" size={32} color="#94A3B8" />
                </View>
                <Text style={styles.emptyText}>No upcoming bills scheduled.</Text>
              </View>
            }
          />
        )}
      </View>

      {/* Form Bottom Presentation Slide Drawer */}
      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Reminder ({selectedDate})</Text>
              <TouchableOpacity style={styles.closeBtnBox} onPress={() => setModalVisible(false)}>
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
    backgroundColor: '#FFFFFF',
    marginTop: 10,
  },
  
  navigationRow: {
    paddingHorizontal: 24,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginTop: 20,
    marginBottom: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    elevation: 10,
  },

  headerSection: { paddingHorizontal: 24, marginTop: 24, marginBottom: 20 },
  headerContext: { fontSize: 13, fontWeight: '600', color: '#0e81b3', marginBottom: 4 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#1E293B', letterSpacing: -0.6 },
  headerSubtitle: { fontSize: 13, color: '#94A3B8', marginTop: 6, lineHeight: 18, fontWeight: '400' },
  
  calendarCardContainer: { 
    marginHorizontal: 24,
    borderRadius: 24, 
    overflow: 'hidden', 
    elevation: 20,
  },
  calendarBackgroundImage: {
    width: '100%',
    paddingVertical: 20,
    borderRadius: 24,
  },

  feedWrapper: { 
    flex: 1, 
    paddingHorizontal: 24, 
    marginTop: 28 
  },
  sectionTitle: { 
    fontSize: 15, 
    fontWeight: '700', 
    color: '#1E293B', 
    marginBottom: 14 
  },
  flatListPadding: { 
    paddingBottom: 30,
    shadowColor: '#'
  },
  centeredLoader: { 
    marginTop: 30
  },

  // Premium List Styling Direct From Image 1 Structure
  premiumReminderCard: { 
    flexDirection: 'row',
    borderRadius: 18, 
    marginBottom: 12, 
    overflow: 'hidden',
    shadowColor: '#0f641d9a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.01,
    shadowRadius: 4,
    elevation: 10,
  },
  verticalAccentBar: {
    width: 5,
    height: '100%',
  },
  cardContentWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  textCluster: { flex: 0.82 },
  tagCategoryLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.2 },
  mainBillTitle: { fontSize: 15, fontWeight: '800', color: '#1E293B' },
  secondaryBillMeta: { fontSize: 12, color: '#64748B', marginTop: 3, fontWeight: '500' },
  
  // Interactive Tracker Rings
  actionCircleWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  payCircleButton: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completeCircleBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },

  // Empty UI Layouts
  emptyContainer: { 
    alignItems: 'center', 
    marginTop: 30, 
  },
  emptyIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyText: { 
    textAlign: 'center', 
    color: '#94A3B8', 
    fontSize: 13,
    fontWeight: '500'
  },

  // Form Presentation Components
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(15, 23, 42, 0.2)', 
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
    fontSize: 17, 
    fontWeight: '800', 
    color: '#1E293B', 
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
    backgroundColor: '#f3feff', 
    borderColor: '#006141' 
  },
  chipText: { 
    fontSize: 12, 
    color: '#475569', 
    fontWeight: '500' 
  }, 
  chipTextSelected: { 
    color: '#5cc5f6', 
    fontWeight: '700' 
  },
  saveBtn: { 
    backgroundColor: '#076981', 
    padding: 16, 
    borderRadius: 14, 
    alignItems: 'center', 
    marginTop: 8,
  },
  saveBtnText: { 
    color: '#FFFFFF', 
    fontSize: 15, 
    fontWeight: '700' 
  }
});