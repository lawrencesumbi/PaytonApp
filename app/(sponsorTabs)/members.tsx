// app/(sponsorTabs)/members.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../../lib/supabase';

/* ---------- Design Tokens — same as allowance.tsx ---------- */
const COLORS = {
  screenTeal: '#1F4F59',
  brand: '#173D45',
  green: '#77f3a54b',
  surface: '#FFFFFF',
  pillBg: '#F1F5F9',
  softTint: '#F3F7F6',
  ink: '#173D45',
  inkSoft: '#64748B',
  muted: '#94A3B8',
  accent: '#C9A227',
  danger: '#EF4444',
  dangerSoft: '#FEF2F2',
  pendingSoft: '#FEF9C3',
  pendingText: '#A16207',
};

const CARD_THEMES = [
  { bg: '#EAF6F7', text: '#1F4F59' },
  { bg: '#F4F8E8', text: '#213502' },
  { bg: '#FAFAD8', text: '#213502' },
];

interface Spender {
  id: string; 
  spender_id: string; 
  name: string;
  email: string;
  status: string;
  avatarUrl?: string;
}

export default function MembersScreen() {
  const router = useRouter();
  const [spenderEmail, setSpenderEmail] = useState('');
  const [members, setMembers] = useState<Spender[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false); // Added refresh state

  const fetchMembers = async (isRefreshing = false) => {
    try {
      if (!isRefreshing) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('sponsor_spenders')
        .select(`
          id, status, spender_id,
          profiles!spender_id ( full_name, email, avatar_url )
        `)
        .eq('sponsor_id', user.id);

      if (error) throw error;

      const formattedMembers = (data || []).map((item: any) => ({
        id: item.id,
        spender_id: item.spender_id,
        name: item.profiles?.full_name || 'No Name',
        email: item.profiles?.email || 'No Email',
        avatarUrl: item.profiles?.avatar_url || null,
        status: item.status
      }));

      setMembers(formattedMembers);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to fetch members.");
    } finally {
      setLoading(false);
      setRefreshing(false); // Ensure refreshing stops
    }
  };

  // Pull-to-refresh handler
  const onRefresh = () => {
    setRefreshing(true);
    fetchMembers(true);
  };

  useEffect(() => { fetchMembers(); }, []);

  const handleInviteSpender = async () => {
    const emailToInvite = spenderEmail.trim();
    if (!emailToInvite) return;

    try {
      setSubmitting(true);
      const { data: { user: currentSponsor } } = await supabase.auth.getUser();
      if (!currentSponsor) return;

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, role')
        .ilike('email', emailToInvite);

      if (profileError) {
        Alert.alert("Supabase Error ❌", profileError.message);
        return;
      }

      if (!profileData || profileData.length === 0) {
        Alert.alert("Not Found", `Could not find account for "${emailToInvite}".`);
        return;
      }

      const targetSpender = profileData[0];
      if (targetSpender.id === currentSponsor.id || targetSpender.role !== 'Spender') {
        Alert.alert("Action Denied", "Ineligible user profile account type.");
        return;
      }

      const { error: insertError } = await supabase
        .from('sponsor_spenders')
        .insert([{ sponsor_id: currentSponsor.id, spender_id: targetSpender.id, status: 'pending' }]);

      if (insertError) {
        Alert.alert("Action Denied", "Spender already linked to an account.");
        return;
      }

      Alert.alert("Success 🎉", `Invitation sent to ${emailToInvite}!`);
      setSpenderEmail('');
      fetchMembers();
    } catch (error: any) {
      Alert.alert("Error", error.message || "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveMember = (item: Spender) => {
    Alert.alert(
      "Remove Member",
      `Are you sure you want to remove ${item.name} from your spenders?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Remove", 
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('sponsor_spenders')
                .delete()
                .eq('id', item.id);

              if (error) throw error;

              Alert.alert("Removed", `${item.name} has been removed successfully.`);
              fetchMembers();
            } catch (error: any) {
              Alert.alert("Error", error.message || "Failed to remove member.");
            }
          }
        }
      ]
    );
  };

  const handleSelectMember = (item: Spender) => {
    if (item.status === 'pending') {
      Alert.alert("Pending Connection", "Spender hasn't accepted your link request yet.");
      return;
    }
    router.push({
      pathname: '/allowance',
      params: { 
        spenderId: item.spender_id, 
        spenderName: item.name, 
        spenderEmail: item.email,
        spenderAvatarUrl: item.avatarUrl || '' // Idagdag kini aron madala ang picture!
      }
    });
  };

  return (
    <View style={styles.screenBg}>
      <StatusBar style="light" />

      {/* Thin teal strip */}
      <View style={styles.headerRow} />

      {/* White rounded sheet */}
      <View style={styles.whiteSheet}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.content}>

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.titleText}>Manage Members</Text>
              <Text style={styles.subtitleText}>Link your spenders to configure their allocations.</Text>
            </View>

            {/* Add New Spender */}
            <Text style={styles.sectionTitle}>Add New Spender</Text>
            <View style={styles.rowInput}>
              <TextInput
                style={[styles.pillInput, { flex: 1 }]}
                placeholder="Enter registered spender email"
                placeholderTextColor={COLORS.muted}
                value={spenderEmail}
                onChangeText={setSpenderEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TouchableOpacity 
                style={styles.inviteButton} 
                activeOpacity={0.85}
                onPress={handleInviteSpender}
                disabled={submitting || !spenderEmail.trim()}
              >
                {submitting ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="send" size={16} color="#FFF" />}
              </TouchableOpacity>
            </View>

            {/* Section Header */}
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Your Connected Spenders</Text>
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>{members.length}</Text>
              </View>
            </View>

            {loading ? (
              <ActivityIndicator size="large" color={COLORS.brand} style={{ marginTop: 40 }} />
            ) : (
              <FlatList
                data={members}
                keyExtractor={(item) => item.id}
                numColumns={2}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listScrollContent}
                columnWrapperStyle={styles.gridRow}
                refreshing={refreshing} // Connected pull-to-refresh state
                onRefresh={onRefresh}     // Connected pull-to-refresh action trigger
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <View style={styles.emptyIconCircle}>
                      <Ionicons name="people-outline" size={24} color={COLORS.brand} />
                    </View>
                    <Text style={styles.emptyTitle}>No members yet</Text>
                    <Text style={styles.emptySubtitle}>Enter a spender's email address above to link them.</Text>
                  </View>
                }
                renderItem={({ item, index }) => {
                  const theme = CARD_THEMES[index % CARD_THEMES.length];
                  return (
                    <View style={[styles.gridCard, { backgroundColor: theme.bg }]}>
                      <TouchableOpacity
                        style={styles.gridDeleteButton}
                        onPress={() => handleRemoveMember(item)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={14} color={COLORS.danger} />
                      </TouchableOpacity>

                      <TouchableOpacity activeOpacity={0.8} onPress={() => handleSelectMember(item)}>
                        <View style={styles.gridAvatarCircle}>
                          {item.avatarUrl ? (
                            <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
                          ) : (
                            <Text style={[styles.avatarText, { color: theme.text }]}>
                              {item.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                            </Text>
                          )}
                        </View>

                        <Text style={[styles.gridMemberName, { color: theme.text }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={styles.gridMemberEmail} numberOfLines={1}>
                          {item.email}
                        </Text>

                        {item.status === 'pending' ? (
                          <View style={[styles.gridStatusBadge, styles.badgePending]}>
                            <Text style={[styles.statusText, { color: COLORS.pendingText }]}>Pending</Text>
                          </View>
                        ) : (
                          <View style={[styles.gridStatusBadge, styles.badgeActive]}>
                            <Text style={[styles.statusText, { color: theme.text }]}>Active</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenBg: {
    flex: 1,
    backgroundColor: COLORS.screenTeal,
  },
  headerRow: {
    height: 40,
  },

  whiteSheet: {
    flex: 1,
    backgroundColor: COLORS.softTint,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },

  header: {
    marginBottom: 20,
  },
  titleText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  subtitleText: {
    fontSize: 14,
    color: COLORS.inkSoft,
    marginTop: 4,
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },

  rowInput: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  pillInput: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 20,
    borderRadius: 30,
    height: 50,
    color: COLORS.brand,
    fontSize: 14,
    fontWeight: '500',
  },
  inviteButton: {
    width: 50,
    height: 50,
    backgroundColor: COLORS.brand,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  countPill: {
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: COLORS.softTint,
  },
  countPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.brand,
  },

  listScrollContent: {
    paddingBottom: 32,
  },
  gridRow: {
    gap: 12,
    marginBottom: 12,
  },
  gridCard: {
    flex: 1,
    borderRadius: 24,
    padding: 16,
    minHeight: 150,
    justifyContent: 'space-between',
  },
  gridDeleteButton: {
    alignSelf: 'flex-end',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.dangerSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  gridAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 10,
  },
  gridMemberName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  gridMemberEmail: {
    fontSize: 11,
    color: COLORS.inkSoft,
    marginTop: 2,
  },
  gridStatusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 10,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  avatarText: {
    color: COLORS.brand,
    fontWeight: '700',
    fontSize: 13,
  },
  badgePending: {
    backgroundColor: COLORS.pendingSoft,
  },
  badgeActive: {
    backgroundColor: COLORS.green,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    backgroundColor: COLORS.softTint,
    borderRadius: 24,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: COLORS.brand,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.brand,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.inkSoft,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
    paddingHorizontal: 20,
  },
});