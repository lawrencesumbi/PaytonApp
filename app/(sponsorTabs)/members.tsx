// app/(sponsorTabs)/members.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  StatusBar as NativeStatusBar,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../../lib/supabase';

/* ---------- Match Design Tokens Perfectly from home.tsx ---------- */
const COLORS = {
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  ink: '#0F5143', 
  inkSoft: '#475569',
  muted: '#94A3B8',
  hairline: '#ECEFF3',
  brand: '#0F5143',
  brandSoft: '#E8F2EF',
  brandBorder: '#D2E7E1',
  accent: '#C9A227', 
  danger: '#DC2626',
};

const SHADOW = {
  card: Platform.select({
    ios: {
      shadowColor: '#0F5143',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.05,
      shadowRadius: 14,
    },
    android: { elevation: 2 },
  }),
};

interface Spender {
  id: string; 
  spender_id: string; 
  name: string;
  email: string;
  status: string;
}

export default function MembersScreen() {
  const router = useRouter();
  const [spenderEmail, setSpenderEmail] = useState('');
  const [members, setMembers] = useState<Spender[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

    const { data, error } = await supabase
        .from('sponsor_spenders')
        .select(`
          id, status, spender_id,
          profiles!spender_id ( full_name, email )
        `)
        .eq('sponsor_id', user.id);

      if (error) throw error;

      const formattedMembers = (data || []).map((item: any) => ({
        id: item.id,
        spender_id: item.spender_id,
        name: item.profiles?.full_name || 'No Name',
        email: item.profiles?.email || 'No Email',
        status: item.status
      }));

      setMembers(formattedMembers);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to fetch members.");
    } finally {
      setLoading(false);
    }
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
              fetchMembers(); // refresh ang list
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
      params: { spenderId: item.spender_id, spenderName: item.name, spenderEmail: item.email }
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.content}>
          
          <View style={styles.header}>
            <Text style={styles.titleText}>Manage Members</Text>
            <Text style={styles.subtitleText}>Link your spenders to configure their allocations.</Text>
          </View>

          <View style={[styles.cardShadow, SHADOW.card, { marginBottom: 24 }]}>
            <View style={styles.inviteContainer}>
              <Text style={styles.formLabel}>Add New Spender</Text>
              <View style={styles.rowInput}>
                <TextInput
                  style={styles.input}
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
                  {submitting ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="send" size={14} color="#FFF" />}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Connected Spenders</Text>
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
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listScrollContent}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              ListEmptyComponent={
                <View style={[styles.cardShadow, SHADOW.card]}>
                  <View style={styles.emptyContainer}>
                    <View style={styles.emptyIconCircle}>
                      <Ionicons name="people-outline" size={26} color={COLORS.brand} />
                    </View>
                    <Text style={styles.emptyTitle}>No members yet</Text>
                    <Text style={styles.emptySubtitle}>Enter a spender's email address above to link them.</Text>
                  </View>
                </View>
              }
              renderItem={({ item }) => (
                <View style={[styles.cardShadow, SHADOW.card]}>
                  <View style={styles.memberCardContainer}>
                    <TouchableOpacity style={styles.memberCard} activeOpacity={0.75} onPress={() => handleSelectMember(item)}>
                      <View style={styles.cardLeft}>
                        <View style={styles.avatarCircle}>
                          <Text style={styles.avatarText}>
                            {item.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.infoBlock}>
                          <Text style={styles.memberName} numberOfLines={1}>{item.name}</Text>
                          <Text style={styles.memberEmail} numberOfLines={1}>{item.email}</Text>
                        </View>
                      </View>
                      <View style={styles.cardRight}>
                        {item.status === 'pending' ? (
                          <View style={[styles.statusBadge, styles.badgePending]}>
                            <Text style={[styles.statusText, { color: COLORS.accent }]}>Pending</Text>
                          </View>
                        ) : (
                          <View style={[styles.statusBadge, styles.badgeActive]}>
                            <Ionicons name="chevron-forward" size={14} color={COLORS.brand} />
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>

                    {/* Delete Button Area */}
                    <TouchableOpacity 
                      style={styles.deleteButton} 
                      onPress={() => handleRemoveMember(item)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0 },
  content: { flex: 1, paddingHorizontal: 20 },
  header: { marginBottom: 22, marginTop: 12 },
  titleText: { fontSize: 22, fontWeight: '700', color: COLORS.brand, letterSpacing: -0.5 },
  subtitleText: { fontSize: 13, color: COLORS.inkSoft, marginTop: 4 },
  cardShadow: { borderRadius: 16 },
  inviteContainer: { backgroundColor: COLORS.surface, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: COLORS.hairline },
  formLabel: { fontSize: 11, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  rowInput: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: COLORS.hairline, height: 44, fontSize: 13, fontWeight: '500', color: COLORS.brand },
  inviteButton: { width: 44, height: 44, backgroundColor: COLORS.brand, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1 },
  countPill: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: COLORS.brandSoft, borderWidth: 1, borderColor: COLORS.brandBorder },
  countPillText: { fontSize: 10, fontWeight: '700', color: COLORS.brand },
  listScrollContent: { paddingBottom: 40 },
  memberCardContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.hairline, paddingRight: 8 },
  memberCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flex: 1, padding: 12 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 },
  avatarCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.brandSoft, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.brandBorder },
  avatarText: { color: COLORS.brand, fontWeight: '700', fontSize: 12 },
  infoBlock: { marginLeft: 12, flex: 1 },
  memberName: { fontSize: 14, fontWeight: '700', color: COLORS.brand, letterSpacing: -0.1 },
  memberEmail: { fontSize: 12, color: COLORS.inkSoft, marginTop: 1 },
  cardRight: { justifyContent: 'center', alignItems: 'flex-end' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgePending: { backgroundColor: '#FEF9C3' },
  badgeActive: { padding: 4 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  deleteButton: { padding: 10, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { alignItems: 'center', padding: 28, backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.hairline },
  emptyIconCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.brandSoft, justifyContent: 'center', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: COLORS.brandBorder },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: COLORS.brand },
  emptySubtitle: { fontSize: 12, color: COLORS.inkSoft, textAlign: 'center', marginTop: 4, lineHeight: 18 }
});