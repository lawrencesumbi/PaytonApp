import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

export default function RemindersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [markedDates, setMarkedDates] = useState<any>({});
  
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // --- 1. SLIDABLE WEEKLY GENERATOR (30 Days) ---
  const weeklyDays = (() => {
    const days = [];
    const start = new Date();
    // Start 7 days ago to allow backwards sliding
    start.setDate(start.getDate() - 7);
    
    for (let i = 0; i < 30; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push({
        dateString: d.toISOString().split('T')[0],
        dayNum: d.getDate(),
        label: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
      });
    }
    return days;
  })();

  const getStatusInfo = (item: Reminder) => {
    if (item.status === 'paid') return { label: 'Paid', color: '#10B981' };
    if (item.due_date < todayStr) return { label: 'Overdue', color: '#EF4444' };
    return { label: 'Upcoming', color: '#64748B' };
  };

  const filteredReminders = reminders
    .filter((r) => selectedDate ? r.due_date === selectedDate : (r.status === 'pending' || r.due_date >= todayStr))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const activeMonth = selectedDate ? new Date(selectedDate) : new Date();
  const currentMonthName = activeMonth.toLocaleDateString('en-US', { month: 'long' });

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: catData } = await supabase.from('categories').select('id, name').or(`user_id.is.null,user_id.eq.${user.id}`);
      if (catData) setCategories(catData);
      const { data: remData } = await supabase.from('reminders').select(`id, title, amount, category_id, due_date, status, categories ( name, color )`).eq('user_id', user.id);
      if (remData) {
        setReminders(remData as any);
        const markers: any = {};
        remData.forEach((r) => markers[r.due_date] = { marked: true });
        setMarkedDates(markers);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 25) }]}>
      <StatusBar style="dark" />
      
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><Ionicons name="arrow-back" size={20} color="#334155" /></TouchableOpacity>
        <Text style={styles.screenTitle}>Reminders</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Month Selection */}
      <View style={styles.monthNav}>
        <Text style={styles.monthSideText}>Aug</Text>
        <TouchableOpacity style={styles.monthActive} onPress={() => setShowFullCalendar(!showFullCalendar)}>
            <Text style={styles.monthActiveText}>{currentMonthName}</Text>
            <Ionicons name="chevron-down" size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.monthSideText}>Oct</Text>
      </View>

      {/* Calendar Strip (Slidable) */}
      <View style={styles.calWrapper}>
        {showFullCalendar ? (
          <View style={styles.fullCal}>
            <Calendar 
              onDayPress={(d: any) => { setSelectedDate(prev => prev === d.dateString ? null : d.dateString); setShowFullCalendar(false); }} 
              current={selectedDate || todayStr} 
              markedDates={{ ...markedDates, [selectedDate || '']: { selected: true, selectedColor: '#16A34A' }}} 
              theme={{ todayTextColor: '#16A34A', dotColor: '#7E9F0E' }}
            />
          </View>
        ) : (
          <View style={styles.weeklyContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weeklyScroll}>
                {weeklyDays.map((d) => {
                  const active = d.dateString === selectedDate;
                  const hasSchedule = markedDates[d.dateString];
                  return (
                    <TouchableOpacity key={d.dateString} style={[styles.dayBox, active && styles.dayBoxActive]} onPress={() => setSelectedDate(prev => prev === d.dateString ? null : d.dateString)}>
                      <Text style={[styles.dayNum, active && styles.textWhite]}>{d.dayNum}</Text>
                      <Text style={[styles.dayLabel, active && styles.textWhite]}>{d.label}</Text>
                      {/* OLIVE PING INDICATOR */}
                      {hasSchedule && <View style={[styles.olivePing, active && { backgroundColor: '#FFF' }]} />}
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
          </View>
        )}
      </View>

      {/* List Feed */}
      <View style={styles.feed}>
        <View style={styles.feedHeader}>
            <Text style={styles.feedTitle}>{selectedDate ? "On this Day" : "Upcoming Due"}</Text>
        </View>
        {loading ? <ActivityIndicator color="#10B981" style={{ marginTop: 30 }} /> : (
          <FlatList
            data={filteredReminders}
            keyExtractor={i => i.id}
            renderItem={({ item }) => {
                const status = getStatusInfo(item);
                return (
                    <View style={styles.reminderCard}>
                        <View style={[styles.verticalBar, { backgroundColor: item.categories?.color || '#10B981' }]} />
                        <View style={styles.cardBody}>
                            <Text style={styles.cardDateLabel}>{new Date(item.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</Text>
                            <Text style={styles.cardAmount}>₱{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                            <Text style={styles.cardTitle}>{item.title}</Text>
                        </View>
                        <View style={styles.actionTag}><Text style={[styles.actionTagText, { color: status.color }]}>{status.label}</Text></View>
                    </View>
                );
            }}
            contentContainerStyle={{ paddingBottom: 120 }}
            ListEmptyComponent={
              <TouchableOpacity style={styles.emptyCard} onPress={() => setModalVisible(true)}>
                  <View style={[styles.verticalBar, { backgroundColor: '#CBD5E1' }]} />
                  <View style={styles.cardBody}><Text style={styles.emptyText}>No reminders scheduled yet</Text></View>
                  <Ionicons name="add-circle" size={32} color="#10B981" />
              </TouchableOpacity>
            }
          />
        )}
      </View>

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}><Ionicons name="add" size={36} color="#FFF" /></TouchableOpacity>

      <Modal animationType="slide" transparent visible={modalVisible}>
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <TextInput style={styles.input} placeholder="Bill Name" value={title} onChangeText={setTitle} />
            <TextInput style={styles.input} placeholder="Amount" keyboardType="numeric" value={amount} onChangeText={setAmount} />
            <TouchableOpacity style={styles.saveBtn} onPress={fetchData}><Text style={styles.saveText}>Save Schedule</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={{ marginTop: 15, alignItems: 'center' }}><Text style={{ color: '#64748B' }}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  screenTitle: { fontSize: 24, fontWeight: '900', color: '#0F172A' },
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 30, marginTop: 25 },
  monthSideText: { fontSize: 13, color: '#94A3B8', fontWeight: '700' },
  monthActive: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  monthActiveText: { fontSize: 26, fontWeight: '900', color: '#0F172A' },
  
  calWrapper: { marginTop: 25, paddingHorizontal: 15 },
  weeklyContainer: { backgroundColor: '#BCC2C5', borderRadius: 25, paddingVertical: 15 },
  weeklyScroll: { paddingHorizontal: 10, gap: 12 },
  dayBox: { width: 52, height: 72, borderRadius: 18, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', elevation: 2, position: 'relative' },
  dayBoxActive: { backgroundColor: '#16A34A' },
  dayNum: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  dayLabel: { fontSize: 10, fontWeight: '800', color: '#64748B', marginTop: 2 },
  olivePing: { position: 'absolute', bottom: 8, width: 6, height: 6, borderRadius: 3, backgroundColor: '#7E9F0E' }, // OLIVE COLORED PING
  textWhite: { color: '#FFF' },

  feed: { flex: 1, paddingHorizontal: 20, marginTop: 35 },
  feedHeader: { marginBottom: 15 },
  feedTitle: { fontSize: 28, fontWeight: '900', color: '#0F172A' },
  reminderCard: { backgroundColor: '#DEE2E5', borderRadius: 25, flexDirection: 'row', alignItems: 'center', minHeight: 115, marginBottom: 20, paddingRight: 20 },
  emptyCard: { backgroundColor: '#DEE2E5', borderRadius: 25, flexDirection: 'row', alignItems: 'center', height: 100, paddingRight: 20 },
  verticalBar: { width: 6, height: '60%', borderRadius: 3, marginLeft: 20 },
  cardBody: { flex: 1, paddingLeft: 18 },
  cardDateLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 2 },
  cardAmount: { fontSize: 30, fontWeight: '900', color: '#0F172A' },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#475569' },
  emptyText: { fontSize: 15, fontWeight: '800', color: '#475569' },
  actionTag: { padding: 5 },
  actionTagText: { fontSize: 12, fontWeight: '900' },
  fab: { position: 'absolute', bottom: 40, right: 30, width: 68, height: 68, borderRadius: 34, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center', elevation: 8 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 40, borderTopRightRadius: 40, padding: 32 },
  input: { backgroundColor: '#F1F5F9', padding: 18, borderRadius: 18, marginBottom: 12, fontWeight: '600' },
  saveBtn: { backgroundColor: '#10B981', padding: 22, borderRadius: 20, alignItems: 'center' },
  saveText: { color: '#FFF', fontWeight: '900', fontSize: 18 },
  fullCal: { backgroundColor: '#FFF', borderRadius: 25, overflow: 'hidden', elevation: 4 }
});