import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Modal,
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

// Day-box geometry for the scroll-driven "pop" animation below. These match
// dayBox's own width and weeklyScroll's gap, so the animation's input
// ranges line up with where each box actually sits in the scroll content.
const DAY_BOX_WIDTH = 52;
const DAY_BOX_GAP = 12;
const ITEM_SPACING = DAY_BOX_WIDTH + DAY_BOX_GAP;

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
  // Keeps the Modal mounted slightly longer than `showFullCalendar` itself,
  // so the closing animation can finish playing before the Modal actually
  // unmounts (otherwise it would just vanish instantly on dismiss).
  const [calendarModalMounted, setCalendarModalMounted] = useState(false);
  const calendarAnim = useRef(new Animated.Value(0)).current;
  // Recomputed fresh on every mount/render from the device clock, so "today"
  // always reflects the real current date rather than a fixed value — on
  // July 13th this is "2026-07-13", tomorrow it updates itself automatically.
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // The month currently shown in the header/overlay when no specific day is
  // selected — separate from `selectedDate` so the prev/next month arrows
  // can browse months without needing to also pick a day.
  const [viewMonthDate, setViewMonthDate] = useState(new Date());

  // Drives the day-strip's scroll-position-based "pop" animation.
  const weekScrollX = useRef(new Animated.Value(0)).current;
  // Small press-bounce feedback for the prev/next month labels.
  const prevMonthScale = useRef(new Animated.Value(1)).current;
  const nextMonthScale = useRef(new Animated.Value(1)).current;
  
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (showFullCalendar) {
      setCalendarModalMounted(true);
      Animated.spring(calendarAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 9,
        tension: 60,
      }).start();
    } else {
      Animated.timing(calendarAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(() => setCalendarModalMounted(false));
    }
  }, [showFullCalendar]);

  const bounce = (anim: Animated.Value) => {
    Animated.sequence([
      Animated.spring(anim, { toValue: 0.85, useNativeDriver: true, friction: 6 }),
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 5 }),
    ]).start();
  };

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

  const activeMonth = selectedDate ? new Date(selectedDate) : viewMonthDate;
  const currentMonthName = activeMonth.toLocaleDateString('en-US', { month: 'long' });

  const prevMonthDate = new Date(activeMonth.getFullYear(), activeMonth.getMonth() - 1, 1);
  const nextMonthDate = new Date(activeMonth.getFullYear(), activeMonth.getMonth() + 1, 1);
  const prevMonthName = prevMonthDate.toLocaleDateString('en-US', { month: 'short' });
  const nextMonthName = nextMonthDate.toLocaleDateString('en-US', { month: 'short' });

  const goToMonth = (targetMonth: Date, anim: Animated.Value) => {
    bounce(anim);
    setSelectedDate(null);
    setViewMonthDate(targetMonth);
    setShowFullCalendar(true);
  };

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
        <Animated.View style={{ transform: [{ scale: prevMonthScale }] }}>
          <TouchableOpacity
            style={styles.monthSideBtn}
            onPress={() => goToMonth(prevMonthDate, prevMonthScale)}
          >
            <Text style={styles.monthSideText}>{prevMonthName}</Text>
          </TouchableOpacity>
        </Animated.View>

        <TouchableOpacity style={styles.monthActive} onPress={() => setShowFullCalendar(!showFullCalendar)}>
            <Text style={styles.monthActiveText}>{currentMonthName}</Text>
            <Ionicons name="chevron-down" size={20} color="#0F172A" />
        </TouchableOpacity>

        <Animated.View style={{ transform: [{ scale: nextMonthScale }] }}>
          <TouchableOpacity
            style={styles.monthSideBtn}
            onPress={() => goToMonth(nextMonthDate, nextMonthScale)}
          >
            <Text style={styles.monthSideText}>{nextMonthName}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Calendar Strip (Slidable) */}
      <View style={styles.calWrapper}>
        <View style={styles.weeklyContainer}>
          <Animated.ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.weeklyScroll}
            scrollEventThrottle={16}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: weekScrollX } } }],
              { useNativeDriver: true }
            )}
          >
              {weeklyDays.map((d, index) => {
                const active = d.dateString === selectedDate;
                const isToday = d.dateString === todayStr;
                const hasSchedule = markedDates[d.dateString];
                // A due that lands on today specifically gets flagged in a
                // more urgent color than a due on some other day.
                const pingColor = hasSchedule && isToday ? '#DC2626' : '#7E9F0E';

                // "Watch dial" pop: as this box's position passes under
                // the scroll's current offset, it briefly scales up and
                // lifts slightly, like a tick rotating into focus, then
                // settles back down as it moves past center.
                const inputRange = [
                  (index - 1) * ITEM_SPACING,
                  index * ITEM_SPACING,
                  (index + 1) * ITEM_SPACING,
                ];
                const scale = weekScrollX.interpolate({
                  inputRange,
                  outputRange: [0.88, 1.08, 0.88],
                  extrapolate: 'clamp',
                });
                const translateY = weekScrollX.interpolate({
                  inputRange,
                  outputRange: [4, -6, 4],
                  extrapolate: 'clamp',
                });

                return (
                  <Animated.View
                    key={d.dateString}
                    style={{ transform: [{ scale }, { translateY }] }}
                  >
                    <TouchableOpacity
                      style={[
                        styles.dayBox,
                        active && styles.dayBoxActive,
                        isToday && !active && styles.dayBoxToday,
                        isToday && active && styles.dayBoxTodayActive,
                      ]}
                      onPress={() => setSelectedDate(prev => prev === d.dateString ? null : d.dateString)}
                    >
                      <Text style={[styles.dayNum, active && styles.textWhite]}>{d.dayNum}</Text>
                      <Text style={[styles.dayLabel, active && styles.textWhite]}>{d.label}</Text>
                      {isToday && (
                        <Text style={[styles.todayTag, active && styles.textWhite]} numberOfLines={1}>
                          TODAY
                        </Text>
                      )}
                      {hasSchedule && (
                        <View style={[styles.olivePing, { backgroundColor: pingColor }, active && { backgroundColor: '#FFF' }]} />
                      )}
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
          </Animated.ScrollView>
        </View>
      </View>

      {/* ========== FULL MONTH CALENDAR OVERLAY ==========
          Opened from the month dropdown or the prev/next month labels.
          animationType is "none" here on purpose — the fade/scale/slide is
          driven manually by calendarAnim below, so open AND close both get
          a real animation instead of relying on Modal's built-in (which
          only handles the appear, not a custom exit). */}
      <Modal
        visible={calendarModalMounted}
        transparent
        animationType="none"
        onRequestClose={() => setShowFullCalendar(false)}
      >
        <View style={styles.calendarOverlayRoot}>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: calendarAnim }]}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
          </Animated.View>
          {/* Tapping the dimmed backdrop (anywhere outside the card) closes
              the overlay; the card itself sits on top and handles its own
              touches, so taps inside it won't fall through to this. */}
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowFullCalendar(false)}
          />

          <Animated.View
            style={[
              styles.calendarOverlayCard,
              {
                opacity: calendarAnim,
                transform: [
                  {
                    scale: calendarAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.88, 1],
                    }),
                  },
                  {
                    translateY: calendarAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [24, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.calendarOverlayHeader}>
              <Text style={styles.calendarOverlayTitle}>{currentMonthName}</Text>
              <TouchableOpacity
                style={styles.calendarOverlayClose}
                onPress={() => setShowFullCalendar(false)}
              >
                <Ionicons name="close" size={20} color="#0F172A" />
              </TouchableOpacity>
            </View>
            <Calendar
              onDayPress={(d: any) => { setSelectedDate(prev => prev === d.dateString ? null : d.dateString); setShowFullCalendar(false); }}
              current={selectedDate || activeMonth.toISOString().split('T')[0]}
              markedDates={{ ...markedDates, [selectedDate || '']: { selected: true, selectedColor: '#16A34A' } }}
              theme={{ todayTextColor: '#16A34A', dotColor: '#7E9F0E' }}
            />
          </Animated.View>
        </View>
      </Modal>

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
                const isDueToday = item.due_date === todayStr && item.status !== 'paid';
                return (
                    <View style={[styles.reminderCard, isDueToday && styles.reminderCardDueToday]}>
                        <View style={[styles.verticalBar, { backgroundColor: item.categories?.color || '#10B981' }]} />
                        <View style={styles.cardBody}>
                            <View style={styles.cardDateRow}>
                              <Text style={styles.cardDateLabel}>{new Date(item.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</Text>
                              {isDueToday && (
                                <View style={styles.dueTodayBadge}>
                                  <Text style={styles.dueTodayBadgeText}>Due today</Text>
                                </View>
                              )}
                            </View>
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
  monthSideBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  monthActive: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  monthActiveText: { fontSize: 26, fontWeight: '900', color: '#0F172A' },
  
  calWrapper: { marginTop: 25, paddingHorizontal: 15 },
  weeklyContainer: { backgroundColor: '#BCC2C5', borderRadius: 25, paddingVertical: 15 },
  weeklyScroll: { paddingHorizontal: 10, gap: DAY_BOX_GAP },
  dayBox: { width: DAY_BOX_WIDTH, height: 72, borderRadius: 18, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', elevation: 2, position: 'relative' },
  dayBoxActive: { backgroundColor: '#16A34A' },
  // "Today" gets its own ring — independent of whether the user has also
  // tapped to select it — so scrolling past it always makes it identifiable
  // at a glance, per the real-time-date requirement.
  dayBoxToday: { borderWidth: 2, borderColor: '#16A34A' },
  dayBoxTodayActive: { borderWidth: 2, borderColor: '#FFFFFF' },
  todayTag: { fontSize: 7, fontWeight: '900', color: '#16A34A', letterSpacing: 0.4, marginTop: 1 },
  dayNum: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  dayLabel: { fontSize: 10, fontWeight: '800', color: '#64748B', marginTop: 2 },
  olivePing: { position: 'absolute', bottom: 8, width: 6, height: 6, borderRadius: 3, backgroundColor: '#7E9F0E' }, // color swapped per-item: red if due today, olive otherwise
  textWhite: { color: '#FFF' },

  feed: { flex: 1, paddingHorizontal: 20, marginTop: 35 },
  feedHeader: { marginBottom: 15 },
  feedTitle: { fontSize: 28, fontWeight: '900', color: '#0F172A' },
  reminderCard: { backgroundColor: '#DEE2E5', borderRadius: 25, flexDirection: 'row', alignItems: 'center', minHeight: 115, marginBottom: 20, paddingRight: 20 },
  reminderCardDueToday: { borderWidth: 2, borderColor: '#DC2626' },
  emptyCard: { backgroundColor: '#DEE2E5', borderRadius: 25, flexDirection: 'row', alignItems: 'center', height: 100, paddingRight: 20 },
  verticalBar: { width: 6, height: '60%', borderRadius: 3, marginLeft: 20 },
  cardBody: { flex: 1, paddingLeft: 18 },
  cardDateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  cardDateLabel: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  dueTodayBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  dueTodayBadgeText: { fontSize: 10, fontWeight: '800', color: '#DC2626' },
  cardAmount: { fontSize: 30, fontWeight: '900', color: '#0F172A' },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#475569' },
  emptyText: { fontSize: 15, fontWeight: '800', color: '#475569' },
  actionTag: { padding: 5 },
  actionTagText: { fontSize: 12, fontWeight: '900' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 40, borderTopRightRadius: 40, padding: 32 },
  input: { backgroundColor: '#F1F5F9', padding: 18, borderRadius: 18, marginBottom: 12, fontWeight: '600' },
  saveBtn: { backgroundColor: '#10B981', padding: 22, borderRadius: 20, alignItems: 'center' },
  saveText: { color: '#FFF', fontWeight: '900', fontSize: 18 },
  calendarOverlayRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  calendarOverlayCard: {
    width: '100%',
    backgroundColor: '#FFF',
    borderRadius: 28,
    overflow: 'hidden',
    paddingTop: 8,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
  },
  calendarOverlayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  calendarOverlayTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  calendarOverlayClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
});