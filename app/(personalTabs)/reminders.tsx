import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
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

// ============================================================================
// RADIAL ARC GEOMETRY
//
// With 5 items and ANGLE_SPAN=55°, angles go from -27.5° to +27.5°.
// Center of arc section is at y=160 (half of 320).
//
// Verified dot positions (all on screen, relative to arcSection's own
// padded content box — see arcSection.paddingHorizontal below):
//   Item 0 (top):    dotX ≈ 94,  dotY ≈ 12
//   Item 1:          dotX ≈ 118, dotY ≈ 72
//   Item 2 (middle): dotX ≈ 130, dotY ≈ 160
//   Item 3:          dotX ≈ 118, dotY ≈ 248
//   Item 4 (bottom): dotX ≈ 94,  dotY ≈ 308
//
// Label offset is NEGATIVE so labels sit LEFT of dots (like reference).
// ============================================================================
const ARC_SECTION_HEIGHT = 320;
const ARC_RADIUS = 320;
const ARC_CENTER_X = -190;
const ARC_ANGLE_SPAN = 55;
const ARC_LABEL_OFFSET = -32;
// Bumped from 148 → 195, and the line-start gap from 18 → 32: at the
// bulging middle dot (dotX≈130), the big focused number (≈40-46px wide)
// was landing almost flush against where the card began, causing the
// number/card overlap seen in the screenshot. This gives real breathing
// room for the number + a visible dashed segment before the card starts.
const ARC_CARD_LEFT = 195;
const ARC_CARD_HALF_HEIGHT = 52;
const ARC_LINE_START_GAP = 32;

// Precomputed once from the same center/radius/angle values the dots use,
// so the visual guide-curve passes through them exactly, instead of being
// a hand-eyeballed CSS border-radius shape that doesn't quite line up.
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
  const focusedIndexAnim = useRef(new Animated.Value(0)).current;
  const cardFade = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const arcEntrance = useRef(new Animated.Value(0)).current;

  // Stable Animated.Values (created ONCE, never recreated)
  const animOffset22 = useMemo(() => new Animated.Value(22), []);
  const animOffset24 = useMemo(() => new Animated.Value(24), []);
  const animLineGap = useMemo(() => new Animated.Value(ARC_LINE_START_GAP), []);
  const animCardLeft = useMemo(() => new Animated.Value(ARC_CARD_LEFT), []);
  const animCardHalf = useMemo(() => new Animated.Value(ARC_CARD_HALF_HEIGHT), []);

  // For single-item fallback
  const singleItemX = useRef(new Animated.Value(0)).current;
  const singleItemY = useRef(new Animated.Value(ARC_SECTION_HEIGHT / 2)).current;

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
    if (item.status === 'pending') return { label: 'Unpaid', color: '#F59E0B' };
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

  // Calculate positions for each dot on the arc
  const arcPositions = useMemo(() => {
    const count = arcItems.length;
    return arcItems.map((_, i) => {
      const theta = count > 1
        ? -ARC_ANGLE_SPAN / 2 + (ARC_ANGLE_SPAN * i) / (count - 1)
        : 0;
      const rad = (theta * Math.PI) / 180;

      const dotX = ARC_CENTER_X + ARC_RADIUS * Math.cos(rad);
      const dotY = ARC_SECTION_HEIGHT / 2 + ARC_RADIUS * Math.sin(rad);

      // Labels are at a SMALLER radius (further left), matching the reference
      const labelRadius = ARC_RADIUS + ARC_LABEL_OFFSET;
      const labelX = ARC_CENTER_X + labelRadius * Math.cos(rad);
      const labelY = ARC_SECTION_HEIGHT / 2 + labelRadius * Math.sin(rad);

      return { theta, dotX, dotY, labelX, labelY };
    });
  }, [arcItems]);

  // Update single-item refs when positions change
  useEffect(() => {
    if (arcPositions.length >= 1) {
      singleItemX.setValue(arcPositions[0].dotX);
      singleItemY.setValue(arcPositions[0].dotY);
    }
  }, [arcPositions]);

  // Reset focus when items change
  useEffect(() => {
    setFocusedIndex(0);
    focusedIndexAnim.setValue(0);
  }, [arcItems.map((r) => r.id).join(',')]);

  const handleFocusDot = (i: number) => {
    if (i === focusedIndex) return;
    Animated.sequence([
      Animated.timing(cardFade, { toValue: 0, duration: 100, useNativeDriver: true }),
      Animated.timing(cardFade, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    Animated.spring(focusedIndexAnim, {
      toValue: i,
      useNativeDriver: false,
      friction: 8,
      tension: 50,
    }).start();
    setFocusedIndex(i);
    setSelectedDate(arcItems[i].due_date);
  };

  // Interpolate focused position along the arc
  const focusedX = arcPositions.length > 1
    ? focusedIndexAnim.interpolate({
        inputRange: arcPositions.map((_, i) => i),
        outputRange: arcPositions.map((p) => p.dotX),
      })
    : singleItemX;

  const focusedY = arcPositions.length > 1
    ? focusedIndexAnim.interpolate({
        inputRange: arcPositions.map((_, i) => i),
        outputRange: arcPositions.map((p) => p.dotY),
      })
    : singleItemY;

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
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 25) }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#334155" />
        </TouchableOpacity>
        <Text style={[styles.screenTitle, styles.screenTitleCentered]}>Reminders</Text>
        <TouchableOpacity style={styles.calendarIconBtn} onPress={() => setShowFullCalendar(true)}>
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
          {/* The actual arc curve — a real SVG path through the same
              center/radius/angle math the dots use below, so it always
              lines up with them exactly. */}
          <Svg
            width={SCREEN_WIDTH - 40}
            height={ARC_SECTION_HEIGHT}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          >
            <Path d={ARC_PATH_D} stroke="#CBD9BB" strokeWidth={2} fill="none" strokeLinecap="round" />
          </Svg>

          {/* Non-focused dots with labels to their left */}
          {arcItems.map((item, i) => {
            if (i === focusedIndex) return null;
            const pos = arcPositions[i];
            return (
              <React.Fragment key={item.id}>
                {/* Small day number label (LEFT of dot) */}
                <TouchableOpacity
                  style={[
                    styles.arcLabelTouchable,
                    { left: pos.labelX - 14, top: pos.labelY - 11 },
                  ]}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  onPress={() => handleFocusDot(i)}
                >
                  <Text style={styles.arcLabelText}>
                    {formatDayLabel(item.due_date)}
                  </Text>
                </TouchableOpacity>

                {/* Dot */}
                <TouchableOpacity
                  style={[styles.arcDot, { left: pos.dotX - 9, top: pos.dotY - 9 }]}
                  hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                  onPress={() => handleFocusDot(i)}
                >
                  <View style={styles.arcDotInner} />
                </TouchableOpacity>
              </React.Fragment>
            );
          })}

          {/* Focused dot — anchors the big number to the arc so the chain
              of dots stays visually continuous instead of showing a gap
              where the focused item's dot used to be. */}
          <Animated.View
            style={[
              styles.arcDotFocused,
              {
                left: Animated.subtract(focusedX, 12),
                top: Animated.subtract(focusedY, 12),
                transform: [{ scale: pulseAnim }],
              },
            ]}
            pointerEvents="none"
          >
            <View style={styles.arcDotFocusedInner} />
          </Animated.View>

          {/* Dashed connector line from focused dot to card */}
          <Animated.View
            style={[
              styles.arcLineContainer,
              {
                top: focusedY,
                left: Animated.add(focusedX, animLineGap),
                width: Animated.subtract(animCardLeft, Animated.add(focusedX, animLineGap)),
              },
            ]}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <React.Fragment key={i}>
                <View style={styles.dashSegment} />
                <View style={styles.dashGap} />
              </React.Fragment>
            ))}
          </Animated.View>

          {/* Focused big number (slides along arc) */}
          <Animated.View
            style={[
              styles.arcFocusedWrap,
              {
                left: Animated.subtract(focusedX, animOffset22),
                top: Animated.subtract(focusedY, animOffset24),
              },
            ]}
            pointerEvents="none"
          >
            <Animated.Text style={[styles.arcFocusedText, { transform: [{ scale: pulseAnim }] }]}>
              {focusedReminder ? formatDayLabel(focusedReminder.due_date) : ''}
            </Animated.Text>
          </Animated.View>

          {/* Detail card with green accent */}
          {focusedReminder && (
            <Animated.View
              style={[
                styles.arcCardWrap,
                { top: Animated.subtract(focusedY, animCardHalf) },
              ]}
            >
              <Animated.View style={{ opacity: cardFade, flexDirection: 'row' }}>
                <View style={styles.arcCardAccent} />
                <View style={styles.arcCardInner}>
                  <View style={styles.arcCardTopRow}>
                    <Text style={styles.arcCardDate}>
                      {new Date(focusedReminder.due_date).toLocaleDateString('en-US', {
                        month: 'long',
                        day: '2-digit',
                        year: 'numeric',
                      })}
                    </Text>
                    <View
                      style={[
                        styles.arcCardStatusBadge,
                        { backgroundColor: getStatusInfo(focusedReminder).color + '1A' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.arcCardStatus,
                          { color: getStatusInfo(focusedReminder).color },
                        ]}
                      >
                        {getStatusInfo(focusedReminder).label}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.arcCardAmount}>
                    ₱{focusedReminder.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </Text>
                  <Text style={styles.arcCardTitle}>{focusedReminder.title}</Text>
                </View>
              </Animated.View>
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
                <View style={[styles.statusPill, { backgroundColor: status.color + '15' }]}>
                  <Text style={[styles.actionTagText, { color: status.color }]}>{status.label}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <TouchableOpacity style={styles.emptyCard} onPress={() => setModalVisible(true)}>
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
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Add Reminder</Text>
                <TouchableOpacity style={styles.modalCloseBtn} onPress={closeModal}>
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
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  centeredContent: { justifyContent: 'center', alignItems: 'center' },

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
  // Buttons on either side are equal (44px), so flex:1 + textAlign:'center'
  // centers the title in the true remaining space instead of relying on
  // space-between, which only centers the gap, not the text itself.
  screenTitleCentered: { flex: 1, textAlign: 'center' },

  // Empty state for arc section
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
    overflow: 'visible', // allows off-parent-boundary positioning
    // Matches headerRow/panel's own 20px inset — absolutely-positioned
    // children are positioned relative to the PADDING edge in RN, so this
    // shifts the whole arc's coordinate space by +20 without needing to
    // touch any of the dot-position math above.
    paddingHorizontal: 20,
  },

  // Non-focused dots
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
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  arcDotInner: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#5EEAD4',
  },

  // Focused dot — bigger, glowing, keeps the arc's dot-chain unbroken
  // at the currently selected item instead of leaving a gap.
  arcDotFocused: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 5,
  },
  arcDotFocusedInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },

  // Day number labels (left of dots)
  arcLabelTouchable: {
    position: 'absolute',
    width: 30,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arcLabelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: -0.3,
  },

  // Dashed connector line
  arcLineContainer: {
    position: 'absolute',
    height: 2,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  dashSegment: {
    width: 7,
    height: 2,
    backgroundColor: '#7E9F0E',
    borderRadius: 1,
  },
  dashGap: {
    width: 5,
    height: 2,
  },

  // Focused big number
  arcFocusedWrap: {
    position: 'absolute',
  },
  arcFocusedText: {
    fontSize: 36,
    fontWeight: '900',
    color: '#14532D',
    letterSpacing: -1,
  },

  // Detail card — positioning-only wrapper (left/right define the actual
  // screen bounds instead of a hardcoded width, so it can't overflow on
  // narrower phones); the visible white card + shadow live on arcCardInner.
  arcCardWrap: {
    position: 'absolute',
    left: ARC_CARD_LEFT,
    right: 0,
  },
  arcCardAccent: {
    width: 4,
    borderRadius: 2,
    backgroundColor: '#16A34A',
    marginRight: 14,
  },
  arcCardInner: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  arcCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  arcCardDate: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  arcCardStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  arcCardStatus: { fontSize: 11, fontWeight: '800' },
  arcCardAmount: { fontSize: 24, fontWeight: '900', color: '#0F172A', marginTop: 6 },
  arcCardTitle: { fontSize: 13, fontWeight: '600', color: '#475569', marginTop: 2 },

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
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingRight: 16,
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    height: 100,
    paddingRight: 20,
  },
  verticalBar: { width: 4, height: '55%', borderRadius: 2, marginLeft: 18 },
  cardBody: { flex: 1, paddingLeft: 16 },
  cardDateLabel: { fontSize: 12, fontWeight: '700', color: '#94A3B8', marginBottom: 2 },
  cardAmount: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#475569', marginTop: 1 },
  emptyText: { fontSize: 15, fontWeight: '800', color: '#475569' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  actionTagText: { fontSize: 12, fontWeight: '800' },

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