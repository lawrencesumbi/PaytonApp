// app/(sponsorTabs)/home.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StatusBar as NativeStatusBar,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

interface AllowanceDashboardItem {
  id: string;
  allowance_name: string;
  amount: number;
  spent_amount: number;
  start_date: string;
  end_date: string;
  spender_id: string;
  spender_name: string;
  spender_avatar_url: string | null;
  isActive: boolean;
}

interface ConnectedSpender {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

/* ---------- Design Tokens ---------- */
const COLORS = {
  deepTeal: '#1F4F59',
  cyan: '#54C9CC',
  cyanLight: '#7EDDE0',
  olive: '#7EA00E',
  yellowGreen: '#DCD964',
  darkOlive: '#213502',
  bg: '#F4F8F4',
  card: '#FFFFFF',
  white: '#FFFFFF',
  textMuted: '#7E8F82',
  danger: '#DC2626',
  warning: '#EA580C',
};

/* ---------- Dynamic Themes ---------- */
const CARD_THEMES = [
  { bg: '#EAF6F7', border: '#BBE6E8', text: '#1F4F59' },
  { bg: '#F4F8E8', border: '#DCEBBA', text: '#213502' },
  { bg: '#FAFAD8', border: '#EFEFA9', text: '#213502' },
];

const getCardTheme = (index: number) => {
  return CARD_THEMES[index % CARD_THEMES.length];
};

const SHADOW = {
  hero: Platform.select({
    ios: {
      shadowColor: '#1F4F59',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.18,
      shadowRadius: 16,
    },
    android: { elevation: 5 },
  }),
  card: Platform.select({
    ios: {
      shadowColor: '#1F4F59',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 10,
    },
    android: { elevation: 2 },
  }),
};

export default function HomeScreen() {
  const router = useRouter();
  const [activeAllowances, setActiveAllowances] = useState<AllowanceDashboardItem[]>([]);
  const [connectedSpenders, setConnectedSpenders] = useState<ConnectedSpender[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalAllocated, setTotalAllocated] = useState(0);
  const [totalRemaining, setTotalRemaining] = useState(0);
  const [sponsorProfile, setSponsorProfile] = useState<{ full_name: string; avatar_url: string | null } | null>(null);

  const [selectedSpenderId, setSelectedSpenderId] = useState<string | null>(null);

  const fetchDashboardData = async (isRefreshing = false) => {
    try {
      if (!isRefreshing) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single();
      setSponsorProfile(profile);

      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('allowances')
        .select(`
          id, allowance_name, amount, start_date, end_date, spender_id,
          profiles!allowances_spender_id_fkey (id, full_name, avatar_url),
          expenses (amount)
        `)
        .eq('sponsor_id', user.id)
        .order('start_date', { ascending: false });

      if (error) throw error;

      let calculatedAllocated = 0;
      let calculatedSpent = 0;

      const activeList: AllowanceDashboardItem[] = [];
      const spendersMap = new Map<string, ConnectedSpender>();

      (data || []).forEach((item: any) => {
        const allowanceAmount = Number(item.amount);
        const isActive = item.start_date <= today && item.end_date >= today;

        const spentForAllowance = (item.expenses || []).reduce(
          (sum: number, exp: { amount: number }) => sum + Number(exp.amount),
          0
        );

        if (isActive) {
          calculatedAllocated += allowanceAmount;
          calculatedSpent += spentForAllowance;
        }

        const formattedItem: AllowanceDashboardItem = {
          id: item.id,
          allowance_name: item.allowance_name,
          amount: allowanceAmount,
          spent_amount: spentForAllowance,
          start_date: item.start_date,
          end_date: item.end_date,
          spender_id: item.spender_id,
          spender_name: item.profiles?.full_name || 'Unknown',
          spender_avatar_url: item.profiles?.avatar_url || null,
          isActive,
        };

        if (isActive) {
          activeList.push(formattedItem);
        }

        if (item.profiles && !spendersMap.has(item.profiles.id)) {
          spendersMap.set(item.profiles.id, {
            id: item.profiles.id,
            full_name: item.profiles.full_name || 'Spender',
            avatar_url: item.profiles.avatar_url || null,
          });
        }
      });

      setActiveAllowances(activeList);
      setConnectedSpenders(Array.from(spendersMap.values()));
      setTotalAllocated(calculatedAllocated);
      setTotalRemaining(Math.max(0, calculatedAllocated - calculatedSpent));
    } catch (e: any) {
      console.error('Error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchDashboardData(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDashboardData(true);
  }, []);

  const handleDelete = (id: string) => {
    Alert.alert('Delete Allowance', 'Are you sure you want to delete this?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('allowances').delete().eq('id', id);
          if (error) Alert.alert('Error', 'Failed to delete allowance.');
          else fetchDashboardData();
        },
      },
    ]);
  };

  const handleEdit = (item: AllowanceDashboardItem) =>
    router.push({ pathname: '/allowance', params: { id: item.id } });

  const initials = (sponsorProfile?.full_name || 'S')
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const getFirstName = (fullName: string) => {
    return fullName.trim().split(' ')[0] || fullName;
  };

  const filteredAllowances = selectedSpenderId
    ? activeAllowances.filter(a => a.spender_id === selectedSpenderId)
    : activeAllowances;

  const totalSpent = Math.max(0, totalAllocated - totalRemaining);
  const overallSpentPercent = totalAllocated > 0 ? Math.min(100, Math.round((totalSpent / totalAllocated) * 100)) : 0;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>

        {/* FIXED TOP CONTENT */}
        <View style={styles.fixedTopContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.welcomeText}>Welcome back</Text>
              <Text style={styles.userName} numberOfLines={1}>
                {sponsorProfile?.full_name || 'Sponsor'}
              </Text>
            </View>

            <TouchableOpacity 
              activeOpacity={0.7} 
              onPress={() => router.push('/profile')}
            >
              {sponsorProfile?.avatar_url ? (
                <Image source={{ uri: sponsorProfile.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Balanced Hero Card */}
          <View style={[styles.heroShadow, SHADOW.hero]}>
            <LinearGradient
              colors={['#1F4F59', '#173D45', '#0E272C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <View style={styles.orbLg} />
              <View style={styles.orbSm} />

              <View style={styles.heroTopRow}>
                <Text style={styles.heroLabel}>Allowance Left / Total</Text>
                <View style={styles.heroBrandMark}>
                  <View style={styles.heroBrandDot} />
                  <Text style={styles.heroBrandText}>Sponsor</Text>
                </View>
              </View>

              <View style={styles.heroAmountRow}>
                <Text style={styles.heroRemainingAmount}>
                  ₱{totalRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
                <Text style={styles.heroTotalAmount}>
                  {' / '}₱{totalAllocated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>

              <View style={styles.heroProgressContainer}>
                <View style={styles.heroProgressTrack}>
                  <View style={[styles.heroProgressBar, { width: `${overallSpentPercent}%` }]} />
                </View>
                <View style={styles.heroProgressLabels}>
                  <Text style={styles.heroProgressText}>{overallSpentPercent}% Spent</Text>
                  <Text style={styles.heroProgressText}>₱{totalSpent.toLocaleString()} spent</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Connected Spenders Section */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Connected Spenders</Text>
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>{connectedSpenders.length}</Text>
              </View>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalSpendersContainer}
          >
            <TouchableOpacity
              style={styles.addSpenderItem}
              activeOpacity={0.7}
              onPress={() => router.push('/(sponsorTabs)/members')}
            >
              <View style={styles.addDashedCircle}>
                <Ionicons name="add" size={24} color={COLORS.deepTeal} />
              </View>
              <Text style={styles.addSpenderLabel} numberOfLines={1}>
                Add
              </Text>
            </TouchableOpacity>

            {connectedSpenders.map((spender) => {
              const firstName = getFirstName(spender.full_name);
              const spenderInitials = spender.full_name
                .split(' ')
                .map((w) => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();
              const isSelected = selectedSpenderId === spender.id;

              return (
                <TouchableOpacity
                  key={spender.id}
                  style={styles.spenderHorizontalItem}
                  activeOpacity={0.7}
                  onPress={() =>
                    setSelectedSpenderId(isSelected ? null : spender.id)
                  }
                >
                  <View
                    style={[
                      styles.avatarBorderRing,
                      isSelected && styles.avatarBorderRingActive,
                    ]}
                  >
                    {spender.avatar_url ? (
                      <Image
                        source={{ uri: spender.avatar_url }}
                        style={styles.spenderGridAvatar}
                      />
                    ) : (
                      <View style={styles.spenderGridAvatarPlaceholder}>
                        <Text style={styles.spenderGridInitials}>
                          {spenderInitials}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.spenderGridFirstName,
                      isSelected && styles.spenderGridFirstNameActive,
                    ]}
                    numberOfLines={1}
                  >
                    {firstName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Active Allowances Section Header */}
          <View style={[styles.sectionHeader, { marginTop: 12 }]}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>
                {selectedSpenderId ? 'Filtered Allowances' : 'Active Allowances'}
              </Text>
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>{filteredAllowances.length}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* SCROLLABLE ONLY FOR ACTIVE ALLOWANCES */}
        {loading && !refreshing ? (
          <ActivityIndicator size="large" color={COLORS.deepTeal} style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={filteredAllowances}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listScrollContent}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[COLORS.deepTeal]}
                tintColor={COLORS.deepTeal}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyCardContainer}>
                <View style={styles.emptyContainer}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons name="wallet-outline" size={22} color={COLORS.deepTeal} />
                  </View>
                  <Text style={styles.emptyTitle}>
                    {selectedSpenderId ? 'No allowances for this spender' : 'No active allowances'}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {selectedSpenderId
                      ? 'This member does not have any active allowances set up yet.'
                      : 'Head to the Members tab to select a person and set up their first allowance.'}
                  </Text>
                  <TouchableOpacity
                    style={styles.navigateBtn}
                    activeOpacity={0.85}
                    onPress={() => router.push('/(sponsorTabs)/members')}
                  >
                    <Text style={styles.navigateBtnText}>Go to Members</Text>
                    <Ionicons name="arrow-forward" size={13} color={COLORS.white} />
                  </TouchableOpacity>
                </View>
              </View>
            }
            renderItem={({ item, index }) => {
              const theme = getCardTheme(index);
              const spenderInitials = item.spender_name
                .split(' ')
                .map((w) => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();

              const remainingAmount = Math.max(0, item.amount - item.spent_amount);
              const percentUsed = item.amount > 0 
                ? Math.min(100, Math.round((item.spent_amount / item.amount) * 100)) 
                : 0;

              return (
                <View 
                  style={[
                    styles.allowanceCard, 
                    SHADOW.card,
                    { backgroundColor: theme.bg, borderColor: theme.border },
                    !item.isActive && styles.inactiveCard
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.spenderInfoRow}>
                      {item.spender_avatar_url ? (
                        <Image source={{ uri: item.spender_avatar_url }} style={styles.spenderAvatar} />
                      ) : (
                        <View style={styles.spenderAvatarPlaceholder}>
                          <Text style={styles.spenderInitials}>{spenderInitials}</Text>
                        </View>
                      )}

                      <View style={styles.titleColumn}>
                        <Text style={[styles.allowanceNameText, { color: theme.text }]} numberOfLines={1}>
                          {item.allowance_name}
                        </Text>
                        <Text style={styles.spenderSubtext} numberOfLines={1}>
                          For: {item.spender_name}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.cardActions}>
                      <TouchableOpacity onPress={() => handleEdit(item)} style={styles.actionButton} activeOpacity={0.6}>
                        <Ionicons name="pencil-outline" size={15} color={theme.text} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionButton} activeOpacity={0.6}>
                        <Ionicons name="trash-outline" size={15} color={COLORS.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.amountContainer}>
                    <View style={styles.amountBlock}>
                      <Text style={styles.amountLabel}>ALLOCATED</Text>
                      <Text style={[styles.amountValue, { color: theme.text }]}>
                        ₱{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>

                    <View style={styles.amountDivider} />

                    <View style={styles.amountBlock}>
                      <Text style={styles.amountLabel}>REMAINING</Text>
                      <Text style={[styles.amountValue, { color: theme.text }]}>
                        ₱{remainingAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.progressSection}>
                    <View style={styles.progressTrack}>
                      <View 
                        style={[
                          styles.progressBarFill, 
                          { 
                            width: `${percentUsed}%`,
                            backgroundColor: percentUsed > 80 ? COLORS.warning : COLORS.deepTeal
                          }
                        ]} 
                      />
                    </View>
                    <View style={styles.progressTextRow}>
                      <Text style={styles.progressSubtext}>₱{item.spent_amount.toLocaleString()} spent</Text>
                      <Text style={styles.progressPercentText}>{percentUsed}%</Text>
                    </View>
                  </View>

                  <View style={styles.cardFooter}>
                    <Ionicons name="calendar-outline" size={12} color={COLORS.textMuted} />
                    <Text style={styles.dateText}>
                      {item.start_date} to {item.end_date}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0,
  },
  content: { flex: 1, paddingHorizontal: 20 },

  fixedTopContainer: {
    backgroundColor: COLORS.bg,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 10,
  },
  welcomeText: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500', letterSpacing: 0.2 },
  userName: { fontSize: 18, fontWeight: '700', color: COLORS.darkOlive, letterSpacing: -0.5, marginTop: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0' },
  avatarPlaceholder: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CARD_THEMES[0].bg,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.cyan,
  },
  avatarInitials: { color: COLORS.deepTeal, fontWeight: '700', fontSize: 11, letterSpacing: 0.3 },

  /* Hero Card */
  heroShadow: { borderRadius: 18, marginBottom: 14 },
  heroCard: {
    padding: 18,
    borderRadius: 18,
    overflow: 'hidden',
  },
  orbLg: {
    position: 'absolute',
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(84, 201, 204, 0.15)',
    top: -60, right: -40,
  },
  orbSm: {
    position: 'absolute',
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(220, 217, 100, 0.15)',
    bottom: -30, left: -20,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  heroBrandMark: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  heroBrandDot: {
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: COLORS.yellowGreen, marginRight: 5,
  },
  heroBrandText: {
    color: '#FFFFFF',
    fontSize: 9, fontWeight: '700', letterSpacing: 0.5,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  heroRemainingAmount: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  heroTotalAmount: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.4,
  },

  /* Hero Progress Bar */
  heroProgressContainer: { marginTop: 12 },
  heroProgressTrack: {
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  heroProgressBar: {
    height: '100%',
    backgroundColor: COLORS.cyan,
    borderRadius: 3,
  },
  heroProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  heroProgressText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
  },

  /* Section Header */
  sectionHeader: {
    flexDirection: 'row', 
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8, paddingHorizontal: 2,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: {
    fontSize: 11, fontWeight: '700',
    color: COLORS.darkOlive,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  countPill: {
    marginLeft: 6,
    paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: CARD_THEMES[0].bg,
    borderWidth: 1, borderColor: COLORS.cyanLight,
  },
  countPillText: {
    fontSize: 9, fontWeight: '700',
    color: COLORS.deepTeal, letterSpacing: 0.2,
  },

  listScrollContent: { paddingBottom: 80, paddingTop: 4 },

  /* Allowance Card Layout */
  inactiveCard: { opacity: 0.6 },
  allowanceCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spenderInfoRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  spenderAvatar: { width: 32, height: 32, borderRadius: 16 },
  spenderAvatarPlaceholder: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.cyanLight,
    justifyContent: 'center', alignItems: 'center',
  },
  spenderInitials: { color: COLORS.deepTeal, fontWeight: '700', fontSize: 10 },
  titleColumn: { marginLeft: 8, flex: 1 },
  allowanceNameText: {
    fontSize: 14, fontWeight: '700',
    letterSpacing: -0.2,
  },
  spenderSubtext: {
    fontSize: 10, color: COLORS.textMuted,
    fontWeight: '500', marginTop: 1,
  },
  cardActions: { flexDirection: 'row', gap: 4 },
  actionButton: { padding: 4 },

  amountContainer: {
    flexDirection: 'row',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  amountBlock: { flex: 1 },
  amountDivider: { width: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginHorizontal: 10 },
  amountLabel: {
    fontSize: 8, fontWeight: '700',
    color: COLORS.textMuted, letterSpacing: 0.8,
  },
  amountValue: {
    fontSize: 14, fontWeight: '700',
    marginTop: 1, letterSpacing: -0.3,
  },

  /* Card Progress Bar */
  progressSection: { marginTop: 10 },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  progressSubtext: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  progressPercentText: {
    fontSize: 9,
    color: COLORS.darkOlive,
    fontWeight: '700',
  },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  dateText: {
    fontSize: 9, color: COLORS.textMuted,
    fontWeight: '500', letterSpacing: 0.1,
  },

  /* Connected Spenders Larger Horizontal Grid */
  horizontalSpendersContainer: {
    paddingVertical: 4,
    gap: 14,
  },
  addSpenderItem: {
    alignItems: 'center',
    width: 60,
  },
  addDashedCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: COLORS.deepTeal,
    borderStyle: 'dashed',
    backgroundColor: CARD_THEMES[0].bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addSpenderLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.deepTeal,
    marginTop: 4,
    textAlign: 'center',
  },
  spenderHorizontalItem: {
    alignItems: 'center',
    width: 60,
  },
  avatarBorderRing: {
    padding: 2,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarBorderRingActive: {
    borderColor: COLORS.deepTeal,
  },
  spenderGridAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  spenderGridAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.cyanLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spenderGridInitials: {
    color: COLORS.deepTeal,
    fontWeight: '700',
    fontSize: 14,
  },
  spenderGridFirstName: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textMuted,
    marginTop: 3,
    textAlign: 'center',
  },
  spenderGridFirstNameActive: {
    color: COLORS.deepTeal,
    fontWeight: '700',
  },

  /* Empty */
  emptyCardContainer: {
    borderRadius: 12,
  },
  emptyContainer: {
    alignItems: 'center', padding: 18,
    backgroundColor: COLORS.card, borderRadius: 12,
    borderWidth: 1, borderColor: '#ECEFF3',
  },
  emptyIconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: CARD_THEMES[0].bg,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.cyanLight,
  },
  emptyTitle: { fontSize: 13, fontWeight: '700', color: COLORS.darkOlive },
  emptySubtitle: {
    fontSize: 11, color: COLORS.textMuted,
    textAlign: 'center', marginTop: 3, marginBottom: 12,
    lineHeight: 15, paddingHorizontal: 10,
  },
  navigateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.deepTeal,
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 6,
  },
  navigateBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 10, letterSpacing: 0.2 },
});