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
  start_date: string;
  end_date: string;
  spender_name: string;
}

/* ---------- Design Tokens ---------- */
const COLORS = {
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  ink: '#0B1220',
  inkSoft: '#475569',
  muted: '#94A3B8',
  hairline: '#ECEFF3',
  brand: '#0F5143',
  brandSoft: '#E8F2EF',
  brandBorder: '#D2E7E1',
  accent: '#C9A227', // refined gold instead of neon yellow
  danger: '#DC2626',
};

const SHADOW = {
  hero: Platform.select({
    ios: {
      shadowColor: '#0F5143',
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.22,
      shadowRadius: 28,
    },
    android: { elevation: 12 },
  }),
  card: Platform.select({
    ios: {
      shadowColor: '#0B1220',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.05,
      shadowRadius: 14,
    },
    android: { elevation: 2 },
  }),
};

export default function HomeScreen() {
  const router = useRouter();
  const [allowances, setAllowances] = useState<AllowanceDashboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalAllocated, setTotalAllocated] = useState(0);
  const [sponsorProfile, setSponsorProfile] = useState<{ full_name: string; avatar_url: string | null } | null>(null);

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

      const { data, error } = await supabase
        .from('allowances')
        .select(`
          id, allowance_name, amount, start_date, end_date,
          profiles!allowances_spender_id_fkey (full_name)
        `)
        .eq('sponsor_id', user.id)
        .order('received_at', { ascending: false });

      if (error) throw error;

      const formatted = (data || []).map((item: any) => ({
        id: item.id,
        allowance_name: item.allowance_name,
        amount: Number(item.amount),
        start_date: item.start_date,
        end_date: item.end_date,
        spender_name: item.profiles?.full_name || 'Unknown',
      }));

      setAllowances(formatted);
      setTotalAllocated(formatted.reduce((s, i) => s + i.amount, 0));
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>

        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.welcomeText}>Welcome back</Text>
            <Text style={styles.userName} numberOfLines={1}>
              {sponsorProfile?.full_name || 'Sponsor'}
            </Text>
          </View>
          {sponsorProfile?.avatar_url ? (
            <Image source={{ uri: sponsorProfile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
        </View>

        {/* Hero Card */}
        <View style={[styles.heroShadow, SHADOW.hero]}>
          <LinearGradient
            colors={['#13614F', '#0F5143', '#0A2E26']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            {/* subtle decorative orbs */}
            <View style={styles.orbLg} />
            <View style={styles.orbSm} />

            <View style={styles.heroTopRow}>
              <Text style={styles.heroLabel}>Total Allocated</Text>
              <View style={styles.heroBrandMark}>
                <View style={styles.heroBrandDot} />
                <Text style={styles.heroBrandText}>Sponsor</Text>
              </View>
            </View>

            <Text style={styles.heroAmount}>
              ₱{totalAllocated.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </Text>

            <View style={styles.heroDivider} />

            <View style={styles.heroFooter}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>Recipients</Text>
                <Text style={styles.heroStatValue}>{allowances.length}</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>Status</Text>
                <View style={styles.statusRow}>
                  <View style={styles.statusDot} />
                  <Text style={styles.heroStatValue}>Active</Text>
                </View>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Allowances</Text>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{allowances.length}</Text>
          </View>
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator size="large" color={COLORS.brand} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={allowances}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listScrollContent}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[COLORS.brand]}
                tintColor={COLORS.brand}
              />
            }
            ListEmptyComponent={
              <View style={[styles.cardShadow, SHADOW.card]}>
                <View style={styles.emptyContainer}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons name="wallet-outline" size={28} color={COLORS.brand} />
                  </View>
                  <Text style={styles.emptyTitle}>No active allowances</Text>
                  <Text style={styles.emptySubtitle}>
                    Head to the Members tab to select a person and set up their first allowance.
                  </Text>
                  <TouchableOpacity
                    style={styles.navigateBtn}
                    activeOpacity={0.85}
                    onPress={() => router.push('/(sponsorTabs)/members')}
                  >
                    <Text style={styles.navigateBtnText}>Go to Members</Text>
                    <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>
            }
            renderItem={({ item }) => (
              <View style={[styles.cardShadow, SHADOW.card]}>
                <View style={styles.allowanceCard}>
                  <View style={styles.cardLeft}>
                    <View style={styles.iconContainer}>
                      <Ionicons name="wallet" size={16} color={COLORS.brand} />
                    </View>
                    <View style={styles.infoBlock}>
                      <Text style={styles.allowanceName} numberOfLines={1}>
                        {item.allowance_name}
                      </Text>
                      <Text style={styles.spenderName} numberOfLines={1}>
                        {item.spender_name}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardRight}>
                    <Text style={styles.cardAmountText}>
                      ₱{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Text>
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        onPress={() => handleEdit(item)}
                        style={styles.actionBtn}
                        activeOpacity={0.6}
                      >
                        <Ionicons name="pencil" size={13} color={COLORS.inkSoft} />
                      </TouchableOpacity>
                      <View style={styles.actionDivider} />
                      <TouchableOpacity
                        onPress={() => handleDelete(item.id)}
                        style={styles.actionBtn}
                        activeOpacity={0.6}
                      >
                        <Ionicons name="trash" size={13} color={COLORS.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            )}
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

  /* Header */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 22,
    marginTop: 12,
  },
  welcomeText: { fontSize: 12, color: COLORS.muted, fontWeight: '500', letterSpacing: 0.2 },
  userName: { fontSize: 22, fontWeight: '700', color: COLORS.ink, letterSpacing: -0.5, marginTop: 2 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: COLORS.hairline },
  avatarPlaceholder: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.brandSoft,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.brandBorder,
  },
  avatarInitials: { color: COLORS.brand, fontWeight: '700', fontSize: 13, letterSpacing: 0.3 },

  /* Hero */
  heroShadow: { borderRadius: 22, marginBottom: 28 },
  heroCard: {
    padding: 22,
    borderRadius: 22,
    overflow: 'hidden',
  },
  orbLg: {
    position: 'absolute',
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.04)',
    top: -90, right: -70,
  },
  orbSm: {
    position: 'absolute',
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(201,162,39,0.08)',
    bottom: -50, left: -40,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  heroBrandMark: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroBrandDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: COLORS.accent, marginRight: 6,
  },
  heroBrandText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10, fontWeight: '700', letterSpacing: 0.6,
  },
  heroAmount: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1,
    marginTop: 4,
  },
  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 18,
  },
  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroStat: { flex: 1 },
  heroStatDivider: {
    width: 1, height: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 14,
  },
  heroStatLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10, fontWeight: '600',
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 4,
  },
  heroStatValue: {
    color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: -0.2,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#4ADE80', marginRight: 6,
  },

  /* Section header */
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 14, paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  countPill: {
    marginLeft: 8,
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: COLORS.brandSoft,
    borderWidth: 1, borderColor: COLORS.brandBorder,
  },
  countPillText: {
    fontSize: 10, fontWeight: '700',
    color: COLORS.brand, letterSpacing: 0.3,
  },

  listScrollContent: { paddingBottom: 110 },

  /* List item */
  cardShadow: { borderRadius: 16 },
  allowanceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.hairline,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 12 },
  iconContainer: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.brandSoft,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.brandBorder,
  },
  infoBlock: { marginLeft: 12, flex: 1 },
  allowanceName: {
    fontSize: 14, fontWeight: '700',
    color: COLORS.ink, letterSpacing: -0.2,
  },
  spenderName: {
    fontSize: 12, color: COLORS.inkSoft,
    fontWeight: '500', marginTop: 2,
  },

  cardRight: { alignItems: 'flex-end', justifyContent: 'space-between', height: 44 },
  cardAmountText: {
    fontSize: 14, fontWeight: '700',
    color: COLORS.ink, letterSpacing: -0.1,
  },
  actionRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.hairline,
    alignItems: 'center', height: 24, paddingHorizontal: 2,
  },
  actionBtn: { width: 24, height: 20, justifyContent: 'center', alignItems: 'center' },
  actionDivider: { width: 1, height: 12, backgroundColor: COLORS.hairline },

  /* Empty */
  emptyContainer: {
    alignItems: 'center', padding: 28,
    backgroundColor: COLORS.surface, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.hairline,
  },
  emptyIconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.brandSoft,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1, borderColor: COLORS.brandBorder,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  emptySubtitle: {
    fontSize: 13, color: COLORS.inkSoft,
    textAlign: 'center', marginTop: 6, marginBottom: 20,
    lineHeight: 18, paddingHorizontal: 16,
  },
  navigateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.ink,
    paddingVertical: 11, paddingHorizontal: 18,
    borderRadius: 10,
  },
  navigateBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12, letterSpacing: 0.2 },
});