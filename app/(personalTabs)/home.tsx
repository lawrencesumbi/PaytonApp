import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SERIF_FONT = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });

const ARC_SECTION_HEIGHT = 320;
const ARC_RADIUS = 320;
const ARC_CENTER_X = -190;
const ARC_ANGLE_SPAN = 55;
const ARC_LABEL_OFFSET = 30;
const ARC_LABEL_ROTATION_SCALE = 2.2;
const ARC_CARD_LEFT = 195;
const ARC_CARD_HALF_HEIGHT = 44;
const ARC_NUMBER_GAP_X = 14;
const ARC_NUMBER_OFFSET_Y = 19;

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function buildArcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polarPoint(cx, cy, r, startDeg);
  const end = polarPoint(cx, cy, r, endDeg);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}
const ARC_PATH_D = buildArcPath(ARC_CENTER_X, ARC_SECTION_HEIGHT / 2, ARC_RADIUS, -ARC_ANGLE_SPAN / 2, ARC_ANGLE_SPAN / 2);

interface Category {
  id: string;
  name: string;
  icon?: string;
  color?: string;
}

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
  const [categories, setCategories] = useState<Category[]>([]);
  const [markedDates, setMarkedDates] = useState<any>({});

  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [calendarModalMounted, setCalendarModalMounted] = useState(false);
  const calendarAnim = useRef(new Animated.Value(0)).current;
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMonthDate] = useState(new Date());

  // ========== ADD REMINDER MODAL STATE ==========
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [focusedIndex, setFocusedIndex] = useState(0);
  const cardFade = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const arcEntrance = useRef(new Animated.Value(0)).current;

  // ─── Native-driven animated values for dot & card positioning ───
  // These replace the old dotPos state + focusProgress listener pattern
  // which wasn't native-drivable and caused janky card transitions.
  const dotX = useRef(new Animated.Value(0)).current;
  const dotY = useRef(new Animated.Value(ARC_SECTION_HEIGHT / 2)).current;
  const cardYAnim = useRef(new Animated.Value(ARC_SECTION_HEIGHT / 2 - ARC_CARD_HALF_HEIGHT)).current;

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

  useEffect(() => {
    Animated.timing(arcEntrance, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const getStatusInfo = (item: Reminder) => {
    if (item.status === 'paid') return { label: 'Paid', color: '#10B981' };
    if (item.due_date < todayStr) return { label: 'Overdue', color: '#EF4444' };
    if (item.status === 'pending') return { label: 'Unpaid', color: '#64748B' };
    return { label: 'Upcoming', color: '#64748B' };
  };

  const filteredReminders = reminders
    .filter((r) => r.status === 'pending' || r.due_date >= todayStr)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const activeMonth = selectedDate ? new Date(selectedDate) : viewMonthDate;
  const currentMonthName = activeMonth.toLocaleDateString('en-US', { month: 'long' });

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: catData } = await supabase
        .from('categories')
        .select('id, name, icon, color')
        .or(`user_id.is.null,user_id.eq.${user.id}`);
      if (catData) setCategories(catData);
      const { data: remData } = await supabase.from('reminders').select(`id, title, amount, category_id, due_date, status, categories ( name, icon, color )`).eq('user_id', user.id);
      if (remData) {
        setReminders(remData as any);
        const markers: any = {};
        remData.forEach((r) => markers[r.due_date] = { marked: true });
        setMarkedDates(markers);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const arcItems = useMemo(
    () => filteredReminders.slice(0, 5),
    [filteredReminders]
  );

  const arcPositions = useMemo(() => {
    const count = arcItems.length;
    return arcItems.map((_, i) => {
      const theta = count > 1
        ? -ARC_ANGLE_SPAN / 2 + (ARC_ANGLE_SPAN * i) / (count - 1)
        : 0;
      const rad = (theta * Math.PI) / 180;

      const dotXVal = ARC_CENTER_X + ARC_RADIUS * Math.cos(rad);
      const dotYVal = ARC_SECTION_HEIGHT / 2 + ARC_RADIUS * Math.sin(rad);

      const labelRadius = ARC_RADIUS + ARC_LABEL_OFFSET;
      const labelX = ARC_CENTER_X + labelRadius * Math.cos(rad);
      const labelY = ARC_SECTION_HEIGHT / 2 + labelRadius * Math.sin(rad);

      return { theta, dotX: dotXVal, dotY: dotYVal, labelX, labelY };
    });
  }, [arcItems]);

  // Snap animated values to the first item's position when arc items change
  useEffect(() => {
    setFocusedIndex(0);
    if (arcPositions.length >= 1) {
      const pos = arcPositions[0];
      dotX.setValue(pos.dotX);
      dotY.setValue(pos.dotY);
      cardYAnim.setValue(pos.dotY - ARC_CARD_HALF_HEIGHT);
    }
  }, [arcItems.map((r) => r.id).join(',')]);

  // ─── Properly sequenced focus animation ───
  // 1. Fade out the detail card (100ms)
  // 2. In parallel: spring-move dot/number/card to new position + fade card back in
  // All native-driven — no JS-thread listener hacks.
  const handleFocusDot = (i: number) => {
    if (i === focusedIndex || !arcPositions[i]) return;
    const target = arcPositions[i];
    const targetCardY = target.dotY - ARC_CARD_HALF_HEIGHT;

    Animated.sequence([
      // Step 1: Fade out the card so the position change is hidden
      Animated.timing(cardFade, { toValue: 0, duration: 100, useNativeDriver: true }),
      // Step 2: Move everything to the new position while fading card back in
      Animated.parallel([
        Animated.spring(dotX, { toValue: target.dotX, useNativeDriver: true, friction: 8, tension: 50 }),
        Animated.spring(dotY, { toValue: target.dotY, useNativeDriver: true, friction: 8, tension: 50 }),
        Animated.spring(cardYAnim, { toValue: targetCardY, useNativeDriver: true, friction: 8, tension: 50 }),
        Animated.timing(cardFade, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
    ]).start();

    setFocusedIndex(i);
    setSelectedDate(arcItems[i].due_date);
  };

  const focusedReminder = arcItems[focusedIndex];

  const formatDayLabel = (dateStr: string) => {
    const d = new Date(dateStr).getDate();
    return d < 10 ? `0${d}` : `${d}`;
  };

  const sections = useMemo(() => {
    const groups: Record<string, Reminder[]> = {};
    filteredReminders.forEach((r) => {
      if (!groups[r.due_date]) groups[r.due_date] = [];
      groups[r.due_date].push(r);
    });
    return Object.keys(groups)
      .sort()
      .map((date) => ({
        title: date === todayStr ? 'Today' : new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
        data: groups[date],
      }));
  }, [filteredReminders, todayStr]);

  // ========== ADD REMINDER MODAL HELPERS ==========
  const resetForm = () => {
    setTitle('');
    setAmount('');
    setSelectedCategoryId('');
    setDueDate('');
    setShowDatePicker(false);
    setFormError(null);
  };

  const closeModal = () => {
    resetForm();
    setModalVisible(false);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setFormError('Please enter a bill name');
      return;
    }
    const numericAmount = parseFloat(amount);
    if (!amount || isNaN(numericAmount) || numericAmount <= 0) {
      setFormError('Please enter a valid amount');
      return;
    }
    if (!selectedCategoryId) {
      setFormError('Please choose a category');
      return;
    }
    if (!dueDate) {
      setFormError('Please choose a due date');
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('reminders').insert({
        user_id: user.id,
        title: title.trim(),
        amount: numericAmount,
        category_id: selectedCategoryId,
        due_date: dueDate,
        status: 'pending',
      });
      if (error) throw error;
      closeModal();
      fetchData();
    } catch (e) {
      console.error(e);
      setFormError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatPickedDate = (dateStr: string) => {
    if (!dateStr) return 'Select date';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  if (loading && reminders.length === 0) {
    return (
      <View style={[styles.container, styles.centeredContent, { paddingTop: Math.max(insets.top, 25) }]}>
        <StatusBar style="dark" />
        <ActivityIndicator color="#10B981" />
        <Text style={styles.loadingLabel}>Loading reminders…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 25) }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.65}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color="#334155" />
        </TouchableOpacity>
        <Text style={[styles.screenTitle, styles.screenTitleCentered]}>Reminders</Text>
        <TouchableOpacity
          style={styles.calendarIconBtn}
          onPress={() => setShowFullCalendar(true)}
          activeOpacity={0.65}
          accessibilityRole="button"
          accessibilityLabel="Open full calendar"
        >
          <Ionicons name="calendar-outline" size={19} color="#334155" />
        </TouchableOpacity>
      </View>

      {/* ========== RADIAL ARC CALENDAR ========== */}
      {arcItems.length === 0 ? (
        <View style={styles.arcEmptyState}>
          <Ionicons name="checkmark-done-circle-outline" size={36} color="#7E9F0E" />
          <Text style={styles.arcEmptyText}>All clear! No upcoming dues.</Text>
        </View>
      ) : (
        <Animated.View
          style={[
            styles.arcSection,
            {
              opacity: arcEntrance,
              transform: [
                { translateY: arcEntrance.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }
              ],
            },
          ]}
        >
          <Svg
            width={SCREEN_WIDTH - 40}
            height={ARC_SECTION_HEIGHT}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          >
            <Path d={ARC_PATH_D} stroke="#B7C68B" strokeWidth={1.5} fill="none" strokeLinecap="round" />
          </Svg>

          {/* Non-focused dots with diagonally-rotated labels outward */}
          {arcItems.map((item, i) => {
            if (i === focusedIndex) return null;
            const pos = arcPositions[i];
            const rotateDeg = pos.theta * ARC_LABEL_ROTATION_SCALE;
            return (
              <React.Fragment key={item.id}>
                <TouchableOpacity
                  style={[
                    styles.arcLabelTouchable,
                    {
                      left: pos.labelX - 15,
                      top: pos.labelY - 11,
                      transform: [{ rotate: `${rotateDeg}deg` }],
                    },
                  ]}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  onPress={() => handleFocusDot(i)}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={`View reminder due on day ${formatDayLabel(item.due_date)}`}
                >
                  <Text style={styles.arcLabelText}>
                    {formatDayLabel(item.due_date)}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.arcDot, { left: pos.dotX - 9, top: pos.dotY - 9 }]}
                  hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                  onPress={() => handleFocusDot(i)}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={`View reminder due on day ${formatDayLabel(item.due_date)}`}
                >
                  <View style={styles.arcDotInner} />
                </TouchableOpacity>
              </React.Fragment>
            );
          })}

          {/* ─── Focused dot — positioned via native-driven transform ─── */}
          <Animated.View
            style={[
              styles.arcDotFocusedPosition,
              {
                left: 0,
                top: 0,
                transform: [
                  { translateX: Animated.subtract(dotX, 12) },
                  { translateY: Animated.subtract(dotY, 12) },
                ],
              },
            ]}
            pointerEvents="none"
          >
            <Animated.View style={[styles.arcDotFocused, { transform: [{ scale: pulseAnim }] }]}>
              <View style={styles.arcDotFocusedInner} />
            </Animated.View>
          </Animated.View>

          {/* ─── Focused big number — positioned via native-driven transform ─── */}
          <Animated.View
            style={[
              styles.arcFocusedWrap,
              {
                left: 0,
                top: 0,
                transform: [
                  { translateX: Animated.add(dotX, ARC_NUMBER_GAP_X) },
                  { translateY: Animated.subtract(dotY, ARC_NUMBER_OFFSET_Y) },
                  { scale: pulseAnim },
                ],
              },
            ]}
            pointerEvents="none"
          >
            <Text style={styles.arcFocusedText}>
              {focusedReminder ? formatDayLabel(focusedReminder.due_date) : ''}
            </Text>
          </Animated.View>

          {/* ─── Detail card — positioned via native-driven transform, opacity sequenced ─── */}
          {focusedReminder && (
            <Animated.View
              style={[
                styles.arcCardWrap,
                {
                  top: 0,
                  transform: [{ translateY: cardYAnim }],
                  opacity: cardFade,
                },
              ]}
            >
              <View style={styles.arcCardTopRow}>
                <Text style={styles.arcCardDate}>
                  {new Date(focusedReminder.due_date).toLocaleDateString('en-US', {
                    month: 'long',
                    day: '2-digit',
                    year: 'numeric',
                  })}
                </Text>
                <Text style={[styles.arcCardStatus, { color: getStatusInfo(focusedReminder).color }]}>
                  {getStatusInfo(focusedReminder).label}
                </Text>
              </View>
              <Text style={styles.arcCardAmount}>
                ₱{focusedReminder.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Text>
              <Text style={styles.arcCardTitle}>{focusedReminder.title}</Text>
            </Animated.View>
          )}
        </Animated.View>
      )}

      {/* ========== FULL MONTH CALENDAR OVERLAY ========== */}
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
                  { scale: calendarAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
                  { translateY: calendarAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
                ],
              },
            ]}
          >
            <View style={styles.calendarOverlayHeader}>
              <Text style={styles.calendarOverlayTitle}>{currentMonthName}</Text>
              <TouchableOpacity
                style={styles.calendarOverlayClose}
                onPress={() => setShowFullCalendar(false)}
                activeOpacity={0.65}
                accessibilityRole="button"
                accessibilityLabel="Close calendar"
              >
                <Ionicons name="close" size={20} color="#0F172A" />
              </TouchableOpacity>
            </View>
            <Calendar
              onDayPress={(d: any) => {
                setSelectedDate(d.dateString);
                setShowFullCalendar(false);
              }}
              current={selectedDate || activeMonth.toISOString().split('T')[0]}
              markedDates={{
                ...markedDates,
                [selectedDate || '']: { selected: true, selectedColor: '#16A34A' },
              }}
              theme={{ todayTextColor: '#16A34A', dotColor: '#7E9F0E' }}
            />
          </Animated.View>
        </View>
      </Modal>

      {/* ========== ALL UPCOMING DUE PANEL ========== */}
      <View style={styles.panel}>
        <View style={styles.panelHandle} />
        <Text style={styles.panelTitle}>All Upcoming Due</Text>

        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderSectionHeader={({ section: { title } }) => (
            <Text style={styles.sectionHeaderText}>{title}</Text>
          )}
          renderItem={({ item }) => {
            const status = getStatusInfo(item);
            return (
              <View style={styles.reminderCard}>
                <View style={[styles.verticalBar, { backgroundColor: item.categories?.color || '#10B981' }]} />
                <View style={styles.cardBody}>
                  <Text style={styles.cardDateLabel}>
                    {new Date(item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                  <Text style={styles.cardAmount}>
                    ₱{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </Text>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                </View>
                <Text style={[styles.statusPlain, { color: status.color }]}>{status.label}</Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <TouchableOpacity
              style={styles.emptyCard}
              onPress={() => setModalVisible(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Add your first reminder"
            >
              <View style={[styles.verticalBar, { backgroundColor: '#CBD5E1' }]} />
              <View style={styles.cardBody}>
                <Text style={styles.emptyText}>No reminders scheduled yet</Text>
              </View>
              <Ionicons name="add-circle" size={32} color="#10B981" />
            </TouchableOpacity>
          }
        />
      </View>

      {/* ========== ADD REMINDER MODAL ========== */}
      <Modal animationType="slide" transparent visible={modalVisible} onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalBg}>
            <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.modalHeaderRow}>
                  <Text style={styles.modalTitle}>Add Reminder</Text>
                  <TouchableOpacity
                    style={styles.modalCloseBtn}
                    onPress={closeModal}
                    activeOpacity={0.65}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={18} color="#334155" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.fieldLabel}>Bill Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Electricity"
                  placeholderTextColor="#94A3B8"
                  value={title}
                  onChangeText={setTitle}
                />

                <Text style={styles.fieldLabel}>Amount</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={setAmount}
                />

                <Text style={styles.fieldLabel}>Category</Text>
                {categories.length === 0 ? (
                  <Text style={styles.noCategoriesText}>No categories yet — add one in Settings.</Text>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.categoryScroll}
                    contentContainerStyle={{ paddingRight: 8 }}
                  >
                    {categories.map((cat) => {
                      const selected = cat.id === selectedCategoryId;
                      const dotColor = cat.color || '#10B981';
                      return (
                        <TouchableOpacity
                          key={cat.id}
                          style={[
                            styles.categoryChip,
                            selected && { backgroundColor: dotColor + '1A', borderColor: dotColor },
                          ]}
                          onPress={() => setSelectedCategoryId(cat.id)}
                        >
                          <View style={[styles.categoryDot, { backgroundColor: dotColor }]} />
                          <Text
                            style={[
                              styles.categoryChipText,
                              selected && { color: dotColor, fontWeight: '800' },
                            ]}
                          >
                            {cat.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}

                <Text style={styles.fieldLabel}>Due Date</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker((v) => !v)}
                >
                  <Ionicons name="calendar-outline" size={17} color="#334155" />
                  <Text style={[styles.dateButtonText, !dueDate && { color: '#94A3B8' }]}>
                    {formatPickedDate(dueDate)}
                  </Text>
                  <Ionicons name={showDatePicker ? 'chevron-up' : 'chevron-down'} size={16} color="#94A3B8" />
                </TouchableOpacity>

                {showDatePicker && (
                  <View style={styles.datePickerWrap}>
                    <Calendar
                      onDayPress={(d: any) => {
                        setDueDate(d.dateString);
                        setShowDatePicker(false);
                      }}
                      current={dueDate || todayStr}
                      markedDates={{
                        [dueDate || '']: { selected: true, selectedColor: '#16A34A' },
                      }}
                      theme={{ todayTextColor: '#16A34A', dotColor: '#7E9F0E' }}
                    />
                  </View>
                )}

                {formError && <Text style={styles.errorText}>{formError}</Text>}

                <TouchableOpacity
                  style={[styles.saveBtn, submitting && { opacity: 0.7 }]}
                  onPress={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveText}>Save Schedule</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={closeModal}
                  style={{ marginTop: 15, alignItems: 'center' }}
                >
                  <Text style={{ color: '#64748B', fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  centeredContent: { justifyContent: 'center', alignItems: 'center' },
  loadingLabel: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
  },

  // ========== HEADER ==========
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  screenTitle: { fontSize: 24, fontWeight: '900', color: '#0F172A' },
  screenTitleCentered: { flex: 1, textAlign: 'center' },

  arcEmptyState: {
    height: ARC_SECTION_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  arcEmptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 12,
  },

  // ========== RADIAL ARC ==========
  arcSection: {
    height: ARC_SECTION_HEIGHT,
    marginTop: 8,
    position: 'relative',
    overflow: 'visible',
    paddingHorizontal: 20,
  },

  arcDot: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#1E3A2F',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#2D5A3F',
  },
  arcDotInner: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#5EEAD4',
  },

  arcDotFocusedPosition: {
    position: 'absolute',
    width: 24,
    height: 24,
  },
  arcDotFocused: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arcDotFocusedInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },

  arcLabelTouchable: {
    position: 'absolute',
    width: 30,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arcLabelText: {
    fontFamily: SERIF_FONT,
    fontStyle: 'italic',
    fontSize: 15,
    fontWeight: '600',
    color: '#94A3B8',
  },

  arcFocusedWrap: {
    position: 'absolute',
  },
  arcFocusedText: {
    fontFamily: SERIF_FONT,
    fontSize: 32,
    fontWeight: '800',
    color: '#14532D',
  },

  arcCardWrap: {
    position: 'absolute',
    left: ARC_CARD_LEFT,
    right: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#CBD5C0',
    paddingVertical: 12,
  },
  arcCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  arcCardDate: { fontFamily: SERIF_FONT, fontSize: 13, color: '#64748B' },
  arcCardStatus: { fontFamily: SERIF_FONT, fontSize: 12, fontWeight: '700' },
  arcCardAmount: { fontFamily: SERIF_FONT, fontSize: 26, fontWeight: '800', color: '#0F172A', marginTop: 6 },
  arcCardTitle: { fontFamily: SERIF_FONT, fontStyle: 'italic', fontSize: 14, color: '#475569', marginTop: 2 },

  // ========== FULL MONTH CALENDAR OVERLAY ==========
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

  // ========== ALL UPCOMING DUE PANEL ==========
  panel: {
    flex: 1,
    backgroundColor: '#EFF1EF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: 16,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  panelHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C7CBC9',
    alignSelf: 'center',
    marginBottom: 14,
  },
  panelTitle: { fontSize: 15, fontWeight: '700', color: '#334155', marginBottom: 12 },
  sectionHeaderText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 14,
    marginBottom: 10,
    backgroundColor: '#EFF1EF',
  },

  reminderCard: {
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.07)',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    height: 100,
    paddingRight: 20,
  },
  verticalBar: { width: 4, height: '55%', borderRadius: 2, marginLeft: 4 },
  cardBody: { flex: 1, paddingLeft: 14 },
  cardDateLabel: { fontSize: 12, fontWeight: '700', color: '#94A3B8', marginBottom: 2 },
  cardAmount: { fontFamily: SERIF_FONT, fontSize: 20, fontWeight: '800', color: '#0F172A' },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#475569', marginTop: 1 },
  emptyText: { fontSize: 15, fontWeight: '800', color: '#475569' },
  statusPlain: { fontSize: 12, fontWeight: '700', marginRight: 4 },

  // ========== ADD REMINDER MODAL ==========
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    padding: 32,
    maxHeight: '88%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginTop: 16,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#E6E9EE',
  },
  noCategoriesText: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  categoryScroll: {
    flexDirection: 'row',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E6E9EE',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginRight: 8,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 7,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E6E9EE',
  },
  dateButtonText: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '600',
    marginLeft: 10,
  },
  datePickerWrap: {
    marginTop: 10,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E6E9EE',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 14,
  },
  saveBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  saveText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});